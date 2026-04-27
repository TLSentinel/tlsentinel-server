package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// UpsertEndpointTLSProfile inserts or replaces the TLS profile for an endpoint.
// scanned_at is set entirely by the database (DEFAULT NOW() on insert, NOW()
// on conflict) so both paths use the same clock source.
func (s *Store) UpsertEndpointTLSProfile(ctx context.Context, endpointID string, req models.TLSProfileIngestRequest) error {
	row := &EndpointTLSProfile{
		EndpointID:     endpointID,
		SSL30:          req.SSL30,
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
		ExcludeColumn("scanned_at").
		On("CONFLICT (endpoint_id) DO UPDATE SET" +
			" scanned_at = NOW()," +
			" ssl30 = EXCLUDED.ssl30," +
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

// GetEndpointTLSProfile returns the stored TLS profile for an endpoint.
// Returns ErrNotFound if no profile exists yet.
func (s *Store) GetEndpointTLSProfile(ctx context.Context, endpointID string) (models.EndpointTLSProfile, error) {
	var row EndpointTLSProfile
	err := s.db.NewSelect().
		Model(&row).
		Where("endpoint_id = ?", endpointID).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.EndpointTLSProfile{}, ErrNotFound
		}
		return models.EndpointTLSProfile{}, fmt.Errorf("failed to get TLS profile: %w", err)
	}
	return models.EndpointTLSProfile{
		EndpointID:     row.EndpointID,
		ScannedAt:      row.ScannedAt,
		SSL30:          row.SSL30,
		TLS10:          row.TLS10,
		TLS11:          row.TLS11,
		TLS12:          row.TLS12,
		TLS13:          row.TLS13,
		CipherSuites:   row.CipherSuites,
		SelectedCipher: row.SelectedCipher,
		ScanError:      row.ScanError,
	}, nil
}
