-- Store Subject O and OU alongside CN. RFC 5280 doesn't require CN in the
-- Subject; several CCADB roots (SECOM, a couple of EU gov CAs) put their
-- identifier in OU or O instead. Populated by ExtractCertificateRecord on
-- new inserts, and by the root-store refresh job (UpsertTrustAnchor SET on
-- conflict) for existing anchor rows.
ALTER TABLE tlsentinel.certificates
    ADD COLUMN IF NOT EXISTS subject_org TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS subject_ou  TEXT NOT NULL DEFAULT '';
