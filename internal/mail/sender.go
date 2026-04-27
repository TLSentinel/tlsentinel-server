package mail

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"html"
	"net/mail"
	"net/smtp"
	"regexp"
	"strings"
)

// Config holds the decrypted, ready-to-use mail configuration for sending.
type Config struct {
	SMTPHost     string
	SMTPPort     int
	AuthType     string // none | plain | login
	SMTPUsername string
	SMTPPassword string // plaintext, already decrypted
	FromAddress  string
	FromName     string
	TLSMode      string // none | starttls | tls
}

// Send dispatches an email with the given subject and HTML body.
// A plain-text fallback is generated automatically from the HTML.
func Send(cfg Config, to, subject, htmlBody string) error {
	return send(cfg, to, subject, htmlBody)
}

// SendTestEmail sends a test message. If to is empty it falls back to the
// configured FromAddress so there is always a valid recipient.
func SendTestEmail(cfg Config, to string) error {
	if to == "" {
		to = cfg.FromAddress
	}
	const testHTML = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:32px;color:#18181b;">
<h2 style="margin:0 0 8px;">TLSentinel Test Email</h2>
<p style="color:#71717a;">Your SMTP configuration is working correctly.</p>
</body></html>`
	return send(cfg, to, "TLSentinel Test Email", testHTML)
}

// send is the internal dispatch function.
func send(cfg Config, to, subject, htmlBody string) error {
	if err := validateHeaders(to, subject, cfg.FromAddress, cfg.FromName); err != nil {
		return err
	}

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)

	auth, err := buildAuth(cfg)
	if err != nil {
		return err
	}

	msg, err := buildMessage(cfg.FromAddress, cfg.FromName, to, subject, htmlBody)
	if err != nil {
		return err
	}

	switch cfg.TLSMode {
	case "tls":
		return sendExplicitTLS(addr, cfg.SMTPHost, auth, cfg.FromAddress, to, msg)
	case "starttls":
		return sendWithSTARTTLS(addr, cfg.SMTPHost, auth, cfg.FromAddress, to, msg, true)
	case "none", "":
		return sendWithSTARTTLS(addr, cfg.SMTPHost, auth, cfg.FromAddress, to, msg, false)
	default:
		return fmt.Errorf("unknown tls_mode %q", cfg.TLSMode)
	}
}

// validateHeaders rejects inputs that would let a caller inject extra SMTP
// headers. Addresses must parse per RFC 5322 (which also rejects embedded
// CR/LF); subject and display name must not contain CR or LF at all, since
// they land directly in the Subject: and From: header values.
func validateHeaders(to, subject, fromAddr, fromName string) error {
	if _, err := mail.ParseAddress(to); err != nil {
		return fmt.Errorf("invalid recipient address: %w", err)
	}
	if _, err := mail.ParseAddress(fromAddr); err != nil {
		return fmt.Errorf("invalid from address: %w", err)
	}
	if strings.ContainsAny(subject, "\r\n") {
		return fmt.Errorf("subject contains CR or LF")
	}
	if strings.ContainsAny(fromName, "\r\n") {
		return fmt.Errorf("from name contains CR or LF")
	}
	return nil
}

// buildAuth constructs the smtp.Auth implementation based on the auth type.
func buildAuth(cfg Config) (smtp.Auth, error) {
	switch cfg.AuthType {
	case "plain":
		return smtp.PlainAuth("", cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPHost), nil
	case "login":
		return loginAuth{cfg.SMTPUsername, cfg.SMTPPassword}, nil
	case "none", "":
		return nil, nil
	default:
		return nil, fmt.Errorf("unknown auth_type %q", cfg.AuthType)
	}
}

// sendWithSTARTTLS dials plain SMTP and optionally upgrades to TLS via STARTTLS.
func sendWithSTARTTLS(addr, host string, auth smtp.Auth, from, to string, msg []byte, requireTLS bool) error {
	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	defer c.Quit() //nolint:errcheck

	if requireTLS {
		if err := c.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return fmt.Errorf("STARTTLS: %w", err)
		}
	}

	if auth != nil {
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}

	return writeMessage(c, from, to, msg)
}

// sendExplicitTLS dials directly over TLS (implicit TLS / SMTPS, port 465).
func sendExplicitTLS(addr, host string, auth smtp.Auth, from, to string, msg []byte) error {
	conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
	if err != nil {
		return fmt.Errorf("TLS dial %s: %w", addr, err)
	}
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer c.Quit() //nolint:errcheck

	if auth != nil {
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}

	return writeMessage(c, from, to, msg)
}

// writeMessage issues MAIL FROM, RCPT TO, DATA and writes the message body.
func writeMessage(c *smtp.Client, from, to string, msg []byte) error {
	if err := c.Mail(from); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("RCPT TO: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	return w.Close()
}

// buildMessage formats a multipart/alternative RFC 5322 message with both a
// plain-text fallback (auto-stripped from HTML) and the full HTML part.
func buildMessage(fromAddr, fromName, to, subject, htmlBody string) ([]byte, error) {
	from := fromAddr
	if fromName != "" {
		from = fmt.Sprintf("%s <%s>", fromName, fromAddr)
	}

	boundary, err := randomBoundary()
	if err != nil {
		return nil, err
	}
	plainText := htmlToText(htmlBody)

	var sb strings.Builder
	sb.WriteString("From: " + from + "\r\n")
	sb.WriteString("To: " + to + "\r\n")
	sb.WriteString("Subject: " + subject + "\r\n")
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary))
	sb.WriteString("\r\n")

	// Plain-text part (fallback)
	sb.WriteString("--" + boundary + "\r\n")
	sb.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(plainText + "\r\n")

	// HTML part
	sb.WriteString("--" + boundary + "\r\n")
	sb.WriteString("Content-Type: text/html; charset=utf-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(htmlBody + "\r\n")

	sb.WriteString("--" + boundary + "--\r\n")

	return []byte(sb.String()), nil
}

// randomBoundary generates a random MIME boundary string. A rand.Read
// failure would leave the buffer all-zeros, giving every message the
// same boundary — we surface the error instead of silently producing
// a degenerate one.
func randomBoundary() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate mime boundary: %w", err)
	}
	return "===============" + hex.EncodeToString(b) + "==", nil
}

// Compiled regexes for htmlToText.
var (
	reStyle  = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	reScript = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reBlock  = regexp.MustCompile(`(?i)</?(?:br|p|tr|h[1-6]|div|li|hr|table|thead|tbody)[^>]*>`)
	reTags   = regexp.MustCompile(`<[^>]+>`)
	reSpaces = regexp.MustCompile(`[ \t]+`)
	reLines  = regexp.MustCompile(`\n{3,}`)
)

// htmlToText produces a readable plain-text version of an HTML string.
// Used as the text/plain fallback part in multipart/alternative emails.
func htmlToText(htmlBody string) string {
	s := reStyle.ReplaceAllString(htmlBody, "")
	s = reScript.ReplaceAllString(s, "")
	s = reBlock.ReplaceAllString(s, "\n")
	s = reTags.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = reSpaces.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, " \n", "\n")
	s = strings.ReplaceAll(s, "\n ", "\n")
	s = reLines.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}

// loginAuth implements smtp.Auth for the LOGIN SASL mechanism.
// Go's standard library only ships PlainAuth and CRAMMD5Auth.
type loginAuth struct {
	username, password string
}

func (a loginAuth) Start(_ *smtp.ServerInfo) (string, []byte, error) {
	return "LOGIN", nil, nil
}

func (a loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(fromServer))) {
	case "username:":
		return []byte(a.username), nil
	case "password:":
		return []byte(a.password), nil
	default:
		return nil, fmt.Errorf("unexpected LOGIN challenge: %q", fromServer)
	}
}
