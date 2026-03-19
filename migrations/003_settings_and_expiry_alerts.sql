-- Migration 003: Generic settings table + certificate expiry alert tracking.
--
-- settings: key/value store for runtime-configurable options. Value is JSONB
--           so individual keys can hold scalars, arrays, or objects without
--           schema changes. A trigger keeps updated_at current.
--
-- certificate_expiry_alerts: tracks which (certificate, threshold) combinations
--           have already triggered an email alert, preventing duplicate sends.
--           The composite PK doubles as the unique constraint.

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.settings (
    key        TEXT        PRIMARY KEY,
    value      JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION tlsentinel.set_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_settings_updated_at
BEFORE UPDATE ON tlsentinel.settings
FOR EACH ROW EXECUTE FUNCTION tlsentinel.set_settings_updated_at();

-- Seed defaults. ON CONFLICT DO NOTHING means re-running the migration is safe
-- and manual overrides already in the table are preserved.
INSERT INTO tlsentinel.settings (key, value)
VALUES ('alert_thresholds_days', '[30, 14, 7, 1]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- certificate_expiry_alerts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.certificate_expiry_alerts (
    fingerprint    TEXT        NOT NULL REFERENCES tlsentinel.certificates(fingerprint) ON DELETE CASCADE,
    threshold_days INT         NOT NULL,
    alerted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (fingerprint, threshold_days)
);

CREATE INDEX IF NOT EXISTS idx_certificate_expiry_alerts_fingerprint
    ON tlsentinel.certificate_expiry_alerts(fingerprint);
