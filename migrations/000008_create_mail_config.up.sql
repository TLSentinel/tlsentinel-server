-- Single-row settings table enforced by CHECK constraint.
CREATE TABLE IF NOT EXISTS tlsentinel.mail_config (
    id            INT         PRIMARY KEY DEFAULT 1,
    enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
    smtp_host     TEXT        NOT NULL DEFAULT '',
    smtp_port     INT         NOT NULL DEFAULT 587,
    auth_type     TEXT        NOT NULL DEFAULT 'plain',    -- none | plain | login
    smtp_username TEXT        NOT NULL DEFAULT '',
    smtp_password TEXT        NOT NULL DEFAULT '',         -- AES-256-GCM ciphertext
    from_address  TEXT        NOT NULL DEFAULT '',
    from_name     TEXT        NOT NULL DEFAULT '',
    tls_mode      TEXT        NOT NULL DEFAULT 'starttls', -- none | starttls | tls
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mail_config_one_row CHECK (id = 1)
);
