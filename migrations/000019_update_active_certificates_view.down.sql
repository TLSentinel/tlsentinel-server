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
