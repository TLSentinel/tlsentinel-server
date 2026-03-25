-- Revert endpoint_tls_profiles back to host_tls_profiles
ALTER TABLE tlsentinel.endpoint_tls_profiles RENAME TO host_tls_profiles;
ALTER TABLE tlsentinel.host_tls_profiles RENAME COLUMN endpoint_id TO host_id;

-- Revert endpoint_scan_history back to host_scan_history
ALTER TABLE tlsentinel.endpoint_scan_history RENAME TO host_scan_history;
ALTER INDEX tlsentinel.idx_endpoint_scan_history_endpoint_id RENAME TO idx_host_scan_history_host_id;
ALTER TABLE tlsentinel.host_scan_history RENAME COLUMN endpoint_id TO host_id;

-- Remove index on type
DROP INDEX IF EXISTS tlsentinel.idx_endpoints_type;

-- Restore indexes
ALTER INDEX tlsentinel.idx_endpoints_scanner_id         RENAME TO idx_hosts_scanner_id;
ALTER INDEX tlsentinel.idx_endpoints_enabled            RENAME TO idx_hosts_enabled;
ALTER INDEX tlsentinel.idx_endpoints_active_fingerprint RENAME TO idx_hosts_active_fingerprint;
ALTER INDEX tlsentinel.idx_endpoints_dns_name           RENAME TO idx_hosts_dns_name;

-- Restore dns_name NOT NULL (only safe if no non-host rows exist)
ALTER TABLE tlsentinel.endpoints
    ALTER COLUMN dns_name SET NOT NULL;

ALTER TABLE tlsentinel.endpoints
    DROP COLUMN IF EXISTS type;

-- Rename endpoints back to hosts
ALTER TABLE tlsentinel.endpoints RENAME TO hosts;
