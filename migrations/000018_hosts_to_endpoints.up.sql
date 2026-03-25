-- Rename hosts table to endpoints and add type column
-- Wrapped in DO blocks so this migration is idempotent — safe to re-run if
-- schema_migrations tracking is ever lost while the schema data persists.

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'tlsentinel' AND tablename = 'hosts') THEN
    ALTER TABLE tlsentinel.hosts RENAME TO endpoints;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'tlsentinel' AND table_name = 'endpoints' AND column_name = 'type'
  ) THEN
    ALTER TABLE tlsentinel.endpoints ADD COLUMN type TEXT NOT NULL DEFAULT 'host';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'tlsentinel' AND table_name = 'endpoints'
      AND column_name = 'dns_name' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE tlsentinel.endpoints ALTER COLUMN dns_name DROP NOT NULL;
  END IF;
END $$;

-- Rename indexes
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'tlsentinel' AND indexname = 'idx_hosts_dns_name') THEN
    ALTER INDEX tlsentinel.idx_hosts_dns_name RENAME TO idx_endpoints_dns_name;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'tlsentinel' AND indexname = 'idx_hosts_active_fingerprint') THEN
    ALTER INDEX tlsentinel.idx_hosts_active_fingerprint RENAME TO idx_endpoints_active_fingerprint;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'tlsentinel' AND indexname = 'idx_hosts_enabled') THEN
    ALTER INDEX tlsentinel.idx_hosts_enabled RENAME TO idx_endpoints_enabled;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'tlsentinel' AND indexname = 'idx_hosts_scanner_id') THEN
    ALTER INDEX tlsentinel.idx_hosts_scanner_id RENAME TO idx_endpoints_scanner_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_endpoints_type ON tlsentinel.endpoints(type);

-- Rename host_scan_history to endpoint_scan_history
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'tlsentinel' AND table_name = 'host_scan_history' AND column_name = 'host_id'
  ) THEN
    ALTER TABLE tlsentinel.host_scan_history RENAME COLUMN host_id TO endpoint_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'tlsentinel' AND indexname = 'idx_host_scan_history_host_id') THEN
    ALTER INDEX tlsentinel.idx_host_scan_history_host_id RENAME TO idx_endpoint_scan_history_endpoint_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'tlsentinel' AND tablename = 'host_scan_history') THEN
    ALTER TABLE tlsentinel.host_scan_history RENAME TO endpoint_scan_history;
  END IF;
END $$;

-- Rename host_tls_profiles to endpoint_tls_profiles
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'tlsentinel' AND table_name = 'host_tls_profiles' AND column_name = 'host_id'
  ) THEN
    ALTER TABLE tlsentinel.host_tls_profiles RENAME COLUMN host_id TO endpoint_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'tlsentinel' AND tablename = 'host_tls_profiles') THEN
    ALTER TABLE tlsentinel.host_tls_profiles RENAME TO endpoint_tls_profiles;
  END IF;
END $$;
