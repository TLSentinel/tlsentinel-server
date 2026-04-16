package models

import "time"

type ScannerToken struct {
	ID         string
	Name       string
	TokenHash  string
	CreatedAt  time.Time
	LastUsedAt *time.Time
}

// ScannerTokenResponse is the safe public representation of a scanner token (no hash).
type ScannerTokenResponse struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	IsDefault          bool       `json:"isDefault"`
	ScanCronExpression string     `json:"scanCronExpression"`
	ScanConcurrency    int        `json:"scanConcurrency"`
	CreatedAt          time.Time  `json:"createdAt"`
	LastUsedAt         *time.Time `json:"lastUsedAt"`

}
