package db

import (
	"context"
	"fmt"
	"time"

	"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// ListRootStoreSummaries returns each enabled root store along with its
// kind, CCADB source URL, last-refresh time, and anchor count. Ordered by
// name. Drives both the trust-matrix card on cert detail (which uses only
// id+name) and the /root-stores overview page (which uses everything).
func (s *Store) ListRootStoreSummaries(ctx context.Context) ([]models.RootStoreSummary, error) {
	var rows []struct {
		ID          string     `bun:"id"`
		Name        string     `bun:"name"`
		Kind        string     `bun:"kind"`
		SourceURL   string     `bun:"source_url"`
		AnchorCount int        `bun:"anchor_count"`
		UpdatedAt   *time.Time `bun:"updated_at"`
	}
	err := s.db.NewRaw(`
		SELECT rs.id, rs.name, rs.kind, COALESCE(rs.source_url, '') AS source_url,
		       rs.updated_at,
		       (SELECT COUNT(*) FROM tlsentinel.root_store_anchors rsa
		         WHERE rsa.root_store_id = rs.id) AS anchor_count
		FROM tlsentinel.root_stores rs
		WHERE rs.enabled = TRUE
		ORDER BY rs.name
	`).Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("failed to list root store summaries: %w", err)
	}
	out := make([]models.RootStoreSummary, len(rows))
	for i, r := range rows {
		out[i] = models.RootStoreSummary{
			ID:          r.ID,
			Name:        r.Name,
			Kind:        r.Kind,
			SourceURL:   r.SourceURL,
			AnchorCount: r.AnchorCount,
			UpdatedAt:   r.UpdatedAt,
		}
	}
	return out, nil
}

// ListRootStoreAnchors returns a paginated list of trust anchors that belong
// to the given root store, filtered by common-name substring (case-insensitive).
// Ordered by common_name. Returns a zero-item list (not an error) when the
// store has no anchors or is unknown.
func (s *Store) ListRootStoreAnchors(
	ctx context.Context,
	storeID, query string,
	page, pageSize int,
) (models.RootStoreAnchorList, error) {
	offset := (page - 1) * pageSize
	pattern := "%" + query + "%"

	var total int
	countQ := s.db.NewSelect().
		TableExpr("tlsentinel.root_store_anchors AS rsa").
		Join("JOIN tlsentinel.certificates c ON c.fingerprint = rsa.fingerprint").
		Where("rsa.root_store_id = ?", storeID)
	if query != "" {
		countQ = countQ.Where("c.common_name ILIKE ?", pattern)
	}
	if err := countQ.ColumnExpr("COUNT(*)").Scan(ctx, &total); err != nil {
		return models.RootStoreAnchorList{}, fmt.Errorf("failed to count root store anchors: %w", err)
	}

	var rows []struct {
		Fingerprint       string    `bun:"fingerprint"`
		CommonName        string    `bun:"common_name"`
		SubjectOrg        string    `bun:"subject_org"`
		NotAfter          time.Time `bun:"not_after"`
		IssuerFingerprint *string   `bun:"issuer_fingerprint"`
	}
	listQ := s.db.NewSelect().
		TableExpr("tlsentinel.root_store_anchors AS rsa").
		Join("JOIN tlsentinel.certificates c ON c.fingerprint = rsa.fingerprint").
		ColumnExpr("c.fingerprint, c.common_name, c.subject_org, c.not_after, c.issuer_fingerprint").
		Where("rsa.root_store_id = ?", storeID).
		OrderExpr("c.common_name").
		Limit(pageSize).
		Offset(offset)
	if query != "" {
		listQ = listQ.Where("c.common_name ILIKE ?", pattern)
	}
	if err := listQ.Scan(ctx, &rows); err != nil {
		return models.RootStoreAnchorList{}, fmt.Errorf("failed to list root store anchors: %w", err)
	}

	items := make([]models.RootStoreAnchorItem, len(rows))
	for i, r := range rows {
		items[i] = models.RootStoreAnchorItem{
			Fingerprint:       r.Fingerprint,
			CommonName:        r.CommonName,
			SubjectOrg:        r.SubjectOrg,
			NotAfter:          r.NotAfter,
			IssuerFingerprint: r.IssuerFingerprint,
		}
	}
	return models.RootStoreAnchorList{
		Items:      items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	}, nil
}

