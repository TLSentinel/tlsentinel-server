INSERT INTO tlsentinel.scheduled_jobs (name, display_name, cron_expression, enabled)
VALUES ('purge_expiry_alerts', 'Purge Expiry Alerts', '0 4 * * *', TRUE)
ON CONFLICT (name) DO NOTHING;
