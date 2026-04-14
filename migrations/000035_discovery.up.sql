CREATE TABLE IF NOT EXISTS tlsentinel.discovery_networks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    range           TEXT        NOT NULL,
    ports           INTEGER[]   NOT NULL,
    scanner_id      UUID        REFERENCES tlsentinel.scanners(id) ON DELETE SET NULL,
    cron_expression TEXT        NOT NULL,
    enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tlsentinel.discovery_inbox (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id   UUID        REFERENCES tlsentinel.discovery_networks(id) ON DELETE CASCADE,
    scanner_id   UUID        REFERENCES tlsentinel.scanners(id) ON DELETE SET NULL,
    ip           INET        NOT NULL,
    rdns         TEXT,
    port         INTEGER     NOT NULL,
    fingerprint  TEXT        REFERENCES tlsentinel.certificates(fingerprint) ON DELETE SET NULL,
    status       TEXT        NOT NULL DEFAULT 'new',
    endpoint_id  UUID        REFERENCES tlsentinel.hosts(id) ON DELETE SET NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ip, port)
);
