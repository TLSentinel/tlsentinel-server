// Package notifications implements certificate expiry alert delivery.
// RunExpiryAlerts is designed to be called on a recurring schedule (hourly).
// Each cert is bucketed into exactly one alert threshold (1/7/14/30 days) based
// on its current days_remaining value. The cert_expiry_alerts dedup table
// ensures each (fingerprint, threshold) pair is sent at most once.
package notifications

import (
	"context"
	"errors"
	"sort"

	"go.uber.org/zap"

	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/mail"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
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
func RunExpiryAlerts(ctx context.Context, store *db.Store, enc *crypto.Encryptor, log *zap.Logger) {
	// Load and validate mail config.
	cfg, err := store.GetMailConfig(ctx)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			log.Debug("expiry alerts skipped: mail not configured")
			return
		}
		log.Error("expiry alerts: failed to load mail config", zap.Error(err))
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
			log.Error("expiry alerts: failed to decrypt SMTP password", zap.Error(err))
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
		log.Error("expiry alerts: failed to load thresholds", zap.Error(err))
		return
	}
	if len(thresholds) == 0 {
		log.Debug("expiry alerts skipped: no thresholds configured")
		return
	}
	// Sort descending so alertThreshold() can find the most urgent bucket.
	sort.Sort(sort.Reverse(sort.IntSlice(thresholds)))

	// Fetch all certs expiring within the widest threshold.
	certs, err := store.ListExpiringActiveCerts(ctx, thresholds[0])
	if err != nil {
		log.Error("expiry alerts: failed to list expiring certs", zap.Error(err))
		return
	}
	if len(certs) == 0 {
		log.Debug("expiry alerts: no expiring certs found")
		return
	}

	// Fetch alert recipients.
	recipients, err := store.ListNotifyUsers(ctx)
	if err != nil {
		log.Error("expiry alerts: failed to list notify users", zap.Error(err))
		return
	}
	if len(recipients) == 0 {
		log.Debug("expiry alerts: no notify recipients configured")
		return
	}

	sent, skipped := 0, 0
	for _, cert := range certs {
		threshold := alertThreshold(cert.DaysRemaining, thresholds)
		if threshold == 0 {
			continue
		}

		// Attempt to claim the alert slot — returns false if already sent.
		inserted, err := store.TryInsertExpiryAlert(ctx, cert.Fingerprint, threshold)
		if err != nil {
			log.Error("expiry alerts: dedup insert failed",
				zap.String("fingerprint", cert.Fingerprint),
				zap.Int("threshold", threshold),
				zap.Error(err),
			)
			continue
		}
		if !inserted {
			skipped++
			continue
		}

		// Send one email per recipient.
		subject := expirySubject(cert, threshold)
		body := expiryBody(cert, threshold)
		sendErr := sendToAll(sendCfg, recipients, subject, body, log)
		if sendErr == 0 {
			sent++
			log.Info("expiry alert sent",
				zap.String("endpoint", cert.EndpointName),
				zap.String("dns_name", cert.DNSName),
				zap.Int("port", cert.Port),
				zap.Int("days_remaining", cert.DaysRemaining),
				zap.Int("threshold", threshold),
				zap.Int("recipients", len(recipients)),
			)
		}
	}

	log.Info("expiry alert run complete",
		zap.Int("certs_checked", len(certs)),
		zap.Int("alerts_sent", sent),
		zap.Int("already_sent", skipped),
	)
}

// sendToAll sends the email to every recipient. Returns the number of errors.
func sendToAll(cfg mail.Config, recipients []models.User, subject, body string, log *zap.Logger) int {
	errs := 0
	for _, u := range recipients {
		if u.Email == nil {
			continue
		}
		if err := mail.Send(cfg, *u.Email, subject, body); err != nil {
			log.Error("expiry alert: failed to send email",
				zap.String("to", *u.Email),
				zap.Error(err),
			)
			errs++
		}
	}
	return errs
}
