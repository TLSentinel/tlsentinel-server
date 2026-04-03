package models

import "time"

// CertificateRecord holds the extracted fields from a parsed certificate
// ready for insertion into the database.
type CertificateRecord struct {
	Fingerprint    string
	PEM            string
	CommonName     string
	SANs           []string
	NotBefore      time.Time
	NotAfter       time.Time
	SerialNumber   string
	SubjectKeyID   string
	AuthorityKeyID *string
	SubjectDNHash  string
	IssuerDNHash   string
}

// CertificateListItem represents a summary of a certificate for list responses.
type CertificateListItem struct {
	Fingerprint       string    `json:"fingerprint"`
	CommonName        string    `json:"commonName"`
	SANs              []string  `json:"sans"`
	NotBefore         time.Time `json:"notBefore"`
	NotAfter          time.Time `json:"notAfter"`
	IssuerFingerprint *string   `json:"issuerFingerprint"`
	CreatedAt         time.Time `json:"createdAt"`
}

// CertificateDetail represents the full detail of a single certificate.
// Fields beyond the DB columns are populated by EnrichDetail after parsing the stored PEM.
type CertificateDetail struct {
	Fingerprint       string    `json:"fingerprint"`
	CommonName        string    `json:"commonName"`
	SANs              []string  `json:"sans"`
	NotBefore         time.Time `json:"notBefore"`
	NotAfter          time.Time `json:"notAfter"`
	SerialNumber      string    `json:"serialNumber"`
	SubjectKeyID      string    `json:"subjectKeyId"`
	AuthorityKeyID    *string   `json:"authorityKeyId"`
	IssuerFingerprint *string   `json:"issuerFingerprint"`
	CreatedAt         time.Time `json:"createdAt"`

	// PEM is the raw PEM-encoded certificate (for copy / download).
	PEM string `json:"pem"`

	// Subject extensions
	SubjectOrg     string `json:"subjectOrg"`
	SubjectOrgUnit string `json:"subjectOrgUnit"`

	// Issuer fields
	IssuerCN  string `json:"issuerCn"`
	IssuerOrg string `json:"issuerOrg"`

	// Key & signature
	KeyAlgorithm       string `json:"keyAlgorithm"`
	KeySize            int    `json:"keySize"`
	SignatureAlgorithm string `json:"signatureAlgorithm"`

	// Key usage
	KeyUsages    []string `json:"keyUsages"`
	ExtKeyUsages []string `json:"extKeyUsages"`

	// Revocation
	OCSPURLs              []string `json:"ocspUrls"`
	CRLDistributionPoints []string `json:"crlDistributionPoints"`
}

// CertificateList represents a paginated list of certificates.
type CertificateList struct {
	Items      []CertificateListItem `json:"items"`
	Page       int                   `json:"page"`
	PageSize   int                   `json:"pageSize"`
	TotalCount int                   `json:"totalCount"`
}

// ExpiringCertItem represents a certificate that is active on an endpoint,
// used by the /certificates/active and /certificates/expiring endpoints.
type ExpiringCertItem struct {
	EndpointID   string    `json:"endpointId"`
	EndpointName string    `json:"endpointName"`
	EndpointType string    `json:"endpointType"`
	Fingerprint  string    `json:"fingerprint"`
	CommonName   string    `json:"commonName"`
	NotAfter     time.Time `json:"notAfter"`
	DaysRemaining int      `json:"daysRemaining"`
}

// ExpiringCertList is the response envelope for the active/expiring certs endpoints.
// Page, PageSize, and TotalCount are populated for the paginated /certificates/active endpoint.
// The /certificates/expiring endpoint leaves them at zero.
type ExpiringCertList struct {
	Items      []ExpiringCertItem `json:"items"`
	Page       int                `json:"page,omitempty"`
	PageSize   int                `json:"pageSize,omitempty"`
	TotalCount int                `json:"totalCount,omitempty"`
}
