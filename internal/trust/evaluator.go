// Package trust holds the in-process certificate trust evaluator.
//
// The evaluator answers "is this leaf trusted by root program X?" for each
// of the four programs tlsentinel tracks (apple, chrome, microsoft, mozilla).
// It delegates to Go's crypto/x509.Verify — signature validation, name
// constraints, EKU, path length, and validity-period checks all come for
// free. This replaces the earlier name-match recursive-CTE path, which
// answered a strictly weaker question ("does the chain end at a trusted
// root's subject name") without enforcing any of those properties.
//
// # Lifecycle
//
//   1. Constructed once at app startup via New.
//   2. LoadPools is called synchronously at startup and after every
//      successful rootstore.Refresh. It reads anchors and non-anchor CAs
//      from the DB and rebuilds the per-program root pools and the shared
//      intermediates pool atomically.
//   3. AddIntermediate is called for every CA cert the scanner ingests.
//      This is how the intermediates pool grows in response to real-world
//      observation, mirroring browser behaviour.
//   4. Evaluate is called per leaf at ingest time (and during
//      ReevaluateAll after a root refresh) to produce a per-program
//      verdict. Callers persist the verdict to the certificate_trust
//      table.
//
// # Memory
//
// At realistic scale the full evaluator state is ~20 MB: ~300 unique
// anchors across four programs (~2 MB parsed) and up to a few thousand
// intermediates (~15 MB). Well within server budget, and all pool lookups
// are O(1) by subject hash. Verify() itself runs in tens of microseconds
// per leaf per program.
//
// # Correctness
//
// The intermediates pool is populated from observed scan chains, which is
// untrusted input. That is safe: x509.Verify treats Intermediates as a
// candidate set only, and every path step is cryptographically verified
// back to a cert in Roots. A forged or malformed "intermediate" cannot
// make a leaf appear trusted — at worst it is a no-op path candidate
// that the verifier discards.
package trust

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Result is the verdict for one leaf against one root program.
type Result struct {
	// Trusted is true when x509.Verify accepted the leaf against this
	// program's root pool, using the shared intermediates pool to bridge
	// the chain.
	Trusted bool
	// Reason is the error string from x509.Verify when Trusted is false,
	// empty when true. Surfaced to users ("Not trusted by Apple: x509:
	// certificate signed by unknown authority") — infinitely more useful
	// than a silent boolean.
	Reason string
}

// PoolSource is the minimal DB surface the evaluator needs to build its
// root pools and seed the intermediates pool. Kept as an interface rather
// than a concrete *db.Store so tests can supply fakes.
type PoolSource interface {
	// ListAnchorPEMsByStore returns a map of root_store_id → slice of PEMs
	// for every certificate flagged as an anchor of that store. A cert
	// that is an anchor of multiple stores appears in each bucket.
	ListAnchorPEMsByStore(ctx context.Context) (map[string][]string, error)
	// ListNonAnchorCertPEMs returns fingerprint → PEM for every certificate
	// where trust_anchor = FALSE. The evaluator parses each, sorts CA certs
	// into the intermediates pool, and ignores leaves (they are evaluated
	// separately via ReevaluateAll).
	ListNonAnchorCertPEMs(ctx context.Context) (map[string]string, error)
}

// Evaluator holds the per-program root pools and the shared intermediates
// pool. Safe for concurrent use — pool reads are RLock-guarded, rebuilds
// take the write lock.
type Evaluator struct {
	mu            sync.RWMutex
	rootPools     map[string]*x509.CertPool
	intermediates *x509.CertPool
	log           *slog.Logger
}

// New returns an evaluator with empty pools. Call LoadPools before
// Evaluate to populate anchors and intermediates from the DB.
func New(log *slog.Logger) *Evaluator {
	if log == nil {
		log = slog.Default()
	}
	return &Evaluator{
		rootPools:     map[string]*x509.CertPool{},
		intermediates: x509.NewCertPool(),
		log:           log,
	}
}

