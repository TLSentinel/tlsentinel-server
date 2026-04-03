-- Migration 000023: Endpoint tagging system
-- Categories define classification dimensions (Environment, Application, Owner, etc.)
-- Tags are values within a category. Endpoints can have any number of tags.

CREATE TABLE tlsentinel.tag_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tag_categories_name UNIQUE (name)
);

CREATE TABLE tlsentinel.tags (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID        NOT NULL REFERENCES tlsentinel.tag_categories(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tags_category_name UNIQUE (category_id, name)
);

CREATE INDEX idx_tags_category_id ON tlsentinel.tags(category_id);

CREATE TABLE tlsentinel.endpoint_tags (
    endpoint_id UUID NOT NULL REFERENCES tlsentinel.endpoints(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tlsentinel.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (endpoint_id, tag_id)
);

CREATE INDEX idx_endpoint_tags_tag_id ON tlsentinel.endpoint_tags(tag_id);
