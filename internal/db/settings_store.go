package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// ---------------------------------------------------------------------------
// Generic primitives
// ---------------------------------------------------------------------------

// GetSetting retrieves the raw JSONB value for the given key.
// Returns ErrNotFound if the key does not exist.
func (s *Store) GetSetting(ctx context.Context, key string) (json.RawMessage, error) {
	var row Setting
	err := s.db.NewSelect().
		Model(&row).
		Where("key = ?", key).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get setting %q: %w", key, err)
	}
	return row.Value, nil
}

// SetSetting upserts a setting by key. value is marshalled to JSONB.
func (s *Store) SetSetting(ctx context.Context, key string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("marshal setting %q: %w", key, err)
	}
	row := &Setting{Key: key, Value: raw}
	_, err = s.db.NewInsert().
		Model(row).
		On("CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("set setting %q: %w", key, err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Typed wrappers
// ---------------------------------------------------------------------------

// GetAlertThresholds returns the configured expiry alert thresholds in days.
// Falls back to models.DefaultAlertThresholds if the key is not set.
func (s *Store) GetAlertThresholds(ctx context.Context) ([]int, error) {
	raw, err := s.GetSetting(ctx, models.AlertThresholdsKey)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return models.DefaultAlertThresholds, nil
		}
		return nil, err
	}
	var thresholds []int
	if err := json.Unmarshal(raw, &thresholds); err != nil {
		return nil, fmt.Errorf("decode alert thresholds: %w", err)
	}
	return thresholds, nil
}

// SetAlertThresholds persists the given expiry alert thresholds.
func (s *Store) SetAlertThresholds(ctx context.Context, thresholds []int) error {
	return s.SetSetting(ctx, models.AlertThresholdsKey, thresholds)
}

