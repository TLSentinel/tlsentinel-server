-- Migration 000038: Expose SANs and issuer CN in v_active_certificates.
--
-- Adds two columns:
--   sans       TEXT[]  — certificate's Subject Alternative Names
--   issuer_cn  TEXT    — common name of the issuing CA (from the issuer cert row,
--                        empty string when issuer is not yet in our store)

DROP VIEW IF EXISTS tlsentinel.v_active_certificates;

CREATE VIEW tlsentinel.v_active_certificates AS
SELECT
    e.id                                                              AS endpoint_id,
    e.name                                                            AS endpoint_name,
    e.type                                                            AS endpoint_type,
    ec.cert_use,
    c.fingerprint,
    c.common_name,
    c.sans,
    COALESCE(ic.common_name, '')                                      AS issuer_cn,
    c.not_before,
    c.not_after,
    FLOOR(EXTRACT(EPOCH FROM (c.not_after - now())) / 86400)::int    AS days_remaining
FROM tlsentinel.endpoints      e
JOIN tlsentinel.endpoint_certs ec ON ec.endpoint_id = e.id AND ec.is_current = TRUE
JOIN tlsentinel.certificates   c  ON c.fingerprint  = ec.fingerprint
LEFT JOIN tlsentinel.certificates ic ON ic.fingerprint = c.issuer_fingerprint
WHERE e.enabled = TRUE;
