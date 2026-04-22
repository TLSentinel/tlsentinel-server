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

// PurgeUnreferencedCerts deletes certificates that are no longer referenced
// by anything that keeps them alive:
//
//   - trust anchors (certificates.trust_anchor = TRUE) — Mozilla/Apple roots
//   - root_store_anchors entries
//   - issuer_fingerprint of any other cert (chain integrity)
//   - endpoint_certs rows (current or historical)
//   - endpoint_scan_history rows (the audit ledger)
//   - discovery_inbox rows (dangling preview references)
//
// The accompanying certificate_expiry_alerts rows CASCADE away automatically
// via the FK on expiry_alerts.fingerprint → certificates.fingerprint.
//
// This runs as a single pass: certs freed up by today's deletes become
// eligible on the next run (e.g. an intermediate whose only descendant leaf
// was pruned today). Convergence is intentional rather than iterative — one
// pass per night keeps the operation predictable.
//
// Returns the number of certificates deleted.
func (s *Store) PurgeUnreferencedCerts(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM tlsentinel.certificates c
		WHERE c.trust_anchor = FALSE
		  AND NOT EXISTS (
		        SELECT 1 FROM tlsentinel.root_store_anchors rsa
		        WHERE rsa.fingerprint = c.fingerprint
		  )
		  AND NOT EXISTS (
		        SELECT 1 FROM tlsentinel.certificates c2
		        WHERE c2.issuer_fingerprint = c.fingerprint
		  )
		  AND NOT EXISTS (
		        SELECT 1 FROM tlsentinel.endpoint_certs ec
		        WHERE ec.fingerprint = c.fingerprint
		  )
		  AND NOT EXISTS (
		        SELECT 1 FROM tlsentinel.endpoint_scan_history esh
		        WHERE esh.fingerprint = c.fingerprint
		  )
		  AND NOT EXISTS (
		        SELECT 1 FROM tlsentinel.discovery_inbox di
		        WHERE di.fingerprint = c.fingerprint
		  )
	`)
	if err != nil {
		return 0, fmt.Errorf("purge unreferenced certs: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("purge unreferenced certs rows affected: %w", err)
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
