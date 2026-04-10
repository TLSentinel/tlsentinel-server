ALTER TABLE tlsentinel.notification_templates
    ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'html';
