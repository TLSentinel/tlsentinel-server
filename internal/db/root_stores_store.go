package db

import (
	"context"
	"fmt"
	"time"

	"github.com/uptrace/bun"
)

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
// whether the row existed.
func (s *Store) UpsertTrustAnchor(ctx context.Context, c *Certificate) error {
	c.TrustAnchor = true
	_, err := s.db.NewInsert().
		Model(c).
		On("CONFLICT (fingerprint) DO UPDATE").
		Set("trust_anchor = TRUE").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to upsert trust anchor: %w", err)
	}
	return nil
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
