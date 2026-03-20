-- Tracks which (certificate, threshold) combinations have already triggered an
-- email alert, preventing duplicate sends. The composite PK doubles as the
-- unique constraint.

CREATE TABLE IF NOT EXISTS tlsentinel.certificate_expiry_alerts (
    fingerprint    TEXT        NOT NULL REFERENCES tlsentinel.certificates(fingerprint) ON DELETE CASCADE,
    threshold_days INT         NOT NULL,
    alerted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (fingerprint, threshold_days)
);

CREATE INDEX IF NOT EXISTS idx_certificate_expiry_alerts_fingerprint
    ON tlsentinel.certificate_expiry_alerts(fingerprint);
