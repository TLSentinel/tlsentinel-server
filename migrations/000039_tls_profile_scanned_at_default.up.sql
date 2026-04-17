-- Set DB-side default for endpoint_tls_profiles.scanned_at so the app no
-- longer stamps this column from its own clock. Keeps the canonical clock
-- on Postgres across both INSERT and ON CONFLICT DO UPDATE paths.
ALTER TABLE tlsentinel.endpoint_tls_profiles
    ALTER COLUMN scanned_at SET DEFAULT NOW();
