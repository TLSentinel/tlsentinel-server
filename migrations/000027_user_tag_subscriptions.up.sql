CREATE TABLE tlsentinel.user_tag_subscriptions (
    user_id UUID NOT NULL REFERENCES tlsentinel.users(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES tlsentinel.tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX user_tag_subscriptions_tag_idx
    ON tlsentinel.user_tag_subscriptions (tag_id);
