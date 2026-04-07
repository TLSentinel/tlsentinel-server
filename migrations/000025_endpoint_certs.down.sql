-- Reverse migration 000025: restore endpoints.active_fingerprint and the
-- previous v_active_certificates view definition.

-- 1. Re-add the column.
ALTER TABLE tlsentinel.endpoints
    ADD COLUMN IF NOT EXISTS active_fingerprint TEXT
        REFERENCES tlsentinel.certificates(fingerprint);

CREATE INDEX IF NOT EXISTS idx_endpoints_active_fingerprint
    ON tlsentinel.endpoints(active_fingerprint);

-- 2. Restore active_fingerprint from endpoint_certs (current, primary-use cert).
--    For endpoints that had multiple current certs, pick the signing cert first,
--    then tls/manual, then encryption — matching the pre-migration priority.
UPDATE tlsentinel.endpoints e
SET active_fingerprint = sub.fingerprint
FROM (
    SELECT DISTINCT ON (endpoint_id)
        endpoint_id,
        fingerprint
    FROM tlsentinel.endpoint_certs
    WHERE is_current = TRUE
    ORDER BY endpoint_id,
             CASE cert_use
                 WHEN 'signing'    THEN 1
                 WHEN 'tls'        THEN 2
                 WHEN 'manual'     THEN 3
                 WHEN 'encryption' THEN 4
                 ELSE                   5
             END
) sub
WHERE e.id = sub.endpoint_id;

-- 3. Restore the previous view.
DROP VIEW IF EXISTS tlsentinel.v_active_certificates;

CREATE VIEW tlsentinel.v_active_certificates AS
SELECT
    e.id                                                              AS endpoint_id,
    e.name                                                            AS endpoint_name,
    e.type                                                            AS endpoint_type,
    c.fingerprint,
    c.common_name,
    c.not_before,
    c.not_after,
    FLOOR(EXTRACT(EPOCH FROM (c.not_after - now())) / 86400)::int    AS days_remaining
FROM tlsentinel.endpoints e
JOIN tlsentinel.certificates c ON c.fingerprint = e.active_fingerprint
WHERE e.active_fingerprint IS NOT NULL
  AND e.enabled = TRUE;

-- 4. Restore the convenience views with active_fingerprint reinstated.
DROP VIEW IF EXISTS tlsentinel.v_endpoints_hosts_full;
DROP VIEW IF EXISTS tlsentinel.v_endpoints_saml_full;

CREATE VIEW tlsentinel.v_endpoints_hosts_full AS
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

CREATE VIEW tlsentinel.v_endpoints_saml_full AS
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

-- 5. Drop the join table.
DROP TABLE IF EXISTS tlsentinel.endpoint_certs;
