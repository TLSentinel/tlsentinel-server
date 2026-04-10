package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// GetNotificationTemplate returns the customised template for the given
// event_type+channel, or ErrNotFound if no override exists in the DB.
func (s *Store) GetNotificationTemplate(ctx context.Context, eventType, channel string) (*NotificationTemplate, error) {
	var t NotificationTemplate
	err := s.db.NewSelect().
		Model(&t).
		Where("event_type = ?", eventType).
		Where("channel = ?", channel).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get notification template: %w", err)
	}
	return &t, nil
}

// ListNotificationTemplates returns all customised templates stored in the DB.
func (s *Store) ListNotificationTemplates(ctx context.Context) ([]NotificationTemplate, error) {
	var templates []NotificationTemplate
	err := s.db.NewSelect().
		Model(&templates).
		OrderExpr("event_type ASC, channel ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("list notification templates: %w", err)
	}
	return templates, nil
}

// UpsertNotificationTemplate creates or replaces a template override.
func (s *Store) UpsertNotificationTemplate(ctx context.Context, eventType, channel string, subject *string, body, format string) (*NotificationTemplate, error) {
	t := &NotificationTemplate{
		EventType: eventType,
		Channel:   channel,
		Subject:   subject,
		Body:      body,
		Format:    format,
		UpdatedAt: time.Now(),
	}
	_, err := s.db.NewInsert().
		Model(t).
		On("CONFLICT (event_type, channel) DO UPDATE").
		Set("subject = EXCLUDED.subject").
		Set("body = EXCLUDED.body").
		Set("format = EXCLUDED.format").
		Set("updated_at = EXCLUDED.updated_at").
		Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("upsert notification template: %w", err)
	}
	return t, nil
}

// ResetNotificationTemplate deletes a DB override, restoring the embedded default.
// Returns nil (not ErrNotFound) if no override existed — reset is idempotent.
func (s *Store) ResetNotificationTemplate(ctx context.Context, eventType, channel string) error {
	_, err := s.db.NewDelete().
		Model(&NotificationTemplate{}).
		Where("event_type = ?", eventType).
		Where("channel = ?", channel).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("reset notification template: %w", err)
	}
	return nil
}
