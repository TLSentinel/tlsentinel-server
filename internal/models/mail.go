package models

import "time"

// MailConfig is the internal representation of the mail configuration.
// SMTPPassword holds AES-256-GCM ciphertext (base64) — never expose it in API responses.
type MailConfig struct {
	Enabled      bool
	SMTPHost     string
	SMTPPort     int
	AuthType     string // none | plain | login
	SMTPUsername string
	SMTPPassword string // AES-256-GCM ciphertext; empty when AuthType == "none"
	FromAddress  string
	FromName     string
	TLSMode      string // none | starttls | tls
	UpdatedAt    time.Time
}

// MailConfigResponse is the public API representation.
// The SMTP password is never included; PasswordSet indicates whether one is stored.
type MailConfigResponse struct {
	Enabled      bool      `json:"enabled"`
	SMTPHost     string    `json:"smtpHost"`
	SMTPPort     int       `json:"smtpPort"`
	AuthType     string    `json:"authType"`
	SMTPUsername string    `json:"smtpUsername"`
	PasswordSet  bool      `json:"passwordSet"`
	FromAddress  string    `json:"fromAddress"`
	FromName     string    `json:"fromName"`
	TLSMode      string    `json:"tlsMode"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// ToResponse converts MailConfig to its safe public representation.
func (c MailConfig) ToResponse() MailConfigResponse {
	return MailConfigResponse{
		Enabled:      c.Enabled,
		SMTPHost:     c.SMTPHost,
		SMTPPort:     c.SMTPPort,
		AuthType:     c.AuthType,
		SMTPUsername: c.SMTPUsername,
		PasswordSet:  c.SMTPPassword != "",
		FromAddress:  c.FromAddress,
		FromName:     c.FromName,
		TLSMode:      c.TLSMode,
		UpdatedAt:    c.UpdatedAt,
	}
}
