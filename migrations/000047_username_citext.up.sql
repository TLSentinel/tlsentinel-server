-- Make usernames case-insensitive without losing display fidelity.
--
-- Today `users.username` is plain TEXT with the default collation, so
-- `bob`, `Bob`, and `BOB` resolve to three distinct accounts and a login
-- form failure if a user types the wrong case. Industry default for an
-- auth identifier is case-preserving display + case-insensitive compare:
-- `Bob.Smith` shows up in the audit log as `Bob.Smith`, but logs in
-- whether you type `bob.smith`, `BOB.SMITH`, or anything in between.
--
-- The `citext` extension is the Postgres-native answer — equality and
-- the existing UNIQUE constraint become case-insensitive at the storage
-- layer, so app code doesn't have to remember to wrap every comparison
-- in LOWER(). It ships with `postgres-contrib` and is available on every
-- mainstream managed Postgres in 2026.
--
-- audit_logs.username stays TEXT — it's a snapshot taken at action time,
-- not an identity column, and we want it to render exactly as captured.

CREATE EXTENSION IF NOT EXISTS citext;

-- Pre-flight: catch any case-collision pairs before ALTER TYPE would
-- (CITEXT's UNIQUE constraint would reject them, but a clear message
-- beats a generic constraint violation if the DBA hits this on upgrade).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM tlsentinel.users
        GROUP BY LOWER(username)
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Username case collision detected. Resolve duplicates manually before applying this migration. Example query: SELECT LOWER(username), array_agg(username) FROM tlsentinel.users GROUP BY LOWER(username) HAVING COUNT(*) > 1;';
    END IF;
END $$;

ALTER TABLE tlsentinel.users
    ALTER COLUMN username TYPE CITEXT;
