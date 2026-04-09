package db

import (
	"context"
	"fmt"
)

// PurgeScanHistory deletes scan history rows older than the given number of days.
// The most-recent row per endpoint is always preserved, regardless of age.
// Returns the number of rows deleted.
func (s *Store) PurgeScanHistory(ctx context.Context, days int) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM tlsentinel.endpoint_scan_history
		WHERE scanned_at < NOW() - (? * INTERVAL '1 day')
		AND id NOT IN (
			SELECT DISTINCT ON (endpoint_id) id
			FROM tlsentinel.endpoint_scan_history
			ORDER BY endpoint_id, scanned_at DESC
		)
	`, days)
	if err != nil {
		return 0, fmt.Errorf("purge scan history: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("purge scan history rows affected: %w", err)
	}
	return n, nil
}
