package db

import (
	"context"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// ListExpiringCerts returns all active certificates whose days_remaining is at or below the given threshold,
// ordered by days remaining ascending (most urgent first).
func (s *Store) ListExpiringCerts(ctx context.Context, daysRemaining int) ([]models.ExpiringCertItem, error) {
	var rows []VActiveCertificate
	err := s.db.NewSelect().
		Model(&rows).
		Where("days_remaining <= ?", daysRemaining).
		OrderExpr("days_remaining ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list expiring certs: %w", err)
	}

	items := make([]models.ExpiringCertItem, len(rows))
	for i, r := range rows {
		items[i] = models.ExpiringCertItem{
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
	return items, nil
}
