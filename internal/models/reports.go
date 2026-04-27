package models

// TLSPostureReport is the response for GET /reports/tls-posture.
// All counts are derived from the most recent TLS profile scan per endpoint.
type TLSPostureReport struct {
	// TotalEndpoints is the number of enabled endpoints.
	TotalEndpoints int `json:"totalEndpoints"`
	// ScannedEndpoints is the number of enabled endpoints with a TLS profile.
	ScannedEndpoints int `json:"scannedEndpoints"`

	// Protocols shows how many endpoints support each TLS version as their
	// highest negotiated version.
	Protocols TLSProtocolCounts `json:"protocols"`

	// LegacyEndpoints is the count of distinct endpoints that support TLS 1.0
	// OR TLS 1.1 (i.e. the union, not the sum).
	LegacyEndpoints int `json:"legacyEndpoints"`

	// Ciphers shows how often each cipher suite was selected during scanning,
	// sorted by count descending. Includes severity from the classifier.
	Ciphers []TLSCipherCount `json:"ciphers"`

	// Issuers shows the distribution of certificate authorities across all
	// current endpoint certificates, sorted by count descending.
	Issuers []TLSIssuerCount `json:"issuers"`

	// WeakCipherEndpoints is the number of endpoints that accept at least one
	// non-OK cipher suite, regardless of which cipher was negotiated.
	WeakCipherEndpoints int `json:"weakCipherEndpoints"`

	// Attention lists endpoints that have at least one security concern —
	// old protocol support, weak selected cipher, or scan error.
	Attention []TLSAttentionItem `json:"attention"`
}

// TLSProtocolCounts breaks down endpoints by the highest TLS version they support.
type TLSProtocolCounts struct {
	TLS13 int `json:"tls13"`
	TLS12 int `json:"tls12"`
	TLS11 int `json:"tls11"`
	TLS10 int `json:"tls10"`
	SSL30 int `json:"ssl30"`
}

// TLSCipherCount is a single row in the cipher distribution.
type TLSCipherCount struct {
	Cipher   string `json:"cipher"`
	Count    int    `json:"count"`
	Severity string `json:"severity"` // "ok", "warning", "critical"
	Reason   string `json:"reason,omitempty"`
}

// TLSIssuerCount is a single row in the CA distribution.
type TLSIssuerCount struct {
	Issuer string `json:"issuer"`
	Count  int    `json:"count"`
}

// TLSAttentionItem is an endpoint with at least one security concern.
// Severity reflects the worst issue across all items in Issues.
type TLSAttentionItem struct {
	EndpointID   string   `json:"endpointId"`
	EndpointName string   `json:"endpointName"`
	Issues       []string `json:"issues"`
	Severity     string   `json:"severity"` // "critical", "warning"
}
