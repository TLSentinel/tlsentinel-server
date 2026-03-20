package db

import (
	"encoding/json"
	"time"

	"github.com/uptrace/bun"
)

// Certificate maps to tlsentinel.certificates.
type Certificate struct {
	bun.BaseModel `bun:"table:tlsentinel.certificates,alias:c"`

	Fingerprint       string    `bun:"fingerprint,pk"`
	PEM               string    `bun:"pem"`
	CommonName        string    `bun:"common_name"`
	SANs              []string  `bun:"sans,array"`
	NotBefore         time.Time `bun:"not_before"`
	NotAfter          time.Time `bun:"not_after"`
	SerialNumber      string    `bun:"serial_number"`
	SubjectKeyID      string    `bun:"subject_key_id"`
	AuthorityKeyID    *string   `bun:"authority_key_id"`
	SubjectDNHash     string    `bun:"subject_dn_hash"`
	IssuerDNHash      string    `bun:"issuer_dn_hash"`
	IssuerFingerprint *string   `bun:"issuer_fingerprint"`
	CreatedAt         time.Time `bun:"created_at"`
}

// Host maps to tlsentinel.hosts.
type Host struct {
	bun.BaseModel `bun:"table:tlsentinel.hosts,alias:h"`

	ID                string     `bun:"id,pk,type:uuid"`
	Name              string     `bun:"name"`
	DNSName           string     `bun:"dns_name"`
	IPAddress         *string    `bun:"ip_address"`
	Port              int        `bun:"port"`
	Enabled           bool       `bun:"enabled"`
	ScannerID         *string    `bun:"scanner_id,type:uuid"`
	ActiveFingerprint *string    `bun:"active_fingerprint"`
	LastScannedAt     *time.Time `bun:"last_scanned_at"`
	LastScanError     *string    `bun:"last_scan_error"`
	ErrorSince        *time.Time `bun:"error_since"`
	Notes             *string    `bun:"notes"`
	CreatedAt         time.Time  `bun:"created_at"`
	UpdatedAt         time.Time  `bun:"updated_at"`
}

// Scanner maps to tlsentinel.scanners.
type Scanner struct {
	bun.BaseModel `bun:"table:tlsentinel.scanners"`

	ID                  string     `bun:"id,pk,type:uuid"`
	Name                string     `bun:"name"`
	TokenHash           string     `bun:"token_hash"`
	IsDefault           bool       `bun:"is_default"`
	ScanIntervalSeconds int        `bun:"scan_interval_seconds"`
	ScanConcurrency     int        `bun:"scan_concurrency"`
	CreatedAt           time.Time  `bun:"created_at"`
	LastUsedAt          *time.Time `bun:"last_used_at"`
}

// User maps to tlsentinel.users.
type User struct {
	bun.BaseModel `bun:"table:tlsentinel.users"`

	ID           string    `bun:"id,pk,type:uuid"`
	Username     string    `bun:"username"`
	PasswordHash *string   `bun:"password_hash"`
	Provider     string    `bun:"provider"`
	Enabled      bool      `bun:"enabled"`
	Role         string    `bun:"role"`
	FirstName    *string   `bun:"first_name"`
	LastName     *string   `bun:"last_name"`
	Email        *string   `bun:"email"`
	CreatedAt    time.Time `bun:"created_at"`
	UpdatedAt    time.Time `bun:"updated_at"`
}

// MailConfig maps to tlsentinel.mail_config (singleton row, id = 1).
type MailConfig struct {
	bun.BaseModel `bun:"table:tlsentinel.mail_config"`

	ID           int       `bun:"id,pk"`
	Enabled      bool      `bun:"enabled"`
	SMTPHost     string    `bun:"smtp_host"`
	SMTPPort     int       `bun:"smtp_port"`
	AuthType     string    `bun:"auth_type"`
	SMTPUsername string    `bun:"smtp_username"`
	SMTPPassword string    `bun:"smtp_password"`
	FromAddress  string    `bun:"from_address"`
	FromName     string    `bun:"from_name"`
	TLSMode      string    `bun:"tls_mode"`
	UpdatedAt    time.Time `bun:"updated_at"`
}

// HostScanHistory maps to tlsentinel.host_scan_history.
type HostScanHistory struct {
	bun.BaseModel `bun:"table:tlsentinel.host_scan_history"`

	ID          string     `bun:"id,pk,type:uuid"`
	HostID      string     `bun:"host_id,type:uuid"`
	ScannedAt   time.Time  `bun:"scanned_at"`
	Fingerprint *string    `bun:"fingerprint"`
	ResolvedIP  *string    `bun:"resolved_ip"`
	TLSVersion  *string    `bun:"tls_version"`
	ScanError   *string    `bun:"scan_error"`
}

// HostTLSProfile maps to tlsentinel.host_tls_profiles.
type HostTLSProfile struct {
	bun.BaseModel `bun:"table:tlsentinel.host_tls_profiles"`

	HostID         string    `bun:"host_id,pk,type:uuid"`
	ScannedAt      time.Time `bun:"scanned_at"`
	TLS10          bool      `bun:"tls10"`
	TLS11          bool      `bun:"tls11"`
	TLS12          bool      `bun:"tls12"`
	TLS13          bool      `bun:"tls13"`
	CipherSuites   []string  `bun:"cipher_suites,array"`
	SelectedCipher *string   `bun:"selected_cipher"`
	ScanError      *string   `bun:"scan_error"`
}

// Setting maps to tlsentinel.settings. Value is raw JSONB — callers decode it
// into the appropriate concrete type (e.g. []int for alert thresholds).
type Setting struct {
	bun.BaseModel `bun:"table:tlsentinel.settings"`

	Key       string          `bun:"key,pk"`
	Value     json.RawMessage `bun:"value,type:jsonb"`
	UpdatedAt time.Time       `bun:"updated_at"`
}

// CertificateExpiryAlert maps to tlsentinel.certificate_expiry_alerts.
// The composite PK (fingerprint, threshold_days) acts as the dedup key —
// inserting a duplicate means the alert has already been sent.
type CertificateExpiryAlert struct {
	bun.BaseModel `bun:"table:tlsentinel.certificate_expiry_alerts"`

	Fingerprint   string    `bun:"fingerprint,pk"`
	ThresholdDays int       `bun:"threshold_days,pk"`
	AlertedAt     time.Time `bun:"alerted_at"`
}

// VActiveCertificate maps to the read-only tlsentinel.v_active_certificates view.
type VActiveCertificate struct {
	bun.BaseModel `bun:"table:tlsentinel.v_active_certificates"`

	HostID        string    `bun:"host_id"`
	HostName      string    `bun:"host_name"`
	DNSName       string    `bun:"dns_name"`
	Port          int       `bun:"port"`
	Fingerprint   string    `bun:"fingerprint"`
	CommonName    string    `bun:"common_name"`
	NotBefore     time.Time `bun:"not_before"`
	NotAfter      time.Time `bun:"not_after"`
	DaysRemaining int       `bun:"days_remaining"`
}
