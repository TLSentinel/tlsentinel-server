-- Migration 000026: Add scan_exempt flag to endpoints.
--
-- When true the scanner skips this endpoint entirely, regardless of any
-- scanner assignment. Useful for endpoints that are manually maintained
-- but should still be tracked in the inventory.

ALTER TABLE tlsentinel.endpoints
    ADD COLUMN IF NOT EXISTS scan_exempt BOOLEAN NOT NULL DEFAULT FALSE;
