package models

import "time"

// DiscoveryNetwork is the API representation of a discovery_networks row.
type DiscoveryNetwork struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Range          string    `json:"range"`
	Ports          []int     `json:"ports"`
	ScannerID      *string   `json:"scannerId"`
	ScannerName    *string   `json:"scannerName"`
	CronExpression string    `json:"cronExpression"`
	Enabled        bool      `json:"enabled"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// DiscoveryNetworkList is the paginated list response.
type DiscoveryNetworkList struct {
	Items      []DiscoveryNetwork `json:"items"`
	TotalCount int                `json:"totalCount"`
}

// CreateDiscoveryNetworkRequest is the payload for POST /discovery/networks.
type CreateDiscoveryNetworkRequest struct {
	Name           string  `json:"name"`
	Range          string  `json:"range"`
	Ports          []int   `json:"ports"`
	ScannerID      *string `json:"scannerId"`
	CronExpression string  `json:"cronExpression"`
	Enabled        bool    `json:"enabled"`
}

// UpdateDiscoveryNetworkRequest is the payload for PUT /discovery/networks/{id}.
type UpdateDiscoveryNetworkRequest struct {
	Name           string  `json:"name"`
	Range          string  `json:"range"`
	Ports          []int   `json:"ports"`
	ScannerID      *string `json:"scannerId"`
	CronExpression string  `json:"cronExpression"`
	Enabled        bool    `json:"enabled"`
}

// DiscoveryInboxItem is the API representation of a discovery_inbox row.
type DiscoveryInboxItem struct {
	ID           string    `json:"id"`
	NetworkID    *string   `json:"networkId"`
	NetworkName  *string   `json:"networkName"`
	ScannerID    *string   `json:"scannerId"`
	ScannerName  *string   `json:"scannerName"`
	IP           string    `json:"ip"`
	RDNS         *string   `json:"rdns"`
	Port         int       `json:"port"`
	Fingerprint  *string   `json:"fingerprint"`
	CommonName   *string   `json:"commonName"`
	Status       string    `json:"status"`
	EndpointID   *string   `json:"endpointId"`
	EndpointName *string   `json:"endpointName"`
	FirstSeenAt  time.Time `json:"firstSeenAt"`
	LastSeenAt   time.Time `json:"lastSeenAt"`
}

// DiscoveryInboxList is the paginated list response.
type DiscoveryInboxList struct {
	Items      []DiscoveryInboxItem `json:"items"`
	TotalCount int                  `json:"totalCount"`
}
