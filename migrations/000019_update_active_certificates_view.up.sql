DROP VIEW IF EXISTS tlsentinel.v_active_certificates;

CREATE VIEW tlsentinel.v_active_certificates AS
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
