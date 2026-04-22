ALTER TABLE tlsentinel.audit_logs
    RENAME COLUMN details TO changes;

ALTER TABLE tlsentinel.audit_logs
    DROP COLUMN IF EXISTS resource_label;
