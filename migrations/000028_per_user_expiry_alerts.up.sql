-- Rebuild certificate_expiry_alerts with a per-user dedup key so that each
-- user receives alerts scoped to their own tag subscriptions independently.

ALTER TABLE tlsentinel.certificate_expiry_alerts
    DROP CONSTRAINT IF EXISTS certificate_expiry_alerts_pkey;

ALTER TABLE tlsentinel.certificate_expiry_alerts
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES tlsentinel.users(id) ON DELETE CASCADE;

-- Back-fill and enforce NOT NULL after adding the column.
-- Any existing rows without a user are orphaned and can be cleared.
DELETE FROM tlsentinel.certificate_expiry_alerts WHERE user_id IS NULL;
ALTER TABLE tlsentinel.certificate_expiry_alerts
    ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE tlsentinel.certificate_expiry_alerts
    ADD PRIMARY KEY (user_id, fingerprint, threshold_days);

DROP INDEX IF EXISTS tlsentinel.idx_certificate_expiry_alerts_fingerprint;

CREATE INDEX IF NOT EXISTS idx_certificate_expiry_alerts_user_id
    ON tlsentinel.certificate_expiry_alerts(user_id);
