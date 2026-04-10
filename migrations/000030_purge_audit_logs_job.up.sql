INSERT INTO tlsentinel.scheduled_jobs (name, display_name, cron_expression, enabled)
VALUES ('purge_audit_logs', 'Purge Audit Logs', '0 3 * * *', TRUE)
ON CONFLICT (name) DO NOTHING;
