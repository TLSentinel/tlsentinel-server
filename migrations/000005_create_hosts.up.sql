CREATE TABLE IF NOT EXISTS tlsentinel.hosts (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT        NOT NULL,
    dns_name           TEXT        NOT NULL,
    ip_address         TEXT,
    port               INT         NOT NULL DEFAULT 443,
    enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
    scanner_id         UUID        REFERENCES tlsentinel.scanners(id) ON DELETE SET NULL,
    active_fingerprint TEXT        REFERENCES tlsentinel.certificates(fingerprint),
    last_scanned_at    TIMESTAMPTZ,
    last_scan_error    TEXT,
    error_since        TIMESTAMPTZ, -- set when last_scan_error first becomes non-NULL, cleared on recovery
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hosts_dns_name
    ON tlsentinel.hosts(dns_name);
CREATE INDEX IF NOT EXISTS idx_hosts_active_fingerprint
    ON tlsentinel.hosts(active_fingerprint);
CREATE INDEX IF NOT EXISTS idx_hosts_enabled
    ON tlsentinel.hosts(enabled);
CREATE INDEX IF NOT EXISTS idx_hosts_scanner_id
    ON tlsentinel.hosts(scanner_id);
