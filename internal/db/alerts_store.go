package db

import (
	"context"
	"fmt"

	"github.com/uptrace/bun"

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
			EndpointID:    r.EndpointID,
			EndpointName:  r.EndpointName,
			EndpointType:  r.EndpointType,
			Fingerprint:   r.Fingerprint,
			CommonName:    r.CommonName,
			NotAfter:      r.NotAfter,
			DaysRemaining: r.DaysRemaining,
		}
	}
	return out, nil
}

// ListExpiringActiveCertsTagged returns expiring certs filtered to endpoints that
// share at least one tag with the user's subscriptions. If the user has no
// subscriptions the call falls back to ListExpiringActiveCerts (notify-all).
func (s *Store) ListExpiringActiveCertsTagged(ctx context.Context, userID string, maxDays int) ([]models.ExpiringCertItem, error) {
	// Resolve the set of endpoint IDs reachable via the user's tag subscriptions.
	var epRows []struct {
		EndpointID string `bun:"endpoint_id"`
	}
	err := s.db.NewSelect().
		TableExpr("tlsentinel.endpoint_tags AS et").
		ColumnExpr("DISTINCT et.endpoint_id").
		Join("JOIN tlsentinel.user_tag_subscriptions uts ON uts.tag_id = et.tag_id").
		Where("uts.user_id = ?", userID).
		Scan(ctx, &epRows)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve subscribed endpoints: %w", err)
	}
	if len(epRows) == 0 {
		return s.ListExpiringActiveCerts(ctx, maxDays)
	}
	endpointIDs := make([]string, len(epRows))
	for i, r := range epRows {
		endpointIDs[i] = r.EndpointID
	}

	var rows []VActiveCertificate
	err = s.db.NewSelect().
		Model(&rows).
		Where("endpoint_id IN (?)", bun.In(endpointIDs)).
		Where("days_remaining <= ?", maxDays).
		OrderExpr("days_remaining ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list tagged expiring certs: %w", err)
	}

	out := make([]models.ExpiringCertItem, len(rows))
	for i, r := range rows {
		out[i] = models.ExpiringCertItem{
			EndpointID:    r.EndpointID,
			EndpointName:  r.EndpointName,
			EndpointType:  r.EndpointType,
			Fingerprint:   r.Fingerprint,
			CommonName:    r.CommonName,
			NotAfter:      r.NotAfter,
			DaysRemaining: r.DaysRemaining,
		}
	}
	return out, nil
}

// TryInsertExpiryAlert attempts to record that an alert was sent to a specific
// user for the given (fingerprint, thresholdDays) pair. Returns true if the row
// was inserted (first-time alert for this user), false if already sent.
func (s *Store) TryInsertExpiryAlert(ctx context.Context, userID, fingerprint string, thresholdDays int) (bool, error) {
	row := &CertificateExpiryAlert{
		UserID:        userID,
		Fingerprint:   fingerprint,
		ThresholdDays: thresholdDays,
	}
	res, err := s.db.NewInsert().
		Model(row).
		Value("alerted_at", "NOW()").
		On("CONFLICT (user_id, fingerprint, threshold_days) DO NOTHING").
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
