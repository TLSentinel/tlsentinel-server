package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// GetMailConfig returns the singleton mail configuration row (id=1).
// Returns ErrNotFound if no configuration has been saved yet.
func (s *Store) GetMailConfig(ctx context.Context) (models.MailConfig, error) {
	var row MailConfig
	err := s.db.NewSelect().
		Model(&row).
		Where("id = 1").
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.MailConfig{}, ErrNotFound
		}
		return models.MailConfig{}, fmt.Errorf("failed to get mail config: %w", err)
	}
	return models.MailConfig{
		Enabled:      row.Enabled,
		SMTPHost:     row.SMTPHost,
		SMTPPort:     row.SMTPPort,
		AuthType:     row.AuthType,
		SMTPUsername: row.SMTPUsername,
		SMTPPassword: row.SMTPPassword,
		FromAddress:  row.FromAddress,
		FromName:     row.FromName,
		TLSMode:      row.TLSMode,
		UpdatedAt:    row.UpdatedAt,
	}, nil
}

// UpsertMailConfig creates or replaces the singleton mail configuration row.
func (s *Store) UpsertMailConfig(ctx context.Context, cfg models.MailConfig) error {
	row := &MailConfig{
		ID:           1,
		Enabled:      cfg.Enabled,
		SMTPHost:     cfg.SMTPHost,
		SMTPPort:     cfg.SMTPPort,
		AuthType:     cfg.AuthType,
		SMTPUsername: cfg.SMTPUsername,
		SMTPPassword: cfg.SMTPPassword,
		FromAddress:  cfg.FromAddress,
		FromName:     cfg.FromName,
		TLSMode:      cfg.TLSMode,
	}
	_, err := s.db.NewInsert().
		Model(row).
		On("CONFLICT (id) DO UPDATE SET" +
			" enabled = EXCLUDED.enabled," +
			" smtp_host = EXCLUDED.smtp_host," +
			" smtp_port = EXCLUDED.smtp_port," +
			" auth_type = EXCLUDED.auth_type," +
			" smtp_username = EXCLUDED.smtp_username," +
			" smtp_password = EXCLUDED.smtp_password," +
			" from_address = EXCLUDED.from_address," +
			" from_name = EXCLUDED.from_name," +
			" tls_mode = EXCLUDED.tls_mode," +
			" updated_at = NOW()").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to upsert mail config: %w", err)
	}
	return nil
}
