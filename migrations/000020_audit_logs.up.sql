CREATE TABLE IF NOT EXISTS tlsentinel.audit_logs (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID,
    username      TEXT         NOT NULL,
    action        TEXT         NOT NULL,
    resource_type TEXT,
    resource_id   TEXT,
    ip_address    TEXT,
    changes       JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON tlsentinel.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx    ON tlsentinel.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx     ON tlsentinel.audit_logs (action);
