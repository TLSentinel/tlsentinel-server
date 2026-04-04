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

// Endpoint maps to tlsentinel.endpoints.
type Endpoint struct {
	bun.BaseModel `bun:"table:tlsentinel.endpoints,alias:h"`

	ID                string     `bun:"id,pk,type:uuid"`
	Name              string     `bun:"name"`
	Type              string     `bun:"type"`
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

// EndpointHost maps to tlsentinel.endpoint_hosts.
type EndpointHost struct {
	bun.BaseModel `bun:"table:tlsentinel.endpoint_hosts,alias:eh"`

	EndpointID string  `bun:"endpoint_id,pk,type:uuid"`
	DNSName    string  `bun:"dns_name"`
	IPAddress  *string `bun:"ip_address"`
	Port       int     `bun:"port"`
}

// EndpointSAML maps to tlsentinel.endpoint_saml.
type EndpointSAML struct {
	bun.BaseModel `bun:"table:tlsentinel.endpoint_saml,alias:es"`

	EndpointID string  `bun:"endpoint_id,pk,type:uuid"`
	URL        string  `bun:"url"`
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
	Notify       bool      `bun:"notify"`
	Role         string    `bun:"role"`
	FirstName    *string   `bun:"first_name"`
	LastName     *string   `bun:"last_name"`
	Email         *string   `bun:"email"`
	CalendarToken *string   `bun:"calendar_token"`
	CreatedAt     time.Time `bun:"created_at"`
	UpdatedAt     time.Time `bun:"updated_at"`
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

// EndpointScanHistory maps to tlsentinel.endpoint_scan_history.
type EndpointScanHistory struct {
	bun.BaseModel `bun:"table:tlsentinel.endpoint_scan_history"`

	ID         string     `bun:"id,pk,type:uuid"`
	EndpointID string     `bun:"endpoint_id,type:uuid"`
	ScannedAt   time.Time  `bun:"scanned_at"`
	Fingerprint *string    `bun:"fingerprint"`
	ResolvedIP  *string    `bun:"resolved_ip"`
	TLSVersion  *string    `bun:"tls_version"`
	ScanError   *string    `bun:"scan_error"`
}

// EndpointTLSProfile maps to tlsentinel.host_tls_profiles.
type EndpointTLSProfile struct {
	bun.BaseModel `bun:"table:tlsentinel.endpoint_tls_profiles"`

	EndpointID     string    `bun:"endpoint_id,pk,type:uuid"`
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

// Group maps to tlsentinel.groups.
type Group struct {
	bun.BaseModel `bun:"table:tlsentinel.groups"`

	ID          string    `bun:"id,pk,type:uuid"`
	Name        string    `bun:"name"`
	Description *string   `bun:"description"`
	CreatedAt   time.Time `bun:"created_at"`
	UpdatedAt   time.Time `bun:"updated_at"`
}

// AuditLog maps to tlsentinel.audit_logs.
type AuditLog struct {
	bun.BaseModel `bun:"table:tlsentinel.audit_logs"`

	ID           string          `bun:"id,pk,type:uuid"`
	UserID       *string         `bun:"user_id,type:uuid"`
	Username     string          `bun:"username"`
	Action       string          `bun:"action"`
	ResourceType *string         `bun:"resource_type"`
	ResourceID   *string         `bun:"resource_id"`
	IPAddress    *string         `bun:"ip_address"`
	Changes      json.RawMessage `bun:"changes,type:jsonb"`
	CreatedAt    time.Time       `bun:"created_at"`
}

// HostGroup maps to tlsentinel.host_groups.
type HostGroup struct {
	bun.BaseModel `bun:"table:tlsentinel.host_groups"`

	HostID  string `bun:"host_id,pk,type:uuid"`
	GroupID string `bun:"group_id,pk,type:uuid"`
}

// UserGroup maps to tlsentinel.user_groups.
type UserGroup struct {
	bun.BaseModel `bun:"table:tlsentinel.user_groups"`

	UserID  string `bun:"user_id,pk,type:uuid"`
	GroupID string `bun:"group_id,pk,type:uuid"`
	Role    string `bun:"role"`
}

// TagCategory maps to tlsentinel.tag_categories.
type TagCategory struct {
	bun.BaseModel `bun:"table:tlsentinel.tag_categories,alias:tc"`

	ID          string    `bun:"id,pk,type:uuid"`
	Name        string    `bun:"name"`
	Description *string   `bun:"description"`
	CreatedAt   time.Time `bun:"created_at"`
	UpdatedAt   time.Time `bun:"updated_at"`
}

// Tag maps to tlsentinel.tags.
type Tag struct {
	bun.BaseModel `bun:"table:tlsentinel.tags,alias:t"`

	ID          string    `bun:"id,pk,type:uuid"`
	CategoryID  string    `bun:"category_id,type:uuid"`
	Name        string    `bun:"name"`
	Description *string   `bun:"description"`
	CreatedAt   time.Time `bun:"created_at"`
}

// EndpointTag maps to tlsentinel.endpoint_tags.
type EndpointTag struct {
	bun.BaseModel `bun:"table:tlsentinel.endpoint_tags"`

	EndpointID string `bun:"endpoint_id,pk,type:uuid"`
	TagID      string `bun:"tag_id,pk,type:uuid"`
}

// VActiveCertificate maps to the read-only tlsentinel.v_active_certificates view.
type VActiveCertificate struct {
	bun.BaseModel `bun:"table:tlsentinel.v_active_certificates"`

	EndpointID   string    `bun:"endpoint_id"`
	EndpointName string    `bun:"endpoint_name"`
	EndpointType string    `bun:"endpoint_type"`
	Fingerprint  string    `bun:"fingerprint"`
	CommonName   string    `bun:"common_name"`
	NotBefore    time.Time `bun:"not_before"`
	NotAfter     time.Time `bun:"not_after"`
	DaysRemaining int      `bun:"days_remaining"`
}
