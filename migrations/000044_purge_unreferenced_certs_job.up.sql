-- Seed the nightly job that deletes certificates no longer referenced by any
-- endpoint, scan-history row, discovery-inbox entry, root store, or other
-- certificate's issuer chain. Runs at 05:00 so it lands after the other
-- retention jobs (purge_scan_history @ 02:00, purge_audit_logs @ 03:00,
-- purge_expiry_alerts @ 04:00) — later passes benefit from their cleanup.
INSERT INTO tlsentinel.scheduled_jobs (name, display_name, cron_expression, enabled)
VALUES ('purge_unreferenced_certs', 'Purge Unreferenced Certificates', '0 5 * * *', TRUE)
ON CONFLICT (name) DO NOTHING;
