ALTER TABLE tlsentinel.certificates
    DROP COLUMN IF EXISTS subject_org,
    DROP COLUMN IF EXISTS subject_ou;
