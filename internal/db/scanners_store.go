package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

func scannerToResponse(s Scanner) models.ScannerTokenResponse {
	return models.ScannerTokenResponse{
		ID:                  s.ID,
		Name:                s.Name,
		IsDefault:           s.IsDefault,
		ScanIntervalSeconds: s.ScanIntervalSeconds,
		ScanConcurrency:     s.ScanConcurrency,
		CreatedAt:           s.CreatedAt,
		LastUsedAt:          s.LastUsedAt,
	}
}

// GetAllScannerTokenHashes returns the minimal scanner data needed for auth middleware.
func (s *Store) GetAllScannerTokenHashes(ctx context.Context) ([]models.ScannerToken, error) {
	var rows []Scanner
	err := s.db.NewSelect().
		Model(&rows).
		ColumnExpr("id, name, token_hash, created_at, last_used_at").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get scanner token hashes: %w", err)
	}

	result := make([]models.ScannerToken, len(rows))
	for i, r := range rows {
		result[i] = models.ScannerToken{
			ID:         r.ID,
			Name:       r.Name,
			TokenHash:  r.TokenHash,
			CreatedAt:  r.CreatedAt,
			LastUsedAt: r.LastUsedAt,
		}
	}
	return result, nil
}

// TouchScannerToken updates last_used_at for the given scanner ID.
func (s *Store) TouchScannerToken(ctx context.Context, id string) error {
	_, err := s.db.NewUpdate().
		TableExpr("tlsentinel.scanners").
		Set("last_used_at = NOW()").
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to touch scanner token: %w", err)
	}
	return nil
}

// ListScannerTokens returns all scanner tokens ordered by creation time.
func (s *Store) ListScannerTokens(ctx context.Context) ([]models.ScannerTokenResponse, error) {
	var rows []Scanner
	err := s.db.NewSelect().
		Model(&rows).
		OrderExpr("created_at ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list scanner tokens: %w", err)
	}

	result := make([]models.ScannerTokenResponse, len(rows))
	for i, r := range rows {
		result[i] = scannerToResponse(r)
	}
	return result, nil
}

// GetScannerToken returns a single scanner token by ID.
func (s *Store) GetScannerToken(ctx context.Context, id string) (models.ScannerTokenResponse, error) {
	var row Scanner
	err := s.db.NewSelect().
		Model(&row).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ScannerTokenResponse{}, ErrNotFound
		}
		return models.ScannerTokenResponse{}, fmt.Errorf("failed to get scanner token: %w", err)
	}
	return scannerToResponse(row), nil
}

// InsertScannerToken creates a new scanner token with the given name and token hash.
func (s *Store) InsertScannerToken(ctx context.Context, name, tokenHash string) (models.ScannerTokenResponse, error) {
	row := &Scanner{
		Name:      name,
		TokenHash: tokenHash,
	}
	if _, err := s.db.NewInsert().Model(row).ExcludeColumn("id").Returning("*").Exec(ctx); err != nil {
		return models.ScannerTokenResponse{}, fmt.Errorf("failed to insert scanner token: %w", err)
	}
	return scannerToResponse(*row), nil
}

// UpdateScannerToken updates the name and scan settings for a scanner token.
func (s *Store) UpdateScannerToken(ctx context.Context, id, name string, scanIntervalSeconds, scanConcurrency int) (models.ScannerTokenResponse, error) {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.scanners").
		Set("name = ?", name).
		Set("scan_interval_seconds = ?", scanIntervalSeconds).
		Set("scan_concurrency = ?", scanConcurrency).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return models.ScannerTokenResponse{}, fmt.Errorf("failed to update scanner token: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return models.ScannerTokenResponse{}, ErrNotFound
	}
	return s.GetScannerToken(ctx, id)
}

// SetDefaultScannerToken marks the given scanner as the default and clears the flag on all others.
// Returns ErrNotFound if the scanner does not exist.
func (s *Store) SetDefaultScannerToken(ctx context.Context, id string) error {
	// Verify the scanner exists first.
	var count int
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.scanners").
		ColumnExpr("COUNT(*)").
		Where("id = ?", id).
		Scan(ctx, &count); err != nil {
		return fmt.Errorf("failed to check scanner existence: %w", err)
	}
	if count == 0 {
		return ErrNotFound
	}

	_, err := s.db.ExecContext(ctx,
		`UPDATE tlsentinel.scanners SET is_default = (id = $1::uuid)`, id)
	if err != nil {
		return fmt.Errorf("failed to set default scanner: %w", err)
	}
	return nil
}

// DeleteScannerToken removes a scanner token by ID.
func (s *Store) DeleteScannerToken(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().
		Model((*Scanner)(nil)).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete scanner token: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
