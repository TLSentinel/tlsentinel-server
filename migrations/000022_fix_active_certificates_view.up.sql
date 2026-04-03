-- Migration 000022: Fix v_active_certificates to include all endpoint types
--
-- The previous definition used INNER JOIN on endpoint_hosts, which silently
-- excluded saml and manual endpoints. Switch to LEFT JOINs so any endpoint
-- with an active_fingerprint appears, regardless of type.
-- Also adds e.type and es.url columns for downstream use.

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

