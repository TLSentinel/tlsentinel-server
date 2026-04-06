package models

import "time"

// EndpointCert is a certificate currently (or historically) associated with
// an endpoint, enriched with certificate metadata for display.
type EndpointCert struct {
	Fingerprint string    `json:"fingerprint"`
	CertUse     string    `json:"certUse"`
	IsCurrent   bool      `json:"isCurrent"`
	CommonName  string    `json:"commonName"`
	NotBefore   time.Time `json:"notBefore"`
	NotAfter    time.Time `json:"notAfter"`
	FirstSeenAt time.Time `json:"firstSeenAt"`
	LastSeenAt  time.Time `json:"lastSeenAt"`
}

// SAMLCertPayload is one certificate entry in a SAML scan result, paired with
// its declared use (signing or encryption).
type SAMLCertPayload struct {
	PEM string `json:"pem"`
	Use string `json:"use"`
}

// EndpointRecord holds the fields for creating or updating an endpoint.
type EndpointRecord struct {
	Name      string
	Type      string
	// Host-type fields.
	DNSName   string
	IPAddress *string
	Port      int
	// SAML-type fields.
	URL       *string
	// Common optional fields.
	Enabled   bool
	ScannerID *string
	Notes     *string
}

// Endpoint represents the full detail of a monitored endpoint.
type Endpoint struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	// Host-type fields.
	DNSName     string     `json:"dnsName"`
	IPAddress   *string    `json:"ipAddress"`
	Port        int        `json:"port"`
	// SAML-type fields.
	URL         *string    `json:"url,omitempty"`
	// Common fields.
	Enabled       bool           `json:"enabled"`
	ScannerID     *string        `json:"scannerId"`
	ScannerName   *string        `json:"scannerName"`
	ActiveCerts   []EndpointCert `json:"activeCerts"`
	LastScannedAt *time.Time     `json:"lastScannedAt"`
	LastScanError *string        `json:"lastScanError"`
	ErrorSince    *time.Time     `json:"errorSince"`
	Notes         *string        `json:"notes"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
}

// EndpointListItem represents a summary of an endpoint for list responses.
type EndpointListItem struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	// Host-type fields.
	DNSName     string     `json:"dnsName"`
	Port        int        `json:"port"`
	// SAML-type fields.
	URL         *string    `json:"url,omitempty"`
	// Common fields.
	Enabled         bool              `json:"enabled"`
	ScannerID       *string           `json:"scannerId"`
	ScannerName     *string           `json:"scannerName"`
	// EarliestExpiry is the soonest not_after across all current certs for this
	// endpoint. Nil when no certs have been recorded yet.
	EarliestExpiry  *time.Time        `json:"earliestExpiry"`
	LastScannedAt   *time.Time        `json:"lastScannedAt"`
	LastScanError   *string           `json:"lastScanError"`
	ErrorSince      *time.Time        `json:"errorSince"`
	Tags            []TagWithCategory `json:"tags"`
}

// EndpointList represents a paginated list of endpoints.
type EndpointList struct {
	Items      []EndpointListItem `json:"items"`
	Page       int                `json:"page"`
	PageSize   int                `json:"pageSize"`
	TotalCount int                `json:"totalCount"`
}

// ScannerHost is the slim host payload returned to scanner agents.
type ScannerHost struct {
	ID        string  `json:"id"`
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
}

// ScannerSAMLEndpoint is the slim SAML endpoint payload returned to scanner agents.
type ScannerSAMLEndpoint struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

// SAMLScanResultRequest is the payload a scanner POSTs after fetching SAML metadata.
// ResolvedIP and TLSVersion do not apply to metadata fetches.
type SAMLScanResultRequest struct {
	Error *string           `json:"error"`
	// Certs contains all certificates extracted from the metadata, each paired
	// with its declared use (signing or encryption).
	Certs []SAMLCertPayload `json:"certs"`
}

// ScanResultRequest is the payload a scanner POSTs after scanning a host.
type ScanResultRequest struct {
	ActiveFingerprint *string  `json:"activeFingerprint"`
	ResolvedIP        *string  `json:"resolvedIp"`
	TLSVersion        *string  `json:"tlsVersion"`
	Error             *string  `json:"error"`
	// PEMs contains PEM-encoded certificates in chain order (leaf first).
	// The server parses and upserts each; re-sending known certs is safe.
	PEMs              []string `json:"pems"`
}

// EndpointScanHistoryList is the response envelope for scan history.
type EndpointScanHistoryList struct {
	Items []EndpointScanHistory `json:"items"`
}

// EndpointScanHistory represents a single scan result recorded for an endpoint.
type EndpointScanHistory struct {
	ID         string    `json:"id"`
	EndpointID string    `json:"endpointId"`
	ScannedAt   time.Time `json:"scannedAt"`
	Fingerprint *string   `json:"fingerprint"`
	ResolvedIP  *string   `json:"resolvedIp"`
	TLSVersion  *string   `json:"tlsVersion"`
	ScanError   *string   `json:"scanError"`
}
