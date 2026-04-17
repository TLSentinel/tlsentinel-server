package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
"github.com/uptrace/bun"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

func scannerToResponse(s Scanner) models.ScannerTokenResponse {
	return models.ScannerTokenResponse{
		ID:                 s.ID,
		Name:               s.Name,
		IsDefault:          s.IsDefault,
		ScanCronExpression: s.ScanCronExpression,
		ScanConcurrency:    s.ScanConcurrency,
		CreatedAt:          s.CreatedAt,
		LastUsedAt:         s.LastUsedAt,
	}
}

// GetScannerTokenByHash looks up a scanner by its SHA-256 token hash.
// Used for fast O(1) auth of stx_s_ prefixed tokens.
func (s *Store) GetScannerTokenByHash(ctx context.Context, hash string) (models.ScannerToken, error) {
	var row Scanner
	err := s.db.NewSelect().
		Model(&row).
		ColumnExpr("id, name, token_hash, created_at, last_used_at").
		Where("token_hash = ?", hash).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.ScannerToken{}, ErrNotFound
		}
		return models.ScannerToken{}, fmt.Errorf("failed to get scanner token by hash: %w", err)
	}
	return models.ScannerToken{
		ID:         row.ID,
		Name:       row.Name,
		TokenHash:  row.TokenHash,
		CreatedAt:  row.CreatedAt,
		LastUsedAt: row.LastUsedAt,
	}, nil
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

// InsertScannerToken creates a new scanner token with the given name, token hash,
// and scan configuration. Callers are responsible for applying defaults before
// calling this function.
func (s *Store) InsertScannerToken(ctx context.Context, name, tokenHash, scanCronExpression string, scanConcurrency int) (models.ScannerTokenResponse, error) {
	row := &Scanner{
		Name:               name,
		TokenHash:          tokenHash,
		ScanCronExpression: scanCronExpression,
		ScanConcurrency:    scanConcurrency,
	}
	// Exclude id, is_default, and created_at so DB-managed defaults are used.
	if _, err := s.db.NewInsert().Model(row).
		ExcludeColumn("id", "is_default", "created_at").
		Returning("*").
		Exec(ctx); err != nil {
		return models.ScannerTokenResponse{}, fmt.Errorf("failed to insert scanner token: %w", err)
	}
	return scannerToResponse(*row), nil
}

// UpdateScannerToken updates the name and scan settings for a scanner token.
func (s *Store) UpdateScannerToken(ctx context.Context, id, name, scanCronExpression string, scanConcurrency int) (models.ScannerTokenResponse, error) {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.scanners").
		Set("name = ?", name).
		Set("scan_cron_expression = ?", scanCronExpression).
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
//
// Two-step transaction is required because the partial unique index on (is_default) WHERE
// is_default = TRUE is non-deferrable.  A single-statement SET is_default = (id = $1) can
// transiently have two TRUE rows when PostgreSQL processes the "new TRUE" row before the
// "old TRUE" row, triggering a constraint violation.
func (s *Store) SetDefaultScannerToken(ctx context.Context, id string) error {
	return s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// Step 1: verify the target scanner exists.
		var count int
		if err := tx.NewSelect().
			TableExpr("tlsentinel.scanners").
			ColumnExpr("COUNT(*)").
			Where("id = ?", id).
			Scan(ctx, &count); err != nil {
			return fmt.Errorf("failed to check scanner existence: %w", err)
		}
		if count == 0 {
			return ErrNotFound
		}

		// Step 2: clear all defaults first (removes any TRUE row from the partial index).
		if _, err := tx.NewUpdate().
			TableExpr("tlsentinel.scanners").
			Set("is_default = FALSE").
			Where("is_default = TRUE").
			Exec(ctx); err != nil {
			return fmt.Errorf("failed to clear default scanner: %w", err)
		}

		// Step 3: set the new default (inserts exactly one TRUE row into the partial index).
		res, err := tx.NewUpdate().
			TableExpr("tlsentinel.scanners").
			Set("is_default = TRUE").
			Where("id = ?", id).
			Exec(ctx)
		if err != nil {
			return fmt.Errorf("failed to set default scanner: %w", err)
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return ErrNotFound
		}
		return nil
	})
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
