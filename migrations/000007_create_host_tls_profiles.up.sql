CREATE TABLE IF NOT EXISTS tlsentinel.host_tls_profiles (
    host_id         UUID        PRIMARY KEY REFERENCES tlsentinel.hosts(id) ON DELETE CASCADE,
    scanned_at      TIMESTAMPTZ NOT NULL,
    tls10           BOOLEAN     NOT NULL DEFAULT FALSE,
    tls11           BOOLEAN     NOT NULL DEFAULT FALSE,
    tls12           BOOLEAN     NOT NULL DEFAULT FALSE,
    tls13           BOOLEAN     NOT NULL DEFAULT FALSE,
    cipher_suites   TEXT[]      NOT NULL DEFAULT '{}',
    selected_cipher TEXT,
    scan_error      TEXT
);
