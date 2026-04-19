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
	Enabled    bool
	ScanExempt bool
	ScannerID  *string
	Notes      *string
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
	URL               *string              `json:"url,omitempty"`
	SAMLMetadata      *SAMLMetadataPayload `json:"samlMetadata,omitempty"`
	SAMLFetchedAt     *time.Time           `json:"samlFetchedAt,omitempty"`
	// Common fields.
	Enabled       bool           `json:"enabled"`
	ScanExempt    bool           `json:"scanExempt"`
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
	ScanExempt      bool              `json:"scanExempt"`
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

// SAMLEndpointPayload is one SSO/SLO/ACS endpoint declared in the metadata.
type SAMLEndpointPayload struct {
	Binding  string `json:"binding"`
	Location string `json:"location"`
	// Index is set for AssertionConsumerService entries; nil otherwise.
	Index *int `json:"index,omitempty"`
	// IsDefault is set for AssertionConsumerService entries; nil otherwise.
	IsDefault *bool `json:"isDefault,omitempty"`
}

// SAMLContactPayload is one ContactPerson element from the metadata.
type SAMLContactPayload struct {
	Type         string  `json:"type"`
	GivenName    *string `json:"givenName,omitempty"`
	Surname      *string `json:"surname,omitempty"`
	EmailAddress *string `json:"emailAddress,omitempty"`
	Company      *string `json:"company,omitempty"`
}

// SAMLOrganizationPayload is the Organization element from the metadata.
type SAMLOrganizationPayload struct {
	Name        *string `json:"name,omitempty"`
	DisplayName *string `json:"displayName,omitempty"`
	URL         *string `json:"url,omitempty"`
}

// SAMLMetadataPayload is the parsed SAML metadata bag. All fields are optional
// because metadata documents in the wild are inconsistent.
type SAMLMetadataPayload struct {
	EntityID      *string                  `json:"entityId,omitempty"`
	ValidUntil    *time.Time               `json:"validUntil,omitempty"`
	CacheDuration *string                  `json:"cacheDuration,omitempty"`
	// Role is "idp", "sp", or "both".
	Role                  *string                  `json:"role,omitempty"`
	SingleSignOn          []SAMLEndpointPayload    `json:"singleSignOn,omitempty"`
	SingleLogout          []SAMLEndpointPayload    `json:"singleLogout,omitempty"`
	AssertionConsumer     []SAMLEndpointPayload    `json:"assertionConsumer,omitempty"`
	NameIDFormats         []string                 `json:"nameIdFormats,omitempty"`
	Organization          *SAMLOrganizationPayload `json:"organization,omitempty"`
	Contacts              []SAMLContactPayload     `json:"contacts,omitempty"`
	WantAssertionsSigned  *bool                    `json:"wantAssertionsSigned,omitempty"`
	AuthnRequestsSigned   *bool                    `json:"authnRequestsSigned,omitempty"`
}

// SAMLScanResultRequest is the payload a scanner POSTs after fetching SAML metadata.
// ResolvedIP and TLSVersion do not apply to metadata fetches.
type SAMLScanResultRequest struct {
	Error *string `json:"error"`
	// Certs contains all certificates extracted from the metadata, each paired
	// with its declared use (signing or encryption).
	Certs []SAMLCertPayload `json:"certs"`
	// MetadataXML is the verbatim document received from the endpoint's URL.
	// Paired with MetadataXMLSha256 so the server can detect no-op reposts in O(1).
	MetadataXML       *string              `json:"metadataXml,omitempty"`
	MetadataXMLSha256 *string              `json:"metadataXmlSha256,omitempty"`
	Metadata          *SAMLMetadataPayload `json:"metadata,omitempty"`
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
