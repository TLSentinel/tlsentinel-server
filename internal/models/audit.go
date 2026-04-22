package models

import (
	"encoding/json"
	"time"
)

type AuditLog struct {
	ID            string          `json:"id"`
	UserID        *string         `json:"userId,omitempty"`
	Username      string          `json:"username"`
	Action        string          `json:"action"`
	ResourceType  *string         `json:"resourceType,omitempty"`
	ResourceID    *string         `json:"resourceId,omitempty"`
	ResourceLabel *string         `json:"resourceLabel,omitempty"`
	IPAddress     *string         `json:"ipAddress,omitempty"`
	Details       json.RawMessage `json:"details,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
}

type AuditLogList struct {
	Items      []AuditLog `json:"items"`
	Page       int        `json:"page"`
	PageSize   int        `json:"pageSize"`
	TotalCount int        `json:"totalCount"`
}
