package models

import "time"

type Group struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type GroupList struct {
	Items      []Group `json:"items"`
	Page       int     `json:"page"`
	PageSize   int     `json:"pageSize"`
	TotalCount int     `json:"totalCount"`
}
