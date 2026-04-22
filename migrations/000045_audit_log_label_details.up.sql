-- Make audit log entries self-explanatory without lookups.
--
-- resource_label captures a human-readable snapshot of the target (e.g.
-- username, endpoint name, scanner name) at the time of the action, so the
-- log stays readable even after the resource is renamed or deleted.
--
-- details holds structured context for the action (before/after values on
-- updates, counts on maintenance runs, …). It reuses the previously
-- unused `changes` column — we're pre-release and nothing wrote to it, so
-- a rename is cheaper than adding yet another JSONB column.
ALTER TABLE tlsentinel.audit_logs
    ADD COLUMN resource_label TEXT;

ALTER TABLE tlsentinel.audit_logs
    RENAME COLUMN changes TO details;
