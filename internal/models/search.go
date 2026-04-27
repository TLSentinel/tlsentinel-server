package models

import "time"

// SearchResults is the payload returned by the universal search endpoint —
// three shallow lists, capped per type, suitable for the header dropdown.
type SearchResults struct {
	Endpoints    []SearchEndpoint    `json:"endpoints"`
	Certificates []SearchCertificate `json:"certificates"`
	Scanners     []SearchScanner     `json:"scanners"`
}

// SearchEndpoint is a single endpoint match. Subtitle is the type-appropriate
// identifier (dns_name for host, url for saml, empty for manual).
type SearchEndpoint struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Subtitle string `json:"subtitle"`
}

// SearchCertificate is a single certificate match.
type SearchCertificate struct {
	Fingerprint string    `json:"fingerprint"`
	CommonName  string    `json:"commonName"`
	NotAfter    time.Time `json:"notAfter"`
}

// SearchScanner is a single scanner match.
type SearchScanner struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
