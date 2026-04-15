ALTER TABLE tlsentinel.scanners
    ADD COLUMN IF NOT EXISTS scan_interval_seconds INTEGER NOT NULL DEFAULT 3600;

ALTER TABLE tlsentinel.scanners
    DROP COLUMN IF EXISTS scan_cron_expression;
