CREATE TABLE IF NOT EXISTS tlsentinel.users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT,                                -- NULL for OIDC/SAML-only users
    provider      TEXT        NOT NULL DEFAULT 'local',
    provider_id   TEXT        NOT NULL,                -- local: same as username
    role          TEXT        NOT NULL DEFAULT 'admin', -- admin | viewer
    first_name    TEXT,
    last_name     TEXT,
    email         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_users_provider UNIQUE (provider, provider_id)
);
