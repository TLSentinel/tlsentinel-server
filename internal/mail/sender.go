package mail

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
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

// SendTestEmail sends a test message. If to is empty it falls back to the
// configured FromAddress so there is always a valid recipient.
func SendTestEmail(cfg Config, to string) error {
	if to == "" {
		to = cfg.FromAddress
	}
	return send(cfg, to, "TLSentinel Test Email",
		"This is a test email from TLSentinel.\r\nYour SMTP configuration is working correctly.")
}

// send is the internal dispatch function.
func send(cfg Config, to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)

	auth, err := buildAuth(cfg)
	if err != nil {
		return err
	}

	msg := buildMessage(cfg.FromAddress, cfg.FromName, to, subject, body)

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

// buildMessage formats a minimal RFC 5322 message.
func buildMessage(fromAddr, fromName, to, subject, body string) []byte {
	from := fromAddr
	if fromName != "" {
		from = fmt.Sprintf("%s <%s>", fromName, fromAddr)
	}
	var sb strings.Builder
	sb.WriteString("From: " + from + "\r\n")
	sb.WriteString("To: " + to + "\r\n")
	sb.WriteString("Subject: " + subject + "\r\n")
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return []byte(sb.String())
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
	// Servers send "Username:" or "Password:" (Go's smtp package base64-decodes
	// the challenge before passing it to Next, so we receive plain text).
	switch strings.ToLower(strings.TrimSpace(string(fromServer))) {
	case "username:":
		return []byte(a.username), nil
	case "password:":
		return []byte(a.password), nil
	default:
		return nil, fmt.Errorf("unexpected LOGIN challenge: %q", fromServer)
	}
}
