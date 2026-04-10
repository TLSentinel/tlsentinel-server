CREATE TABLE IF NOT EXISTS tlsentinel.notification_templates (
    event_type  TEXT        NOT NULL,
    channel     TEXT        NOT NULL,
    subject     TEXT,
    body        TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_type, channel)
);
