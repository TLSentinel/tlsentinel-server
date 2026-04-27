package models

import "time"

// EndpointTLSProfile is the raw TLS profile record as stored in the database.
// Enriched classification fields (WeakVersions, WeakCiphers, OverallSeverity)
// are computed at query time by the handler via internal/tlsprofile.Classify.
type EndpointTLSProfile struct {
	EndpointID     string    `json:"endpointId"`
	ScannedAt      time.Time `json:"scannedAt"`
	SSL30          bool      `json:"ssl30"`
	TLS10          bool      `json:"tls10"`
	TLS11          bool      `json:"tls11"`
	TLS12          bool      `json:"tls12"`
	TLS13          bool      `json:"tls13"`
	CipherSuites   []string  `json:"cipherSuites"`
	SelectedCipher *string   `json:"selectedCipher,omitempty"`
	ScanError      *string   `json:"scanError,omitempty"`
}

// TLSProfileIngestRequest is the payload a scanner POSTs after probing an endpoint's
// TLS configuration. Cipher suite names may be in OpenSSL or IANA format —
// the handler normalises them to IANA before storing.
type TLSProfileIngestRequest struct {
	SSL30          bool     `json:"ssl30"`
	TLS10          bool     `json:"tls10"`
	TLS11          bool     `json:"tls11"`
	TLS12          bool     `json:"tls12"`
	TLS13          bool     `json:"tls13"`
	CipherSuites   []string `json:"cipherSuites"`
	SelectedCipher *string  `json:"selectedCipher,omitempty"`
	ScanError      *string  `json:"scanError,omitempty"`
}
