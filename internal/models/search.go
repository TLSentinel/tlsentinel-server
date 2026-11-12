package models

import "time"

// SearchResults is the payload returned by the universal search endpoint —
// three shallow lists, capped per type, suitable for the header dropdown.
type SearchResults struct {
	Endpoints    []SearchEndpoint    `json:"endpoints"`
	Certificates []SearchCertificate `json:"certificates"`
	Issuers      []SearchIssuer      `json:"issuers"`
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

// SearchIssuer is a certificate authority match — a stored certificate that
// has signed at least one other stored certificate and whose subject CN or O
// matches the query. Surfaced as its own group so that typing a CA brand
// ("DigiCert") yields the handful of CAs plus their issued counts, rather
// than flooding the certificate group with every leaf they signed.
type SearchIssuer struct {
	Fingerprint string `json:"fingerprint"`
	CommonName  string `json:"commonName"`
	SubjectOrg  string `json:"subjectOrg"`
	TotalIssued int    `json:"totalIssued"`
}

// SearchScanner is a single scanner match.
type SearchScanner struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
