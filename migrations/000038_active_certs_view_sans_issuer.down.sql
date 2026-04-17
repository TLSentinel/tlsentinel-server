-- Revert to the previous v_active_certificates definition (without sans / issuer_cn).

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
FROM tlsentinel.endpoints      e
JOIN tlsentinel.endpoint_certs ec ON ec.endpoint_id = e.id AND ec.is_current = TRUE
JOIN tlsentinel.certificates   c  ON c.fingerprint  = ec.fingerprint
WHERE e.enabled = TRUE;
