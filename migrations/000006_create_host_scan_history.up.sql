CREATE TABLE IF NOT EXISTS tlsentinel.host_scan_history (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id     UUID        NOT NULL REFERENCES tlsentinel.hosts(id) ON DELETE CASCADE,
    scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    resolved_ip TEXT,
    tls_version TEXT,
    scan_error  TEXT
);

CREATE INDEX IF NOT EXISTS idx_host_scan_history_host_id
    ON tlsentinel.host_scan_history(host_id);
CREATE INDEX IF NOT EXISTS idx_host_scan_history_scanned_at
    ON tlsentinel.host_scan_history(scanned_at);
