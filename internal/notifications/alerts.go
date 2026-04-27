// Package notifications implements certificate expiry alert delivery.
// RunExpiryAlerts is designed to be called on a recurring schedule (hourly).
// Each cert is bucketed into exactly one alert threshold (1/7/14/30 days) based
// on its current days_remaining value. The cert_expiry_alerts dedup table
// ensures each (fingerprint, threshold) pair is sent at most once.
package notifications

import (
	"context"
	"errors"
	"log/slog"
	"sort"

	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/mail"
)

// alertThreshold returns the single most-urgent threshold bucket for a cert
// with the given days_remaining, using the configured threshold list.
// thresholds must be sorted descending (largest first). Returns 0 if the cert
// does not qualify for any threshold (days_remaining > max threshold).
func alertThreshold(daysRemaining int, thresholds []int) int {
	result := 0
	for _, t := range thresholds {
		if daysRemaining <= t {
			result = t // keep updating — smallest qualifying threshold wins
		}
	}
	return result
}

// RunExpiryAlerts checks for expiring certificates and sends alert emails to
// all notify-enabled users. It is a no-op if mail is disabled or unconfigured.
func RunExpiryAlerts(ctx context.Context, store *db.Store, enc *crypto.Encryptor, log *slog.Logger) {
	// Load and validate mail config.
	cfg, err := store.GetMailConfig(ctx)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			log.Debug("expiry alerts skipped: mail not configured")
			return
		}
		log.Error("expiry alerts: failed to load mail config", "error", err)
		return
	}
	if !cfg.Enabled {
		log.Debug("expiry alerts skipped: mail disabled")
		return
	}

	// Decrypt SMTP password.
	var plainPassword string
	if cfg.SMTPPassword != "" {
		plainPassword, err = enc.Decrypt(cfg.SMTPPassword)
		if err != nil {
			log.Error("expiry alerts: failed to decrypt SMTP password", "error", err)
			return
		}
	}

	sendCfg := mail.Config{
		SMTPHost:     cfg.SMTPHost,
		SMTPPort:     cfg.SMTPPort,
		AuthType:     cfg.AuthType,
		SMTPUsername: cfg.SMTPUsername,
		SMTPPassword: plainPassword,
		FromAddress:  cfg.FromAddress,
		FromName:     cfg.FromName,
		TLSMode:      cfg.TLSMode,
	}

	// Load thresholds from the DB (falls back to defaults if not set).
	thresholds, err := store.GetAlertThresholds(ctx)
	if err != nil {
		log.Error("expiry alerts: failed to load thresholds", "error", err)
		return
	}
	if len(thresholds) == 0 {
		log.Debug("expiry alerts skipped: no thresholds configured")
		return
	}
	// Sort descending so alertThreshold() can find the most urgent bucket.
	sort.Sort(sort.Reverse(sort.IntSlice(thresholds)))

	// Fetch alert recipients.
	recipients, err := store.ListNotifyUsers(ctx)
	if err != nil {
		log.Error("expiry alerts: failed to list notify users", "error", err)
		return
	}
	if len(recipients) == 0 {
		log.Debug("expiry alerts: no notify recipients configured")
		return
	}

	sent, skipped := 0, 0
	for _, user := range recipients {
		if user.Email == nil {
			continue
		}

		// Fetch certs scoped to this user's tag subscriptions.
		certs, err := store.ListExpiringActiveCertsTagged(ctx, user.ID, thresholds[0])
		if err != nil {
			log.Error("expiry alerts: failed to list certs for user",
				"user_id", user.ID,
				"error", err,
			)
			continue
		}

		for _, cert := range certs {
			threshold := alertThreshold(cert.DaysRemaining, thresholds)
			if threshold == 0 {
				continue
			}

			// Attempt to claim the per-user alert slot.
			inserted, err := store.TryInsertExpiryAlert(ctx, user.ID, cert.Fingerprint, threshold)
			if err != nil {
				log.Error("expiry alerts: dedup insert failed",
					"user_id", user.ID,
					"fingerprint", cert.Fingerprint,
					"threshold", threshold,
					"error", err,
				)
				continue
			}
			if !inserted {
				skipped++
				continue
			}

			// Render subject + HTML body from the DB override or embedded default.
			// Fall back to plain-text if rendering fails so alerts still go out.
			subject, htmlBody, renderErr := renderExpiryEmail(ctx, store, cert, threshold)
			if renderErr != nil {
				log.Warn("expiry alert: template render failed, using plain-text fallback",
					"endpoint", cert.EndpointName,
					"error", renderErr,
				)
				subject = expirySubject(cert, threshold)
				htmlBody = expiryBody(cert, threshold)
			}

			if err := mail.Send(sendCfg, *user.Email, subject, htmlBody); err != nil {
				log.Error("expiry alert: failed to send email",
					"to", *user.Email,
					"error", err,
				)
				continue
			}
			sent++
			log.Info("expiry alert sent",
				"endpoint", cert.EndpointName,
				"endpoint_type", cert.EndpointType,
				"days_remaining", cert.DaysRemaining,
				"threshold", threshold,
				"to", *user.Email,
			)
		}
	}

	log.Info("expiry alert run complete",
		"recipients", len(recipients),
		"alerts_sent", sent,
		"already_sent", skipped,
	)
}

