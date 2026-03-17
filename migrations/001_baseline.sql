-- Baseline schema for TLSentinel.
-- Consolidates migrations 001-014 into a single clean starting point.

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

-- Auto-link issuer chains on insert.
CREATE OR REPLACE FUNCTION tlsentinel.backfill_issuer_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tlsentinel.certificates
    SET issuer_fingerprint = (
        SELECT fingerprint FROM tlsentinel.certificates
        WHERE subject_key_id = NEW.authority_key_id
          AND fingerprint != NEW.fingerprint
    )
    WHERE fingerprint = NEW.fingerprint
      AND issuer_fingerprint IS NULL
      AND NEW.authority_key_id IS NOT NULL;

    UPDATE tlsentinel.certificates
    SET issuer_fingerprint = NEW.fingerprint
    WHERE authority_key_id = NEW.subject_key_id
      AND fingerprint != NEW.fingerprint
      AND issuer_fingerprint IS NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_backfill_issuer_fingerprint
AFTER INSERT ON tlsentinel.certificates
FOR EACH ROW EXECUTE FUNCTION tlsentinel.backfill_issuer_fingerprint();

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tlsentinel.users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT,                                -- NULL for OIDC/SAML-only users
    provider      TEXT        NOT NULL DEFAULT 'local',
    provider_id   TEXT        NOT NULL,                -- local: same as username
    role          TEXT        NOT NULL DEFAULT 'admin', -- admin | viewer
    first_name    TEXT,
    last_name     TEXT,
    email         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_provider UNIQUE (provider, provider_id)
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

-- At most one default scanner at a time.
CREATE UNIQUE INDEX IF NOT EXISTS scanners_one_default_idx
    ON tlsentinel.scanners(is_default)
    WHERE is_default = TRUE;

-- ---------------------------------------------------------------------------
-- hosts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tlsentinel.hosts (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT        NOT NULL,
    dns_name           TEXT        NOT NULL,
    ip_address         TEXT,
    port               INT         NOT NULL DEFAULT 443,
    enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
    scanner_id         UUID        REFERENCES tlsentinel.scanners(id) ON DELETE SET NULL,
    active_fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    last_scanned_at    TIMESTAMPTZ,
    last_scan_error    TEXT,
    error_since        TIMESTAMPTZ, -- set when last_scan_error first becomes non-NULL
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hosts_dns_name
    ON tlsentinel.hosts(dns_name);
CREATE INDEX IF NOT EXISTS idx_hosts_active_fingerprint
    ON tlsentinel.hosts(active_fingerprint);
CREATE INDEX IF NOT EXISTS idx_hosts_enabled
    ON tlsentinel.hosts(enabled);
CREATE INDEX IF NOT EXISTS idx_hosts_scanner_id
    ON tlsentinel.hosts(scanner_id);

-- ---------------------------------------------------------------------------
-- host_scan_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tlsentinel.host_scan_history (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id     UUID        NOT NULL REFERENCES tlsentinel.hosts(id) ON DELETE CASCADE,
    scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    resolved_ip TEXT,
    tls_version TEXT,
    scan_error  TEXT
);

CREATE INDEX IF NOT EXISTS idx_host_scan_history_host_id
    ON tlsentinel.host_scan_history(host_id);
CREATE INDEX IF NOT EXISTS idx_host_scan_history_scanned_at
    ON tlsentinel.host_scan_history(scanned_at);

-- ---------------------------------------------------------------------------
-- host_tls_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tlsentinel.host_tls_profiles (
    host_id         UUID        PRIMARY KEY REFERENCES tlsentinel.hosts(id) ON DELETE CASCADE,
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
-- mail_config  (single-row settings table)
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
-- v_active_certificates  (convenience view)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW tlsentinel.v_active_certificates AS
SELECT
    h.id                                                              AS host_id,
    h.name                                                            AS host_name,
    h.dns_name,
    h.port,
    c.fingerprint,
    c.common_name,
    c.not_before,
    c.not_after,
    FLOOR(EXTRACT(EPOCH FROM (c.not_after - now())) / 86400)::int    AS days_remaining
FROM tlsentinel.hosts h
JOIN tlsentinel.certificates c ON c.fingerprint = h.active_fingerprint
WHERE h.active_fingerprint IS NOT NULL;
