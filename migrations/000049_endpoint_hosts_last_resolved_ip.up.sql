-- Add a denormalized "last resolved IP" column on endpoint_hosts so the
-- universal-search header can match an IP query against host endpoints in
-- one bounded query, without scanning endpoint_scan_history per keystroke.
--
-- Three IP-bearing fields end up reachable from search after this:
--   - dns_name        — operator-typed; may itself be an IP literal
--   - ip_address      — operator-supplied override (rare, but explicit)
--   - last_resolved_ip — what the scanner last connected to on success
--
-- The column is updated by RecordScanResult on each successful scan and
-- left untouched on errors (we want "the most recent IP we observed,"
-- not "today's resolution attempt"). Backfill below populates existing
-- rows from endpoint_scan_history; new endpoints start NULL until their
-- first successful scan.
ALTER TABLE tlsentinel.endpoint_hosts
    ADD COLUMN IF NOT EXISTS last_resolved_ip TEXT;

-- Backfill from the most recent non-error scan per endpoint. DISTINCT ON
-- with the matching ORDER BY is the canonical PG idiom for "latest row
-- per group" and is faster than a correlated subquery here.
UPDATE tlsentinel.endpoint_hosts AS eh
SET last_resolved_ip = h.resolved_ip
FROM (
    SELECT DISTINCT ON (endpoint_id) endpoint_id, resolved_ip
    FROM tlsentinel.endpoint_scan_history
    WHERE resolved_ip IS NOT NULL
    ORDER BY endpoint_id, scanned_at DESC
) h
WHERE h.endpoint_id = eh.endpoint_id;

-- Index for IP-search prefix lookups. Plain b-tree on the text column is
-- enough for `LIKE 'prefix%'` (PG can use it left-anchored without
-- pg_trgm). Substring search isn't a goal — IP fragments are hierarchical.
CREATE INDEX IF NOT EXISTS idx_endpoint_hosts_last_resolved_ip
    ON tlsentinel.endpoint_hosts (last_resolved_ip)
    WHERE last_resolved_ip IS NOT NULL;
