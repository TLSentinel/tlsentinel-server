package db

import (
	"context"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// ListExpiringActiveCerts returns all active certificates with days_remaining
// at or below maxDays, ordered by days_remaining ascending (most urgent first).
func (s *Store) ListExpiringActiveCerts(ctx context.Context, maxDays int) ([]models.ExpiringCertItem, error) {
	var rows []VActiveCertificate
	err := s.db.NewSelect().
		Model(&rows).
		Where("days_remaining <= ?", maxDays).
		OrderExpr("days_remaining ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list expiring certs: %w", err)
	}

	out := make([]models.ExpiringCertItem, len(rows))
	for i, r := range rows {
		out[i] = models.ExpiringCertItem{
			HostID:        r.HostID,
			HostName:      r.HostName,
			DNSName:       r.DNSName,
			Port:          r.Port,
			Fingerprint:   r.Fingerprint,
			CommonName:    r.CommonName,
			NotAfter:      r.NotAfter,
			DaysRemaining: r.DaysRemaining,
		}
	}
	return out, nil
}

// TryInsertExpiryAlert attempts to record that an alert was sent for the given
// (fingerprint, thresholdDays) pair. Returns true if the row was inserted
// (first-time alert), false if it already existed (duplicate, skip sending).
func (s *Store) TryInsertExpiryAlert(ctx context.Context, fingerprint string, thresholdDays int) (bool, error) {
	row := &CertificateExpiryAlert{
		Fingerprint:   fingerprint,
		ThresholdDays: thresholdDays,
	}
	res, err := s.db.NewInsert().
		Model(row).
		Value("alerted_at", "NOW()").
		On("CONFLICT (fingerprint, threshold_days) DO NOTHING").
		Exec(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to insert expiry alert: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ListNotifyUsers returns all enabled users with notify=true and a non-null email.
func (s *Store) ListNotifyUsers(ctx context.Context) ([]models.User, error) {
	var rows []User
	err := s.db.NewSelect().
		Model(&rows).
		Where("enabled = TRUE").
		Where("notify = TRUE").
		Where("email IS NOT NULL").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list notify users: %w", err)
	}

	out := make([]models.User, len(rows))
	for i, r := range rows {
		out[i] = userToModel(r)
	}
	return out, nil
}
