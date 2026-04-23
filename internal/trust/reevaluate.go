package trust

import (
	"context"
	"fmt"
	"time"
)

// LeafSource iterates every non-CA, non-anchor certificate — i.e. the
// certs we want to evaluate trust for — yielding each as (fingerprint,
// PEM). The callback is invoked synchronously on the calling goroutine;
// returning an error aborts iteration.
type LeafSource interface {
	ForEachLeafCert(ctx context.Context, fn func(fingerprint, pemStr string) error) error
}

// TrustSink persists verdict maps to the certificate_trust table.
type TrustSink interface {
	UpsertCertificateTrust(ctx context.Context, fingerprint string, verdicts map[string]Result) error
}

// ReevaluatorStore is the full DB surface required to re-evaluate all
// leaves: pool rebuild + leaf iteration + verdict persistence.
type ReevaluatorStore interface {
	PoolSource
	LeafSource
	TrustSink
}

// ReevaluateAll iterates every leaf in the DB, runs Evaluate against the
// current pools, and persists the verdict. Intended to run:
//
//   - once at startup (as a background goroutine so the server is
//     responsive immediately), populating certificate_trust after the
//     000046 migration on first boot and patching any drift caused by
//     missed updates thereafter;
//   - synchronously after rootstore.Refresh, because a root-store delta
//     can flip verdicts for existing leaves without any new ingest.
//
// Persistence is best-effort per leaf — a failing upsert logs a warning
// and continues. An error from the iteration itself is propagated.
func (e *Evaluator) ReevaluateAll(ctx context.Context, store ReevaluatorStore) error {
	start := time.Now()
	var evaluated, persisted, skipped, failed int

	err := store.ForEachLeafCert(ctx, func(fingerprint, pemStr string) error {
		cert, err := parsePEM(pemStr)
		if err != nil {
			skipped++
			return nil // continue — logged via Warn elsewhere would be too noisy
		}
		if cert.IsCA {
			// ForEachLeafCert is expected to exclude CAs, but double-check
			// so a schema drift never accidentally flags intermediates as
			// leaves.
			skipped++
			return nil
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
		// remaining leaf.
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("iterate leaves: %w", err)
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
