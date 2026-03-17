package models

import "time"

// ExpiringCertItem represents a certificate that is active on a host and
// approaching (or past) its expiry date.
type ExpiringCertItem struct {
	HostID        string    `json:"hostId"`
	HostName      string    `json:"hostName"`
	DNSName       string    `json:"dnsName"`
	Port          int       `json:"port"`
	Fingerprint   string    `json:"fingerprint"`
	CommonName    string    `json:"commonName"`
	NotAfter      time.Time `json:"notAfter"`
	DaysRemaining int       `json:"daysRemaining"`
}

// ExpiringCertList is the response envelope for the expiring certs endpoint.
type ExpiringCertList struct {
	Items []ExpiringCertItem `json:"items"`
}
