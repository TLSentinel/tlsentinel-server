-- Initial schema — creates the full database in its current state.
-- Replaces migrations 001-018. Existing installs are unaffected (schema_migrations
-- already records those versions). Fresh installs run this file then continue
-- from migration 019 onward.

CREATE SCHEMA IF NOT EXISTS tlsentinel;

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.certificates (
    fingerprint        TEXT        PRIMARY KEY,
    pem                TEXT        NOT NULL,
    common_name        TEXT        NOT NULL,
    sans               TEXT[]      NOT NULL,
    not_before         TIMESTAMPTZ NOT NULL,
    not_after          TIMESTAMPTZ NOT NULL,
    serial_number      TEXT        NOT NULL,
    subject_key_id     TEXT        NOT NULL,
    authority_key_id   TEXT,
    subject_dn_hash    TEXT        NOT NULL DEFAULT '',
    issuer_dn_hash     TEXT        NOT NULL DEFAULT '',
    issuer_fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_not_after
    ON tlsentinel.certificates(not_after);
CREATE INDEX IF NOT EXISTS idx_certificates_common_name
    ON tlsentinel.certificates(common_name);
CREATE INDEX IF NOT EXISTS idx_certificates_issuer_fingerprint
    ON tlsentinel.certificates(issuer_fingerprint);
CREATE INDEX IF NOT EXISTS idx_certificates_subject_key_id
    ON tlsentinel.certificates(subject_key_id);
CREATE INDEX IF NOT EXISTS idx_certificates_authority_key_id
    ON tlsentinel.certificates(authority_key_id);
CREATE INDEX IF NOT EXISTS idx_certificates_subject_dn_hash
    ON tlsentinel.certificates(subject_dn_hash);
CREATE INDEX IF NOT EXISTS idx_certificates_issuer_dn_hash
    ON tlsentinel.certificates(issuer_dn_hash);

CREATE OR REPLACE FUNCTION tlsentinel.backfill_issuer_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tlsentinel.certificates
    SET issuer_fingerprint = (
        SELECT fingerprint FROM tlsentinel.certificates
        WHERE subject_key_id = NEW.authority_key_id
          AND subject_dn_hash = NEW.issuer_dn_hash
          AND fingerprint != NEW.fingerprint
        ORDER BY not_after DESC
        LIMIT 1
    )
    WHERE fingerprint = NEW.fingerprint
      AND issuer_fingerprint IS NULL
      AND NEW.authority_key_id IS NOT NULL;

    UPDATE tlsentinel.certificates
    SET issuer_fingerprint = NEW.fingerprint
    WHERE authority_key_id = NEW.subject_key_id
      AND issuer_dn_hash = NEW.subject_dn_hash
      AND fingerprint != NEW.fingerprint
      AND issuer_fingerprint IS NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_backfill_issuer_fingerprint ON tlsentinel.certificates;
CREATE TRIGGER trg_backfill_issuer_fingerprint
AFTER INSERT ON tlsentinel.certificates
FOR EACH ROW EXECUTE FUNCTION tlsentinel.backfill_issuer_fingerprint();

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.users (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username       TEXT        NOT NULL UNIQUE,
    password_hash  TEXT,                                   -- NULL for SSO users
    provider       TEXT        NOT NULL DEFAULT 'local',   -- local | oidc
    role           TEXT        NOT NULL DEFAULT 'admin',   -- admin | operator | viewer
    first_name     TEXT,
    last_name      TEXT,
    email          TEXT,
    enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
    notify         BOOLEAN     NOT NULL DEFAULT FALSE,
    calendar_token TEXT        UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- scanners
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.scanners (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT        NOT NULL,
    token_hash            TEXT        NOT NULL UNIQUE,
    is_default            BOOLEAN     NOT NULL DEFAULT FALSE,
    scan_interval_seconds INT         NOT NULL DEFAULT 3600,
    scan_concurrency      INT         NOT NULL DEFAULT 5,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scanners_token_hash
    ON tlsentinel.scanners(token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS scanners_one_default_idx
    ON tlsentinel.scanners(is_default)
    WHERE is_default = TRUE;

-- ---------------------------------------------------------------------------
-- endpoints
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.endpoints (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT        NOT NULL,
    dns_name           TEXT,
    ip_address         TEXT,
    port               INT         NOT NULL DEFAULT 443,
    type               TEXT        NOT NULL DEFAULT 'host',
    enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
    notes              TEXT,
    scanner_id         UUID        REFERENCES tlsentinel.scanners(id) ON DELETE SET NULL,
    active_fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    last_scanned_at    TIMESTAMPTZ,
    last_scan_error    TEXT,
    error_since        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_endpoints_dns_name
    ON tlsentinel.endpoints(dns_name);
CREATE INDEX IF NOT EXISTS idx_endpoints_active_fingerprint
    ON tlsentinel.endpoints(active_fingerprint);
CREATE INDEX IF NOT EXISTS idx_endpoints_enabled
    ON tlsentinel.endpoints(enabled);
CREATE INDEX IF NOT EXISTS idx_endpoints_scanner_id
    ON tlsentinel.endpoints(scanner_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_type
    ON tlsentinel.endpoints(type);

-- ---------------------------------------------------------------------------
-- endpoint_scan_history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.endpoint_scan_history (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID        NOT NULL REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    resolved_ip TEXT,
    tls_version TEXT,
    scan_error  TEXT
);

CREATE INDEX IF NOT EXISTS idx_endpoint_scan_history_endpoint_id
    ON tlsentinel.endpoint_scan_history(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_scan_history_scanned_at
    ON tlsentinel.endpoint_scan_history(scanned_at);

-- ---------------------------------------------------------------------------
-- endpoint_tls_profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.endpoint_tls_profiles (
    endpoint_id     UUID        PRIMARY KEY REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    scanned_at      TIMESTAMPTZ NOT NULL,
    tls10           BOOLEAN     NOT NULL DEFAULT FALSE,
    tls11           BOOLEAN     NOT NULL DEFAULT FALSE,
    tls12           BOOLEAN     NOT NULL DEFAULT FALSE,
    tls13           BOOLEAN     NOT NULL DEFAULT FALSE,
    cipher_suites   TEXT[]      NOT NULL DEFAULT '{}',
    selected_cipher TEXT,
    scan_error      TEXT
);

-- ---------------------------------------------------------------------------
-- mail_config
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.mail_config (
    id            INT         PRIMARY KEY DEFAULT 1,
    enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
    smtp_host     TEXT        NOT NULL DEFAULT '',
    smtp_port     INT         NOT NULL DEFAULT 587,
    auth_type     TEXT        NOT NULL DEFAULT 'plain',    -- none | plain | login
    smtp_username TEXT        NOT NULL DEFAULT '',
    smtp_password TEXT        NOT NULL DEFAULT '',         -- AES-256-GCM ciphertext
    from_address  TEXT        NOT NULL DEFAULT '',
    from_name     TEXT        NOT NULL DEFAULT '',
    tls_mode      TEXT        NOT NULL DEFAULT 'starttls', -- none | starttls | tls
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mail_config_one_row CHECK (id = 1)
);

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

DROP TRIGGER IF EXISTS trg_settings_updated_at ON tlsentinel.settings;
CREATE TRIGGER trg_settings_updated_at
BEFORE UPDATE ON tlsentinel.settings
FOR EACH ROW EXECUTE FUNCTION tlsentinel.set_settings_updated_at();

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

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tlsentinel.groups (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tlsentinel.host_groups (
    host_id     UUID NOT NULL REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES tlsentinel.groups(id)    ON DELETE CASCADE,
    PRIMARY KEY (host_id, group_id)
);

CREATE TABLE IF NOT EXISTS tlsentinel.user_groups (
    user_id     UUID NOT NULL REFERENCES tlsentinel.users(id)  ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES tlsentinel.groups(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    PRIMARY KEY (user_id, group_id)
);

-- ---------------------------------------------------------------------------
-- v_active_certificates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW tlsentinel.v_active_certificates AS
SELECT
    e.id                                                              AS endpoint_id,
    e.name                                                            AS endpoint_name,
    e.dns_name,
    e.port,
    c.fingerprint,
    c.common_name,
    c.not_before,
    c.not_after,
    FLOOR(EXTRACT(EPOCH FROM (c.not_after - now())) / 86400)::int    AS days_remaining
FROM tlsentinel.endpoints e
JOIN tlsentinel.certificates c ON c.fingerprint = e.active_fingerprint
WHERE e.active_fingerprint IS NOT NULL
  AND e.enabled = TRUE;
