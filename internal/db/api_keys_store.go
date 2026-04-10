package db

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// GetAPIKeyByHash looks up an API key by its SHA-256 hash and updates last_used_at.
// Returns ErrNotFound if no matching key exists.
func (s *Store) GetAPIKeyByHash(ctx context.Context, hash string) (*UserAPIKey, error) {
	var key UserAPIKey
	err := s.db.NewSelect().
		Model(&key).
		Where("key_hash = ?", hash).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get api key by hash: %w", err)
	}
	// Update last_used_at in the background — best effort, don't block the request.
	now := time.Now()
	_, _ = s.db.NewUpdate().
		Model(&UserAPIKey{}).
		Set("last_used_at = ?", now).
		Where("id = ?", key.ID).
		Exec(ctx)
	key.LastUsedAt = &now
	return &key, nil
}

// ListAPIKeys returns all API keys for the given user, ordered by created_at desc.
func (s *Store) ListAPIKeys(ctx context.Context, userID string) ([]UserAPIKey, error) {
	var keys []UserAPIKey
	err := s.db.NewSelect().
		Model(&keys).
		Where("user_id = ?", userID).
		OrderExpr("created_at DESC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list api keys: %w", err)
	}
	return keys, nil
}

// CreateAPIKey inserts a new API key row. The caller is responsible for generating
// the raw key, hashing it, and extracting the prefix before calling this.
func (s *Store) CreateAPIKey(ctx context.Context, userID, name, keyHash, prefix string) (*UserAPIKey, error) {
	key := &UserAPIKey{
		UserID:  userID,
		Name:    name,
		KeyHash: keyHash,
		Prefix:  prefix,
	}
	_, err := s.db.NewInsert().Model(key).ExcludeColumn("id", "created_at", "last_used_at").Returning("*").Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("create api key: %w", err)
	}
	return key, nil
}

// DeleteAPIKey deletes an API key by ID, scoped to the owning user.
// Returns ErrNotFound if the key doesn't exist or belongs to a different user.
func (s *Store) DeleteAPIKey(ctx context.Context, userID, keyID string) error {
	res, err := s.db.NewDelete().
		Model(&UserAPIKey{}).
		Where("id = ?", keyID).
		Where("user_id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete api key: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// HashAPIKey returns the SHA-256 hex digest of the given raw key.
func HashAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum)
}
