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

// PurgeExpiryAlerts deletes certificate_expiry_alerts rows for certificates that are
// no longer the current cert on any endpoint. This wipes the dedup slate for replaced
// certs so fresh alerts will fire for any new cert approaching expiry, while preserving
// records for certs that are still active (preventing repeat alert spam).
// Returns the number of rows deleted.
func (s *Store) PurgeExpiryAlerts(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM tlsentinel.certificate_expiry_alerts
		WHERE fingerprint NOT IN (
			SELECT DISTINCT fingerprint FROM tlsentinel.endpoint_certs
			WHERE is_current = TRUE
		)
	`)
	if err != nil {
		return 0, fmt.Errorf("purge expiry alerts: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("purge expiry alerts rows affected: %w", err)
	}
	return n, nil
}

// PurgeAuditLogs deletes audit log entries older than the given number of days.
// Returns the number of rows deleted.
func (s *Store) PurgeAuditLogs(ctx context.Context, days int) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM tlsentinel.audit_logs
		WHERE created_at < NOW() - (? * INTERVAL '1 day')
	`, days)
	if err != nil {
		return 0, fmt.Errorf("purge audit logs: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("purge audit logs rows affected: %w", err)
	}
	return n, nil
}
