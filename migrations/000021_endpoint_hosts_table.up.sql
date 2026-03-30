-- Migration 021: Extract host-specific columns from endpoints into endpoint_hosts.
--              Add endpoint_saml for future SAML metadata endpoint type.
--
-- endpoint_hosts holds what was in endpoints for type = 'host':
--   - dns_name, ip_address, port
--
-- endpoint_saml holds config for type = 'saml':
--   - url, metadata (JSONB, flexible bag for future saml-specific fields)
--
-- Views:
--   - v_endpoints_hosts_full  replaces direct queries that expected host columns on endpoints
--   - v_endpoints_saml_full   for saml-type endpoint queries
--   - v_active_certificates   updated to join endpoint_hosts

-- ---------------------------------------------------------------------------
-- 1. Create endpoint_hosts
-- ---------------------------------------------------------------------------

CREATE TABLE tlsentinel.endpoint_hosts (
    endpoint_id  UUID        PRIMARY KEY REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    dns_name     TEXT,
    ip_address   TEXT,
    port         INT         NOT NULL DEFAULT 443
);

CREATE INDEX idx_endpoint_hosts_dns_name
    ON tlsentinel.endpoint_hosts(dns_name);

-- ---------------------------------------------------------------------------
-- 2. Create endpoint_saml
-- ---------------------------------------------------------------------------

CREATE TABLE tlsentinel.endpoint_saml (
    endpoint_id  UUID        PRIMARY KEY REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    url          TEXT        NOT NULL,
    metadata     JSONB
);

-- ---------------------------------------------------------------------------
-- 3. Migrate existing host data
-- ---------------------------------------------------------------------------

INSERT INTO tlsentinel.endpoint_hosts (endpoint_id, dns_name, ip_address, port)
SELECT id, dns_name, ip_address, port
FROM tlsentinel.endpoints
WHERE type = 'host';

-- ---------------------------------------------------------------------------
-- 4. Drop host-specific columns + their indexes from endpoints
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS tlsentinel.idx_endpoints_dns_name;

ALTER TABLE tlsentinel.endpoints
    DROP COLUMN dns_name,
    DROP COLUMN ip_address,
    DROP COLUMN port;

-- ---------------------------------------------------------------------------
-- 5. v_endpoints_hosts_full
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW tlsentinel.v_endpoints_hosts_full AS
SELECT
    e.id,
    e.name,
    e.type,
    e.enabled,
    e.notes,
    e.scanner_id,
    e.active_fingerprint,
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

-- ---------------------------------------------------------------------------
-- 6. v_endpoints_saml_full
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW tlsentinel.v_endpoints_saml_full AS
SELECT
    e.id,
    e.name,
    e.type,
    e.enabled,
    e.notes,
    e.scanner_id,
    e.active_fingerprint,
    e.last_scanned_at,
    e.last_scan_error,
    e.error_since,
    e.created_at,
    e.updated_at,
    s.url,
    s.metadata
FROM tlsentinel.endpoints e
JOIN tlsentinel.endpoint_saml s ON s.endpoint_id = e.id;

-- ---------------------------------------------------------------------------
-- 7. Update v_active_certificates to join endpoint_hosts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW tlsentinel.v_active_certificates AS
SELECT
    e.id                                                              AS endpoint_id,
    e.name                                                            AS endpoint_name,
    h.dns_name,
    h.port,
    c.fingerprint,
    c.common_name,
    c.not_before,
    c.not_after,
    FLOOR(EXTRACT(EPOCH FROM (c.not_after - now())) / 86400)::int    AS days_remaining
FROM tlsentinel.endpoints e
JOIN tlsentinel.endpoint_hosts h  ON h.endpoint_id = e.id
JOIN tlsentinel.certificates   c  ON c.fingerprint  = e.active_fingerprint
WHERE e.active_fingerprint IS NOT NULL
  AND e.enabled = TRUE;
