ALTER TABLE tlsentinel.users
    ADD COLUMN IF NOT EXISTS calendar_token TEXT UNIQUE;
