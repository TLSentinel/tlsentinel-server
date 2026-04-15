package notifications

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	htmltemplate "html/template"
	texttemplate "text/template"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

// certAlertData holds the variables injected into notification templates.
// These match the variable names documented in TemplateVariables (defaults.go).
type certAlertData struct {
	EndpointName  string
	EndpointType  string
	CommonName    string
	NotAfter      string // pre-formatted as RFC1123
	DaysRemaining int
	Fingerprint   string
}

// renderExpiryEmail resolves the subject and HTML body for a cert_expiring alert.
// It loads the DB override if one exists, otherwise falls back to the embedded
// default in defaults.go. Returns subject and fully-rendered HTML body.
func renderExpiryEmail(ctx context.Context, store *db.Store, cert models.ExpiringCertItem, thresholdDays int) (subject, htmlBody string, err error) {
	return renderEmail(ctx, store, "cert_expiring", certAlertData{
		EndpointName:  cert.EndpointName,
		EndpointType:  cert.EndpointType,
		CommonName:    cert.CommonName,
		NotAfter:      cert.NotAfter.UTC().Format(time.RFC1123),
		DaysRemaining: thresholdDays,
		Fingerprint:   cert.Fingerprint,
	})
}

// renderEmail fetches the template for eventType + "email", renders the subject
// and HTML body, and returns them. DB overrides take precedence over embedded
// defaults; returns an error only if no template exists or rendering fails.
func renderEmail(ctx context.Context, store *db.Store, eventType string, data certAlertData) (subject, htmlBody string, err error) {
	var subjectTmpl, bodyTmpl string

	dbTmpl, dbErr := store.GetNotificationTemplate(ctx, eventType, "email")
	switch {
	case dbErr == nil:
		// DB override found.
		if dbTmpl.Subject != nil {
			subjectTmpl = *dbTmpl.Subject
		}
		bodyTmpl = dbTmpl.Body
	case errors.Is(dbErr, db.ErrNotFound):
		// No override — fall back to embedded default.
		def, ok := GetDefault(eventType, "email")
		if !ok {
			return "", "", fmt.Errorf("render: no template registered for event %q", eventType)
		}
		subjectTmpl = def.Subject
		bodyTmpl = def.Body
	default:
		return "", "", fmt.Errorf("render: load template: %w", dbErr)
	}

	// Subject: use text/template so endpoint names are never HTML-escaped in
	// the subject line ("Acme & Co" should not become "Acme &amp; Co").
	subject, err = renderTextTemplate(subjectTmpl, data)
	if err != nil {
		return "", "", fmt.Errorf("render: subject: %w", err)
	}

	// Body: use html/template so any HTML characters in variable values are
	// safely escaped when injected into the HTML email body.
	htmlBody, err = renderHTMLTemplate(bodyTmpl, data)
	if err != nil {
		return "", "", fmt.Errorf("render: body: %w", err)
	}

	return subject, htmlBody, nil
}

func renderTextTemplate(tmpl string, data certAlertData) (string, error) {
	t, err := texttemplate.New("").Parse(tmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderHTMLTemplate(tmpl string, data certAlertData) (string, error) {
	t, err := htmltemplate.New("").Parse(tmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}
