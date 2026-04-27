-- Drop the FK to certificates — discovered certs are not stored, just displayed.
-- Add cert context columns directly on the inbox row.
ALTER TABLE tlsentinel.discovery_inbox
    DROP CONSTRAINT IF EXISTS discovery_inbox_fingerprint_fkey,
    ADD COLUMN IF NOT EXISTS common_name TEXT,
    ADD COLUMN IF NOT EXISTS sans        TEXT[],
    ADD COLUMN IF NOT EXISTS not_after   TIMESTAMPTZ;
