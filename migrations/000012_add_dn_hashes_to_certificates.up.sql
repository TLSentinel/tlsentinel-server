ALTER TABLE tlsentinel.certificates
    ADD COLUMN IF NOT EXISTS subject_dn_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS issuer_dn_hash  TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_certificates_subject_dn_hash
    ON tlsentinel.certificates(subject_dn_hash);
CREATE INDEX IF NOT EXISTS idx_certificates_issuer_dn_hash
    ON tlsentinel.certificates(issuer_dn_hash);

-- Update trigger to match on subject_key_id + dn_hash for unambiguous issuer linking.
CREATE OR REPLACE FUNCTION tlsentinel.backfill_issuer_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tlsentinel.certificates
    SET issuer_fingerprint = (
        SELECT fingerprint FROM tlsentinel.certificates
        WHERE subject_key_id = NEW.authority_key_id
          AND subject_dn_hash = NEW.issuer_dn_hash
          AND fingerprint != NEW.fingerprint
    )
    WHERE fingerprint = NEW.fingerprint
      AND issuer_fingerprint IS NULL
      AND NEW.authority_key_id IS NOT NULL;

    UPDATE tlsentinel.certificates
    SET issuer_fingerprint = NEW.fingerprint
    WHERE authority_key_id = NEW.subject_key_id
      AND issuer_dn_hash = NEW.subject_dn_hash
      AND fingerprint != NEW.fingerprint
      AND issuer_fingerprint IS NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
