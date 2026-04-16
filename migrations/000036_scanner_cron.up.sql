ALTER TABLE tlsentinel.scanners
    ADD COLUMN IF NOT EXISTS scan_cron_expression TEXT NOT NULL DEFAULT '0 * * * *';

UPDATE tlsentinel.scanners
SET scan_cron_expression = CASE
    WHEN scan_interval_seconds IS NULL OR scan_interval_seconds <= 0 THEN '0 * * * *'
    WHEN scan_interval_seconds >= 86400                              THEN '0 0 * * *'
    ELSE '0 */' || GREATEST(1, scan_interval_seconds / 3600) || ' * * *'
END
WHERE scan_cron_expression = '0 * * * *';

ALTER TABLE tlsentinel.scanners
    DROP COLUMN IF EXISTS scan_interval_seconds;
