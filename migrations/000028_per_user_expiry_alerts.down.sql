ALTER TABLE tlsentinel.certificate_expiry_alerts
    DROP CONSTRAINT IF EXISTS certificate_expiry_alerts_pkey;

DROP INDEX IF EXISTS tlsentinel.idx_certificate_expiry_alerts_user_id;

ALTER TABLE tlsentinel.certificate_expiry_alerts
    DROP COLUMN IF EXISTS user_id;

ALTER TABLE tlsentinel.certificate_expiry_alerts
    ADD PRIMARY KEY (fingerprint, threshold_days);

CREATE INDEX IF NOT EXISTS idx_certificate_expiry_alerts_fingerprint
    ON tlsentinel.certificate_expiry_alerts(fingerprint);
