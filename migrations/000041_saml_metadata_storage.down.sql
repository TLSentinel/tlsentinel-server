DROP TABLE IF EXISTS tlsentinel.saml_metadata_history;

ALTER TABLE tlsentinel.endpoint_saml
    DROP COLUMN IF EXISTS metadata_xml,
    DROP COLUMN IF EXISTS metadata_xml_sha256,
    DROP COLUMN IF EXISTS metadata_fetched_at;