// GetChainTrustedBy walks the issuer_fingerprint chain from the given leaf
// and returns the distinct root_store_id values whose anchors validate it.
//
// Match semantics: for each cert in the chain, find any known anchor that
// shares the same Subject DN (subject_dn_hash), additionally requiring
// Subject Key ID agreement when both sides publish one. This mirrors
// RFC 5280 path-building — a browser's local trust store entry need only
// match the chain-served cert's Subject + SKI, not its exact fingerprint.
// Without that, cross-signed intermediates (e.g. GTS Root R1 served under
// GlobalSign R1) wouldn't resolve to their canonical anchor copy.
//
// Recursion is depth-bounded; c.fingerprint != chain.fingerprint stops
// self-signed root expansion.
func (s *Store) GetChainTrustedBy(ctx context.Context, leafFingerprint string) ([]string, error) {
	var ids []string
	err := s.db.NewRaw(`
		WITH RECURSIVE chain AS (
			SELECT fingerprint, issuer_fingerprint, subject_key_id, subject_dn_hash, 1 AS depth
			FROM tlsentinel.certificates
			WHERE fingerprint = ?
		  UNION ALL
			SELECT c.fingerprint, c.issuer_fingerprint, c.subject_key_id, c.subject_dn_hash, chain.depth + 1
			FROM tlsentinel.certificates c
			JOIN chain ON c.fingerprint = chain.issuer_fingerprint
			WHERE c.fingerprint != chain.fingerprint
			  AND chain.depth < 10
		)
		SELECT DISTINCT rsa.root_store_id
		FROM chain
		JOIN tlsentinel.certificates anchor_cert
		  ON anchor_cert.subject_dn_hash = chain.subject_dn_hash
		 AND (
			  chain.subject_key_id = ''
		   OR anchor_cert.subject_key_id = ''
		   OR anchor_cert.subject_key_id = chain.subject_key_id
		 )
		JOIN tlsentinel.root_store_anchors rsa
		  ON rsa.fingerprint = anchor_cert.fingerprint
		ORDER BY rsa.root_store_id
	`, leafFingerprint).Scan(ctx, &ids)
	if err != nil {
		return nil, fmt.Errorf("failed to compute trust matrix for %s: %w", leafFingerprint, err)
	}
	return ids, nil
}

// ListEnabledRootStores returns all enabled root stores.
func (s *Store) ListEnabledRootStores(ctx context.Context) ([]RootStore, error) {
	var stores []RootStore
	err := s.db.NewSelect().
		Model(&stores).
		Where("enabled = TRUE").
		Order("id").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list enabled root stores: %w", err)
	}
	return stores, nil
}

// TouchRootStoreUpdatedAt stamps the last successful refresh time.
func (s *Store) TouchRootStoreUpdatedAt(ctx context.Context, id string, at time.Time) error {
	_, err := s.db.NewUpdate().
		Model((*RootStore)(nil)).
		Set("updated_at = ?", at).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to update root store updated_at: %w", err)
	}
	return nil
}

// UpsertTrustAnchor inserts a certificate row (if absent) and ensures
// trust_anchor=TRUE. Used by the root store refresh job — unlike the
// scanner insert path, this always flips trust_anchor on regardless of
// whether the row existed. Also backfills subject_org / subject_ou on
// conflict so the weekly refresh populates those fields for anchors
// ingested before the columns existed.
func (s *Store) UpsertTrustAnchor(ctx context.Context, c *Certificate) error {
	c.TrustAnchor = true
	_, err := s.db.NewInsert().
		Model(c).
		On("CONFLICT (fingerprint) DO UPDATE").
		Set("trust_anchor = TRUE").
		Set("subject_org = EXCLUDED.subject_org").
		Set("subject_ou = EXCLUDED.subject_ou").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to upsert trust anchor: %w", err)
	}
	return nil
}

