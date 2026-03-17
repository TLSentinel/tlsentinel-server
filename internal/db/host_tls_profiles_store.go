package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// UpsertHostTLSProfile inserts or replaces the TLS profile for a host.
func (s *Store) UpsertHostTLSProfile(ctx context.Context, hostID string, req models.TLSProfileIngestRequest) error {
	row := &HostTLSProfile{
		HostID:         hostID,
		TLS10:          req.TLS10,
		TLS11:          req.TLS11,
		TLS12:          req.TLS12,
		TLS13:          req.TLS13,
		CipherSuites:   req.CipherSuites,
		SelectedCipher: req.SelectedCipher,
		ScanError:      req.ScanError,
	}
	_, err := s.db.NewInsert().
		Model(row).
		On("CONFLICT (host_id) DO UPDATE SET" +
			" scanned_at = NOW()," +
			" tls10 = EXCLUDED.tls10," +
			" tls11 = EXCLUDED.tls11," +
			" tls12 = EXCLUDED.tls12," +
			" tls13 = EXCLUDED.tls13," +
			" cipher_suites = EXCLUDED.cipher_suites," +
			" selected_cipher = EXCLUDED.selected_cipher," +
			" scan_error = EXCLUDED.scan_error").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to upsert TLS profile: %w", err)
	}
	return nil
}

// GetHostTLSProfile returns the stored TLS profile for a host.
// Returns ErrNotFound if no profile exists yet.
func (s *Store) GetHostTLSProfile(ctx context.Context, hostID string) (models.HostTLSProfile, error) {
	var row HostTLSProfile
	err := s.db.NewSelect().
		Model(&row).
		Where("host_id = ?", hostID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.HostTLSProfile{}, ErrNotFound
		}
		return models.HostTLSProfile{}, fmt.Errorf("failed to get TLS profile: %w", err)
	}
	return models.HostTLSProfile{
		HostID:         row.HostID,
		ScannedAt:      row.ScannedAt,
		TLS10:          row.TLS10,
		TLS11:          row.TLS11,
		TLS12:          row.TLS12,
		TLS13:          row.TLS13,
		CipherSuites:   row.CipherSuites,
		SelectedCipher: row.SelectedCipher,
		ScanError:      row.ScanError,
	}, nil
}
