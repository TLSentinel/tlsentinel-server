-- Migration 000025: Replace endpoints.active_fingerprint with endpoint_certs join table.
--
-- Motivations:
--   - SAML endpoints can have both signing and encryption certificates.
--   - The 1→1 active_fingerprint column cannot model this.
--   - A join table with cert_use gives us multi-cert support, explicit use
--     labelling, and a built-in history (is_current = FALSE rows).

-- 1. Create the join table.
CREATE TABLE tlsentinel.endpoint_certs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id   UUID        NOT NULL REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    fingerprint   TEXT        NOT NULL REFERENCES tlsentinel.certificates(fingerprint),
    cert_use      TEXT        NOT NULL,
    is_current    BOOLEAN     NOT NULL DEFAULT TRUE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT endpoint_certs_cert_use_check
        CHECK (cert_use IN ('tls', 'signing', 'encryption', 'manual')),

    CONSTRAINT endpoint_certs_unique
        UNIQUE (endpoint_id, fingerprint, cert_use)
);

CREATE INDEX idx_endpoint_certs_endpoint_id
    ON tlsentinel.endpoint_certs(endpoint_id);

CREATE INDEX idx_endpoint_certs_fingerprint
    ON tlsentinel.endpoint_certs(fingerprint);

CREATE INDEX idx_endpoint_certs_current
    ON tlsentinel.endpoint_certs(endpoint_id, cert_use) WHERE is_current = TRUE;

-- 2. Migrate existing active_fingerprint data.
--    Derive cert_use from endpoint type:
--      host   → 'tls'
--      manual → 'manual'
--      saml   → 'signing'  (only signing certs were tracked before this migration)
INSERT INTO tlsentinel.endpoint_certs (endpoint_id, fingerprint, cert_use, is_current)
SELECT
    e.id,
    e.active_fingerprint,
    CASE e.type
        WHEN 'host'   THEN 'tls'
        WHEN 'manual' THEN 'manual'
        WHEN 'saml'   THEN 'signing'
        ELSE               'tls'
    END,
    TRUE
FROM tlsentinel.endpoints e
WHERE e.active_fingerprint IS NOT NULL;

-- 3. Rewrite v_active_certificates to use endpoint_certs.
--    Each current cert gets its own row; cert_use is exposed for display.
DROP VIEW IF EXISTS tlsentinel.v_active_certificates;

CREATE VIEW tlsentinel.v_active_certificates AS
SELECT
    e.id                                                              AS endpoint_id,
    e.name                                                            AS endpoint_name,
    e.type                                                            AS endpoint_type,
    ec.cert_use,
    c.fingerprint,
    c.common_name,
    c.not_before,
    c.not_after,
    FLOOR(EXTRACT(EPOCH FROM (c.not_after - now())) / 86400)::int    AS days_remaining
FROM tlsentinel.endpoints     e
JOIN tlsentinel.endpoint_certs ec ON ec.endpoint_id = e.id AND ec.is_current = TRUE
JOIN tlsentinel.certificates   c  ON c.fingerprint  = ec.fingerprint
WHERE e.enabled = TRUE;

-- 4. Drop views that reference active_fingerprint, then the column itself.
--    These are convenience views recreated below without the column.
DROP VIEW IF EXISTS tlsentinel.v_endpoints_hosts_full;
DROP VIEW IF EXISTS tlsentinel.v_endpoints_saml_full;

DROP INDEX  IF EXISTS tlsentinel.idx_endpoints_active_fingerprint;
ALTER TABLE tlsentinel.endpoints DROP COLUMN IF EXISTS active_fingerprint;

-- 5. Recreate the convenience views without active_fingerprint.
--    Callers that need cert data should use endpoint_certs or v_active_certificates.

CREATE VIEW tlsentinel.v_endpoints_hosts_full AS
SELECT
    e.id,
    e.name,
    e.type,
    e.enabled,
    e.notes,
    e.scanner_id,
    e.last_scanned_at,
    e.last_scan_error,
    e.error_since,
    e.created_at,
    e.updated_at,
    h.dns_name,
    h.ip_address,
    h.port
FROM tlsentinel.endpoints e
JOIN tlsentinel.endpoint_hosts h ON h.endpoint_id = e.id;

CREATE VIEW tlsentinel.v_endpoints_saml_full AS
SELECT
    e.id,
    e.name,
    e.type,
    e.enabled,
    e.notes,
    e.scanner_id,
    e.last_scanned_at,
    e.last_scan_error,
    e.error_since,
    e.created_at,
    e.updated_at,
    s.url,
    s.metadata
FROM tlsentinel.endpoints e
JOIN tlsentinel.endpoint_saml s ON s.endpoint_id = e.id;
