CREATE TABLE IF NOT EXISTS tlsentinel.certificates (
    fingerprint        TEXT        PRIMARY KEY,
    pem                TEXT        NOT NULL,
    common_name        TEXT        NOT NULL,
    sans               TEXT[]      NOT NULL,
    not_before         TIMESTAMPTZ NOT NULL,
    not_after          TIMESTAMPTZ NOT NULL,
    serial_number      TEXT        NOT NULL,
    subject_key_id     TEXT        NOT NULL,
    authority_key_id   TEXT,
    issuer_fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_not_after
    ON tlsentinel.certificates(not_after);
CREATE INDEX IF NOT EXISTS idx_certificates_common_name
    ON tlsentinel.certificates(common_name);
CREATE INDEX IF NOT EXISTS idx_certificates_issuer_fingerprint
    ON tlsentinel.certificates(issuer_fingerprint);
CREATE INDEX IF NOT EXISTS idx_certificates_subject_key_id
    ON tlsentinel.certificates(subject_key_id);
CREATE INDEX IF NOT EXISTS idx_certificates_authority_key_id
    ON tlsentinel.certificates(authority_key_id);

-- Auto-link issuer chains on insert.
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

DROP TRIGGER IF EXISTS trg_backfill_issuer_fingerprint ON tlsentinel.certificates;
CREATE TRIGGER trg_backfill_issuer_fingerprint
AFTER INSERT ON tlsentinel.certificates
FOR EACH ROW EXECUTE FUNCTION tlsentinel.backfill_issuer_fingerprint();
