-- Revert username back to plain TEXT. The data is unchanged (CITEXT and
-- TEXT share the same wire format), so the column type swap is safe.
-- The citext extension itself is left installed; uninstalling it would
-- break any other column that adopted it after the up-migration ran.
ALTER TABLE tlsentinel.users
    ALTER COLUMN username TYPE TEXT;
