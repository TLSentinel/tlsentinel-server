package models

import "time"

// CertificateRecord holds the extracted fields from a parsed certificate
// ready for insertion into the database.
type CertificateRecord struct {
	Fingerprint    string
	PEM            string
	CommonName     string
	SubjectOrg     string
	SubjectOrgUnit string
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

	// TrustedBy lists root store IDs (e.g. "apple", "chrome", "microsoft", "mozilla")
	// whose trust anchors appear anywhere in this cert's chain. Derived from
	// root_store_anchors via issuer_fingerprint traversal; empty slice when no
	// anchor in the chain is a known trust anchor.
	TrustedBy []string `json:"trustedBy"`

	// IsTrustAnchor is TRUE when this cert is Subject+SKI-equivalent to a CCADB
	// root anchor. Lets the frontend stop walking the issuer chain at the
	// effective root (including cross-signed copies of an anchor).
	IsTrustAnchor bool `json:"isTrustAnchor"`
}

// RootStoreSummary is the shape returned by GET /root-stores — one row per
// enabled store. The Kind/SourceURL/AnchorCount/UpdatedAt fields drive the
// root-stores overview page; the trust-matrix card on cert detail ignores them.
type RootStoreSummary struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Kind        string     `json:"kind"`
	SourceURL   string     `json:"sourceUrl"`
	AnchorCount int        `json:"anchorCount"`
	UpdatedAt   *time.Time `json:"updatedAt"`
}

// RootStoreAnchorItem is one trust anchor in a root store's membership list.
type RootStoreAnchorItem struct {
	Fingerprint       string    `json:"fingerprint"`
	CommonName        string    `json:"commonName"`
	SubjectOrg        string    `json:"subjectOrg"`
	NotAfter          time.Time `json:"notAfter"`
	IssuerFingerprint *string   `json:"issuerFingerprint"`
}

// RootStoreAnchorList is the paginated response envelope for anchors listings.
type RootStoreAnchorList struct {
	Items      []RootStoreAnchorItem `json:"items"`
	Page       int                   `json:"page"`
	PageSize   int                   `json:"pageSize"`
	TotalCount int                   `json:"totalCount"`
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
	EndpointID    string            `json:"endpointId"`
	EndpointName  string            `json:"endpointName"`
	EndpointType  string            `json:"endpointType"`
	Fingerprint   string            `json:"fingerprint"`
	CommonName    string            `json:"commonName"`
	SANs          []string          `json:"sans"`
	IssuerCN      string            `json:"issuerCn"`
	NotAfter      time.Time         `json:"notAfter"`
	DaysRemaining int               `json:"daysRemaining"`
	Tags          []TagWithCategory `json:"tags"`
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
