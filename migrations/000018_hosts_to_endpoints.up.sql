-- Rename hosts table to endpoints and add type column
ALTER TABLE tlsentinel.hosts RENAME TO endpoints;

ALTER TABLE tlsentinel.endpoints
    ADD COLUMN type TEXT NOT NULL DEFAULT 'host';

ALTER TABLE tlsentinel.endpoints
    ALTER COLUMN dns_name DROP NOT NULL;

-- Rename indexes
ALTER INDEX tlsentinel.idx_hosts_dns_name          RENAME TO idx_endpoints_dns_name;
ALTER INDEX tlsentinel.idx_hosts_active_fingerprint RENAME TO idx_endpoints_active_fingerprint;
ALTER INDEX tlsentinel.idx_hosts_enabled            RENAME TO idx_endpoints_enabled;
ALTER INDEX tlsentinel.idx_hosts_scanner_id         RENAME TO idx_endpoints_scanner_id;

-- Add index on type for listing by endpoint type
CREATE INDEX IF NOT EXISTS idx_endpoints_type ON tlsentinel.endpoints(type);

-- Rename host_scan_history to endpoint_scan_history
ALTER TABLE tlsentinel.host_scan_history RENAME COLUMN host_id TO endpoint_id;
ALTER INDEX tlsentinel.idx_host_scan_history_host_id RENAME TO idx_endpoint_scan_history_endpoint_id;
ALTER TABLE tlsentinel.host_scan_history RENAME TO endpoint_scan_history;

-- Rename host_tls_profiles to endpoint_tls_profiles
ALTER TABLE tlsentinel.host_tls_profiles RENAME COLUMN host_id TO endpoint_id;
ALTER TABLE tlsentinel.host_tls_profiles RENAME TO endpoint_tls_profiles;
