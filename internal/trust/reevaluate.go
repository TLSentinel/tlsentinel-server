package trust

import (
	"context"
	"fmt"
	"time"
)

// CertSource iterates every certificate in the DB (leaves, intermediates,
// and anchors) yielding each as (fingerprint, PEM). The callback is
// invoked synchronously on the calling goroutine; returning an error
// aborts iteration.
//
// Anchors and intermediate CAs are included on purpose. Answering "which
// programs trust this certificate" is meaningful for every cert in the
// store, not just end-entity leaves — a user who clicks into an anchor
// on the root-store page expects to see a populated matrix, not a blank
// one that contradicts the page they just came from.
type CertSource interface {
	ForEachCert(ctx context.Context, fn func(fingerprint, pemStr string) error) error
}

// TrustSink persists verdict maps to the certificate_trust table.
type TrustSink interface {
	UpsertCertificateTrust(ctx context.Context, fingerprint string, verdicts map[string]Result) error
}

// ReevaluatorStore is the full DB surface required to re-evaluate every
// cert: pool rebuild + cert iteration + verdict persistence.
type ReevaluatorStore interface {
	PoolSource
	CertSource
	TrustSink
}

// ReevaluateAll iterates every certificate in the DB, runs Evaluate
// against the current pools, and persists the verdict. Intended to run:
//
//   - once at startup (as a background goroutine so the server is
//     responsive immediately), populating certificate_trust after the
//     000046 migration on first boot and patching any drift caused by
//     missed updates thereafter;
//   - synchronously after rootstore.Refresh, because a root-store delta
//     can flip verdicts for existing certs without any new ingest.
//
// Every cert gets a verdict — including anchors and intermediates. An
// anchor Verify()s trivially against any program pool that contains its
// fingerprint; an intermediate chains to whichever roots sign it.
//
// Persistence is best-effort per cert — a failing upsert logs a warning
// and continues. An error from the iteration itself is propagated.
func (e *Evaluator) ReevaluateAll(ctx context.Context, store ReevaluatorStore) error {
	start := time.Now()
	var evaluated, persisted, skipped, failed int

	err := store.ForEachCert(ctx, func(fingerprint, pemStr string) error {
		cert, err := parsePEM(pemStr)
		if err != nil {
			skipped++
			return nil // continue — logged via Warn elsewhere would be too noisy
		}
		verdicts := e.Evaluate(cert)
		evaluated++
		if err := store.UpsertCertificateTrust(ctx, fingerprint, verdicts); err != nil {
			failed++
			e.log.Warn("upsert certificate_trust failed",
				"fingerprint", fingerprint, "error", err)
			return nil
		}
		persisted++
		// Respect cancellation without counting a failure against each
		// remaining cert.
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("iterate certs: %w", err)
	}

	e.log.Info("trust reevaluation complete",
		"evaluated", evaluated,
		"persisted", persisted,
		"skipped", skipped,
		"upsert_failed", failed,
		"duration_ms", time.Since(start).Milliseconds(),
	)
	return nil
}
