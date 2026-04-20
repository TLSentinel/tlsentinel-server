DELETE FROM tlsentinel.scheduled_jobs WHERE name = 'refresh_root_stores';

DROP TABLE IF EXISTS tlsentinel.root_store_anchors;
DROP TABLE IF EXISTS tlsentinel.root_stores;

DROP INDEX IF EXISTS tlsentinel.idx_certificates_trust_anchor;
ALTER TABLE tlsentinel.certificates DROP COLUMN IF EXISTS trust_anchor;
