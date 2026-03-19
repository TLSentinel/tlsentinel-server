package models

import "time"

// HostRecord holds the fields for creating or updating a host.
type HostRecord struct {
	Name      string
	DNSName   string
	IPAddress *string
	Port      int
	Enabled   bool
	ScannerID *string
}

// Host represents the full detail of a monitored host.
type Host struct {
	ID                string     `json:"id"`
	Name              string     `json:"name"`
	DNSName           string     `json:"dnsName"`
	IPAddress         *string    `json:"ipAddress"`
	Port              int        `json:"port"`
	Enabled           bool       `json:"enabled"`
	ScannerID         *string    `json:"scannerId"`
	ScannerName       *string    `json:"scannerName"`
	ActiveFingerprint *string    `json:"activeFingerprint"`
	LastScannedAt     *time.Time `json:"lastScannedAt"`
	LastScanError     *string    `json:"lastScanError"`
	ErrorSince        *time.Time `json:"errorSince"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// HostListItem represents a summary of a host for list responses.
type HostListItem struct {
	ID                string     `json:"id"`
	Name              string     `json:"name"`
	DNSName           string     `json:"dnsName"`
	Port              int        `json:"port"`
	Enabled           bool       `json:"enabled"`
	ScannerID         *string    `json:"scannerId"`
	ScannerName       *string    `json:"scannerName"`
	ActiveFingerprint *string    `json:"activeFingerprint"`
	LastScannedAt     *time.Time `json:"lastScannedAt"`
	LastScanError     *string    `json:"lastScanError"`
	ErrorSince        *time.Time `json:"errorSince"`
}

// HostList represents a paginated list of hosts.
type HostList struct {
	Items      []HostListItem `json:"items"`
	Page       int            `json:"page"`
	PageSize   int            `json:"pageSize"`
	TotalCount int            `json:"totalCount"`
}

// ScannerHost is the slim host payload returned to scanner agents.
type ScannerHost struct {
	ID        string  `json:"id"`
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
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

// HostScanHistoryList is the response envelope for scan history.
type HostScanHistoryList struct {
	Items []HostScanHistory `json:"items"`
}

// HostScanHistory represents a single scan result recorded for a host.
type HostScanHistory struct {
	ID          string    `json:"id"`
	HostID      string    `json:"hostId"`
	ScannedAt   time.Time `json:"scannedAt"`
	Fingerprint *string   `json:"fingerprint"`
	ResolvedIP  *string   `json:"resolvedIp"`
	TLSVersion  *string   `json:"tlsVersion"`
	ScanError   *string   `json:"scanError"`
}
