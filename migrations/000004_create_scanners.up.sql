CREATE TABLE IF NOT EXISTS tlsentinel.scanners (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT        NOT NULL,
    token_hash            TEXT        NOT NULL UNIQUE,
    is_default            BOOLEAN     NOT NULL DEFAULT FALSE,
    scan_interval_seconds INT         NOT NULL DEFAULT 3600,
    scan_concurrency      INT         NOT NULL DEFAULT 5,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scanners_token_hash
    ON tlsentinel.scanners(token_hash);

-- At most one default scanner at a time.
CREATE UNIQUE INDEX IF NOT EXISTS scanners_one_default_idx
    ON tlsentinel.scanners(is_default)
    WHERE is_default = TRUE;
