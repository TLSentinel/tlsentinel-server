DROP INDEX IF EXISTS tlsentinel.idx_user_totp_recovery_codes_user;
DROP TABLE IF EXISTS tlsentinel.user_totp_recovery_codes;

ALTER TABLE tlsentinel.users
    DROP COLUMN IF EXISTS totp_enrolled_at,
    DROP COLUMN IF EXISTS totp_enabled,
    DROP COLUMN IF EXISTS totp_secret;