// LoadPools rebuilds all pools from the given source. On error the
// previous pools are retained — partial reloads would leave the evaluator
// in a worse state than no reload. Safe to call repeatedly.
func (e *Evaluator) LoadPools(ctx context.Context, src PoolSource) error {
	start := time.Now()

	anchors, err := src.ListAnchorPEMsByStore(ctx)
	if err != nil {
		return fmt.Errorf("load anchors: %w", err)
	}

	nonAnchors, err := src.ListNonAnchorCertPEMs(ctx)
	if err != nil {
		return fmt.Errorf("load non-anchor certs: %w", err)
	}

	newRoots := make(map[string]*x509.CertPool, len(anchors))
	anchorCount := 0
	for storeID, pems := range anchors {
		pool := x509.NewCertPool()
		for _, p := range pems {
			if cert, err := parsePEM(p); err == nil {
				pool.AddCert(cert)
				anchorCount++
			} else {
				e.log.Warn("anchor PEM unparseable, skipping",
					"store", storeID, "error", err)
			}
		}
		newRoots[storeID] = pool
	}

	newIntermediates := x509.NewCertPool()
	intermediateCount := 0
	for fp, p := range nonAnchors {
		cert, err := parsePEM(p)
		if err != nil {
			e.log.Warn("non-anchor PEM unparseable, skipping",
				"fingerprint", fp, "error", err)
			continue
		}
		if !cert.IsCA {
			continue // leaf, not an intermediate
		}
		newIntermediates.AddCert(cert)
		intermediateCount++
	}

	e.mu.Lock()
	e.rootPools = newRoots
	e.intermediates = newIntermediates
	e.mu.Unlock()

	e.log.Info("trust pools loaded",
		"stores", len(newRoots),
		"anchors", anchorCount,
		"intermediates", intermediateCount,
		"duration_ms", time.Since(start).Milliseconds(),
	)
	return nil
}

// AddIntermediate adds a CA cert to the shared intermediates pool. Called
// by the probe handler for every non-leaf cert the scanner submits.
// No-op for non-CA certs, so it is safe to call for every parsed cert
// without pre-filtering. Concurrent-safe.
func (e *Evaluator) AddIntermediate(cert *x509.Certificate) {
	if cert == nil || !cert.IsCA {
		return
	}
	e.mu.Lock()
	e.intermediates.AddCert(cert)
	e.mu.Unlock()
}

// Evaluate runs x509.Verify against every loaded root pool and returns
// the per-program verdict. The leaf itself is not added to any pool.
//
// CurrentTime is set to time.Now — trust is evaluated "as of now", not
// "as of NotBefore". This matches what a browser does today and what
// users expect when looking at the matrix.
//
// ServerAuth is the only EKU the verifier enforces; the scope of
// tlsentinel is server-facing TLS, so clientAuth-only intermediates
// (which do exist) correctly evaluate as untrusted for this purpose.
func (e *Evaluator) Evaluate(leaf *x509.Certificate) map[string]Result {
	e.mu.RLock()
	defer e.mu.RUnlock()

	out := make(map[string]Result, len(e.rootPools))
	if leaf == nil {
		return out
	}

	for storeID, roots := range e.rootPools {
		_, err := leaf.Verify(x509.VerifyOptions{
			Roots:         roots,
			Intermediates: e.intermediates,
			KeyUsages:     []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
			CurrentTime:   time.Now(),
		})
		out[storeID] = Result{
			Trusted: err == nil,
			Reason:  reasonFor(err),
		}
	}
	return out
}

// Stores returns the sorted list of program IDs the evaluator has pools
// for. Used by callers that need to know which columns to expect in a
// verdict map (e.g. when writing a "no data" row for an uncovered cert).
func (e *Evaluator) Stores() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	out := make([]string, 0, len(e.rootPools))
	for id := range e.rootPools {
		out = append(out, id)
	}
	// Sort for deterministic order.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1] > out[j]; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

// parsePEM decodes a single PEM-encoded certificate.
func parsePEM(pemStr string) (*x509.Certificate, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("no PEM block")
	}
	if block.Type != "CERTIFICATE" {
		return nil, fmt.Errorf("unexpected PEM type %q", block.Type)
	}
	return x509.ParseCertificate(block.Bytes)
}

// reasonFor produces a short, user-facing string from a Verify error.
// We don't strip the "x509:" prefix — it's a recognisable signal and the
// full message often carries the specific failure mode the user needs.
func reasonFor(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
