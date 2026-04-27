-- Add ssl30 column to endpoint_tls_profiles so the scanner can record
-- whether an endpoint still accepts SSL 3.0. Enables SSLv3-POODLE detection
-- via the existing score.go auto-F rule without requiring active exploitation.

ALTER TABLE tlsentinel.endpoint_tls_profiles
    ADD COLUMN IF NOT EXISTS ssl30 BOOLEAN NOT NULL DEFAULT FALSE;
