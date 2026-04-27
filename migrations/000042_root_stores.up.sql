-- Root store trust tracking.
--
-- trust_anchor flags a certificate as a known CA root anchor (populated by
-- the refresh_root_stores job, independent of scanner observations).
-- A cert may be both observed (linked to endpoints) and a trust anchor.
ALTER TABLE tlsentinel.certificates
    ADD COLUMN IF NOT EXISTS trust_anchor BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_certificates_trust_anchor
    ON tlsentinel.certificates(trust_anchor) WHERE trust_anchor = TRUE;

-- root_stores: one row per program we track (builtin = CCADB-managed; custom reserved for future)
CREATE TABLE IF NOT EXISTS tlsentinel.root_stores (
    id          TEXT         PRIMARY KEY,
    name        TEXT         NOT NULL,
    kind        TEXT         NOT NULL CHECK (kind IN ('builtin', 'custom')),
    source_url  TEXT,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- root_store_anchors: join of root_stores <-> certificates (which program trusts which anchor)
CREATE TABLE IF NOT EXISTS tlsentinel.root_store_anchors (
    root_store_id TEXT NOT NULL REFERENCES tlsentinel.root_stores(id) ON DELETE CASCADE,
    fingerprint   TEXT NOT NULL REFERENCES tlsentinel.certificates(fingerprint) ON DELETE CASCADE,
    PRIMARY KEY (root_store_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_root_store_anchors_fingerprint
    ON tlsentinel.root_store_anchors(fingerprint);

-- Seed the four CCADB-tracked builtin stores.
INSERT INTO tlsentinel.root_stores (id, name, kind, source_url) VALUES
    ('microsoft', 'Microsoft Windows', 'builtin', 'https://www.ccadb.org/'),
    ('apple',     'Apple macOS/iOS',   'builtin', 'https://www.ccadb.org/'),
    ('mozilla',   'Mozilla Firefox',   'builtin', 'https://www.ccadb.org/'),
    ('chrome',    'Google Chrome',     'builtin', 'https://www.ccadb.org/')
ON CONFLICT (id) DO NOTHING;

-- Seed the refresh job (runs weekly Sunday 04:00).
INSERT INTO tlsentinel.scheduled_jobs (name, display_name, cron_expression, enabled)
VALUES ('refresh_root_stores', 'Refresh Root Stores', '0 4 * * 0', TRUE)
ON CONFLICT (name) DO NOTHING;
