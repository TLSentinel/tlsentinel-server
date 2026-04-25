-- Time-based One-Time Password (TOTP) for local accounts.
--
-- Industry-standard second factor for password logins: the user scans a
-- QR code into Authy / Google Authenticator / 1Password / etc. and types
-- the 6-digit rolling code on every login. Backed by RFC 6238.
--
-- OIDC-provisioned accounts are out of scope — their MFA is enforced at
-- the IdP (Entra Conditional Access, Okta MFA policies, Google 2-Step,
-- ...). Mixing in an app-side prompt would let a user disable TOTP at
-- the IdP and still have a "TOTP enabled" flag here, giving false
-- comfort. We refuse to enroll OIDC accounts in TOTP at the API layer
-- so this column only ever applies to provider='local' rows.
--
-- The shared secret is encrypted at rest with the same AES-256-GCM
-- envelope used for SMTP passwords (see internal/crypto, key from
-- TLSENTINEL_ENCRYPTION_KEY). A DB dump on its own does not yield a
-- working second factor — an attacker also needs the encryption key.
--
-- Recovery codes live in a sibling table, not on the user row, so we
-- can mark each one consumed without rewriting the user row, and so the
-- audit trail (which row was used, when) survives a regenerate. They
-- are stored as bcrypt hashes — same primitive we already trust for
-- passwords — and only ever rendered to the user once, immediately
-- after generation.

ALTER TABLE tlsentinel.users
    ADD COLUMN totp_secret     TEXT,                          -- AES-GCM ciphertext, NULL when not enrolled
    ADD COLUMN totp_enabled    BOOLEAN NOT NULL DEFAULT FALSE, -- true after the user verifies the first code
    ADD COLUMN totp_enrolled_at TIMESTAMPTZ;                  -- audit hint; NULL until first successful verify

CREATE TABLE IF NOT EXISTS tlsentinel.user_totp_recovery_codes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES tlsentinel.users(id) ON DELETE CASCADE,
    code_hash   TEXT        NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_totp_recovery_codes_user
    ON tlsentinel.user_totp_recovery_codes (user_id)
    WHERE used_at IS NULL;
