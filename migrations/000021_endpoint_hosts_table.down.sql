-- Reverse migration 021: restore host columns back onto endpoints,
--                         drop endpoint_hosts and endpoint_saml.

-- ---------------------------------------------------------------------------
-- 1. Restore v_active_certificates to original form
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

-- ---------------------------------------------------------------------------
-- 2. Drop views introduced in this migration
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS tlsentinel.v_endpoints_hosts_full;
DROP VIEW IF EXISTS tlsentinel.v_endpoints_saml_full;

-- ---------------------------------------------------------------------------
-- 3. Restore host columns onto endpoints
-- ---------------------------------------------------------------------------

ALTER TABLE tlsentinel.endpoints
    ADD COLUMN dns_name    TEXT,
    ADD COLUMN ip_address  TEXT,
    ADD COLUMN port        INT NOT NULL DEFAULT 443;

CREATE INDEX idx_endpoints_dns_name
    ON tlsentinel.endpoints(dns_name);

-- ---------------------------------------------------------------------------
-- 4. Copy data back from endpoint_hosts
-- ---------------------------------------------------------------------------

UPDATE tlsentinel.endpoints e
SET
    dns_name   = h.dns_name,
    ip_address = h.ip_address,
    port       = h.port
FROM tlsentinel.endpoint_hosts h
WHERE h.endpoint_id = e.id;

-- ---------------------------------------------------------------------------
-- 5. Drop endpoint_saml and endpoint_hosts
-- ---------------------------------------------------------------------------

DROP TABLE tlsentinel.endpoint_saml;
DROP TABLE tlsentinel.endpoint_hosts;
