package db

import (
	"context"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/trust"
)

// ListAnchorPEMsByStore implements trust.PoolSource. Returns
// root_store_id → slice of PEMs for every cert in that store's anchor
// set. A cert that is an anchor of multiple stores appears in each
// bucket, which is what the evaluator needs — it builds one CertPool
// per store.
func (s *Store) ListAnchorPEMsByStore(ctx context.Context) (map[string][]string, error) {
	var rows []struct {
		RootStoreID string `bun:"root_store_id"`
		PEM         string `bun:"pem"`
	}
	err := s.db.NewSelect().
		TableExpr("tlsentinel.root_store_anchors AS rsa").
		ColumnExpr("rsa.root_store_id, c.pem").
		Join("JOIN tlsentinel.certificates c ON c.fingerprint = rsa.fingerprint").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to list anchor PEMs: %w", err)
	}
	out := make(map[string][]string)
	for _, r := range rows {
		out[r.RootStoreID] = append(out[r.RootStoreID], r.PEM)
	}
	return out, nil
}

// ListNonAnchorCertPEMs implements trust.PoolSource. Returns every cert
// where trust_anchor = FALSE keyed by fingerprint. The caller parses
// each, sorts CAs into the intermediates pool, and ignores leaves.
//
// At realistic scale this is ~a few thousand rows, ~15 MB of PEM text.
// If the cert table grows significantly larger than that we'd want a
// streaming iterator; for now one allocation at startup/refresh is fine.
func (s *Store) ListNonAnchorCertPEMs(ctx context.Context) (map[string]string, error) {
	var rows []struct {
		Fingerprint string `bun:"fingerprint"`
		PEM         string `bun:"pem"`
	}
	err := s.db.NewSelect().
		TableExpr("tlsentinel.certificates AS c").
		ColumnExpr("c.fingerprint, c.pem").
		Where("c.trust_anchor = FALSE").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to list non-anchor certs: %w", err)
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		out[r.Fingerprint] = r.PEM
	}
	return out, nil
}

// ForEachCert implements trust.CertSource. Yields every certificate in
// the DB — leaves, intermediates, and anchors alike — so the evaluator
// can produce a verdict for each.
//
// Anchors are included deliberately. A self-signed root whose fingerprint
// is in a program's pool will Verify trivially against that pool
// (chain-of-one), giving the user the honest answer on the cert detail
// page: "trusted by microsoft" for a Microsoft anchor, rather than a
// blank matrix that contradicts what the root-store page just told them.
func (s *Store) ForEachCert(ctx context.Context, fn func(fingerprint, pemStr string) error) error {
	var rows []struct {
		Fingerprint string `bun:"fingerprint"`
		PEM         string `bun:"pem"`
	}
	err := s.db.NewSelect().
		TableExpr("tlsentinel.certificates AS c").
		ColumnExpr("c.fingerprint, c.pem").
		Scan(ctx, &rows)
	if err != nil {
		return fmt.Errorf("failed to iterate certs: %w", err)
	}
	for _, r := range rows {
		if err := fn(r.Fingerprint, r.PEM); err != nil {
			return err
		}
	}
	return nil
}

// UpsertCertificateTrust implements trust.TrustSink. Writes the verdict
// set for one fingerprint. `verdicts` is expected to have one entry per
// enabled root store; extras are persisted verbatim, missing stores keep
// their previous row (if any) untouched — callers should always pass a
// full map from evaluator.Evaluate(leaf) to keep the row set in sync.
//
// Upsert sets evaluated_at to NOW() so "when was this last checked" is
// observable in the DB.
func (s *Store) UpsertCertificateTrust(ctx context.Context, fingerprint string, verdicts map[string]trust.Result) error {
	if len(verdicts) == 0 {
		return nil
	}
	rows := make([]CertificateTrust, 0, len(verdicts))
	for storeID, res := range verdicts {
		rows = append(rows, CertificateTrust{
			Fingerprint: fingerprint,
			RootStoreID: storeID,
			Trusted:     res.Trusted,
			Reason:      res.Reason,
		})
	}
	_, err := s.db.NewInsert().
		Model(&rows).
		On("CONFLICT (fingerprint, root_store_id) DO UPDATE").
		Set("trusted = EXCLUDED.trusted").
		Set("reason = EXCLUDED.reason").
		Set("evaluated_at = NOW()").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to upsert certificate_trust for %s: %w", fingerprint, err)
	}
	return nil
}

// DeleteCertificateTrustForStore removes every verdict for the given root
// store. Called when a store is disabled or removed so stale verdicts
// don't linger in the matrix.
func (s *Store) DeleteCertificateTrustForStore(ctx context.Context, storeID string) error {
	_, err := s.db.NewDelete().
		Model((*CertificateTrust)(nil)).
		Where("root_store_id = ?", storeID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete certificate_trust rows for store %s: %w", storeID, err)
	}
	return nil
}

// --- sanity checks -------------------------------------------------------
// These compile-time assertions pin *Store to the interfaces the trust
// package expects. If any method drifts the build fails here rather than
// at a less obvious call site.
var (
	_ trust.PoolSource       = (*Store)(nil)
	_ trust.CertSource       = (*Store)(nil)
	_ trust.TrustSink        = (*Store)(nil)
	_ trust.ReevaluatorStore = (*Store)(nil)
)
