-- Migration 002: Re-create the backfill_issuer_fingerprint trigger function with
-- the correct tlsentinel schema reference.
--
-- The schema was renamed from certmonitor → tlsentinel in a previous migration,
-- but Postgres does not rewrite function bodies on schema rename, so the trigger
-- was still referencing certmonitor.certificates and failing on every INSERT.

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
