ALTER TABLE tlsentinel.discovery_inbox
    DROP COLUMN IF EXISTS common_name,
    DROP COLUMN IF EXISTS sans,
    DROP COLUMN IF EXISTS not_after;

ALTER TABLE tlsentinel.discovery_inbox
    ADD CONSTRAINT discovery_inbox_fingerprint_fkey
        FOREIGN KEY (fingerprint) REFERENCES tlsentinel.certificates(fingerprint) ON DELETE SET NULL;
