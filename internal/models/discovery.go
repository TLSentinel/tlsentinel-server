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