// MarkTrustAnchor flips trust_anchor=TRUE on an existing certificate without
// inserting. Used as a fallback during refresh when CCADB's trust matrix lists
// an anchor but its per-program PEM bundle doesn't include it — we can still
// record the flag (and the matrix membership) as long as the cert already
// exists locally from a prior scan. Returns true if a row was updated.
func (s *Store) MarkTrustAnchor(ctx context.Context, fingerprint string) (bool, error) {
	res, err := s.db.NewUpdate().
		Model((*Certificate)(nil)).
		Set("trust_anchor = TRUE").
		Where("fingerprint = ?", fingerprint).
		Exec(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to mark trust anchor: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ReconcileTrustAnchorFlags sets trust_anchor=TRUE on every cert whose
// Subject DN + Subject Key ID match any cert referenced by root_store_anchors,
// and FALSE everywhere else. Subject+SKI (rather than raw fingerprint) is the
// RFC 5280 path-building identity — this is what makes cross-signed copies of
// an anchor (e.g. GTS Root R1 signed by GlobalSign R1) carry the same flag as
// the canonical self-signed anchor CCADB publishes.
//
// Call at the end of the refresh job after ReplaceRootStoreAnchors has
// settled per-store membership. Returns the number of rows whose flag
// actually changed.
func (s *Store) ReconcileTrustAnchorFlags(ctx context.Context) (int64, error) {
	const match = `
		EXISTS (
		    SELECT 1
		    FROM tlsentinel.root_store_anchors rsa
		    JOIN tlsentinel.certificates a ON a.fingerprint = rsa.fingerprint
		    WHERE a.subject_dn_hash = tlsentinel.certificates.subject_dn_hash
		      AND (
		          tlsentinel.certificates.subject_key_id = ''
		       OR a.subject_key_id = ''
		       OR a.subject_key_id = tlsentinel.certificates.subject_key_id
		      )
		)
	`
	res, err := s.db.ExecContext(ctx, `
		UPDATE tlsentinel.certificates
		SET trust_anchor = `+match+`
		WHERE trust_anchor <> `+match+`
	`)
	if err != nil {
		return 0, fmt.Errorf("failed to reconcile trust anchor flags: %w", err)
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// ReplaceRootStoreAnchors atomically swaps the anchor set for a store:
// inserts all provided (storeID, fingerprint) pairs, then deletes any rows
// for this store whose fingerprint is not in the new set.
func (s *Store) ReplaceRootStoreAnchors(ctx context.Context, storeID string, fingerprints []string) error {
	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if len(fingerprints) > 0 {
			rows := make([]RootStoreAnchor, len(fingerprints))
			for i, fp := range fingerprints {
				rows[i] = RootStoreAnchor{RootStoreID: storeID, Fingerprint: fp}
			}
			_, err := tx.NewInsert().
				Model(&rows).
				On("CONFLICT (root_store_id, fingerprint) DO NOTHING").
				Exec(ctx)
			if err != nil {
				return fmt.Errorf("insert anchors: %w", err)
			}
		}
		// Sweep: remove anchors no longer present.
		q := tx.NewDelete().
			Model((*RootStoreAnchor)(nil)).
			Where("root_store_id = ?", storeID)
		if len(fingerprints) > 0 {
			q = q.Where("fingerprint NOT IN (?)", bun.In(fingerprints))
		}
		if _, err := q.Exec(ctx); err != nil {
			return fmt.Errorf("sweep anchors: %w", err)
		}
		return nil
	})
}
