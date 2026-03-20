-- Key/value store for runtime-configurable options. Value is JSONB so
-- individual keys can hold scalars, arrays, or objects without schema changes.

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

DROP TRIGGER IF EXISTS trg_settings_updated_at ON tlsentinel.settings;
CREATE TRIGGER trg_settings_updated_at
BEFORE UPDATE ON tlsentinel.settings
FOR EACH ROW EXECUTE FUNCTION tlsentinel.set_settings_updated_at();

-- Seed defaults. ON CONFLICT DO NOTHING means re-running is safe and manual
-- overrides already in the table are preserved.
INSERT INTO tlsentinel.settings (key, value)
VALUES ('alert_thresholds_days', '[30, 14, 7, 1]'::jsonb)
ON CONFLICT (key) DO NOTHING;
