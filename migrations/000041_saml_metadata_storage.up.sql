-- Store fetched SAML metadata alongside the parsed JSONB bag so we can
-- (a) reparse for new fields without waiting a scan cycle per endpoint,
-- (b) retain verbatim bytes for future signature verification, and
-- (c) keep a change history of the document itself.
--
-- endpoint_saml.metadata (JSONB) already exists from migration 021 as
-- a flexible bag. We now populate it with parsed fields (entity_id,
-- valid_until, role, sso/slo/acs endpoints, contacts, etc.) and add:
--   - metadata_xml         — verbatim bytes received
--   - metadata_xml_sha256  — hex digest of the above (O(1) diff check)
--   - metadata_fetched_at  — when the scanner last successfully fetched
--
-- saml_metadata_history is append-only and dedupes on (endpoint_id, sha256),
-- so endpoints whose metadata never changes hold exactly one row.

ALTER TABLE tlsentinel.endpoint_saml
    ADD COLUMN IF NOT EXISTS metadata_xml        TEXT,
    ADD COLUMN IF NOT EXISTS metadata_xml_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS metadata_fetched_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tlsentinel.saml_metadata_history (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID        NOT NULL REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    sha256      TEXT        NOT NULL,
    xml         TEXT        NOT NULL,
    metadata    JSONB,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (endpoint_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_saml_metadata_history_endpoint
    ON tlsentinel.saml_metadata_history(endpoint_id, captured_at DESC);
