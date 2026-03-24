CREATE TABLE IF NOT EXISTS tlsentinel.groups (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tlsentinel.host_groups (
    host_id     UUID NOT NULL REFERENCES tlsentinel.hosts(id)   ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES tlsentinel.groups(id)  ON DELETE CASCADE,
    PRIMARY KEY (host_id, group_id)
);

CREATE TABLE IF NOT EXISTS tlsentinel.user_groups (
    user_id     UUID NOT NULL REFERENCES tlsentinel.users(id)   ON DELETE CASCADE,
    group_id    UUID NOT NULL REFERENCES tlsentinel.groups(id)  ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    PRIMARY KEY (user_id, group_id)
);
