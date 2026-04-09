CREATE TABLE IF NOT EXISTS tlsentinel.scheduled_jobs (
    name             TEXT        NOT NULL PRIMARY KEY,
    display_name     TEXT        NOT NULL,
    cron_expression  TEXT        NOT NULL,
    enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
    last_run_at      TIMESTAMPTZ,
    last_run_status  TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed known jobs with sensible defaults.
INSERT INTO tlsentinel.scheduled_jobs (name, display_name, cron_expression, enabled) VALUES
    ('expiry_alerts',      'Certificate Expiry Alerts', '0 * * * *',   TRUE),
    ('purge_scan_history', 'Purge Scan History',        '0 2 * * *',   TRUE)
ON CONFLICT (name) DO NOTHING;
