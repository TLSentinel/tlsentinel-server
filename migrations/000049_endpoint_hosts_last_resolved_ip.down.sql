DROP INDEX IF EXISTS tlsentinel.idx_endpoint_hosts_last_resolved_ip;

ALTER TABLE tlsentinel.endpoint_hosts
    DROP COLUMN IF EXISTS last_resolved_ip;
