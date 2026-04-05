package models

import "time"

type TagCategory struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Tag struct {
	ID          string    `json:"id"`
	CategoryID  string    `json:"categoryId"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

// TagWithCategory is a tag with its category name embedded — used in endpoint responses.
type TagWithCategory struct {
	ID           string  `json:"id"`
	CategoryID   string  `json:"categoryId"`
	CategoryName string  `json:"categoryName"`
	Name         string  `json:"name"`
	Description  *string `json:"description,omitempty"`
}

// CategoryWithTags is a category with its tags — used in the settings page.
type CategoryWithTags struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	Tags        []Tag     `json:"tags"`
}

type CreateTagCategoryRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type UpdateTagCategoryRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

type CreateTagRequest struct {
	CategoryID  string  `json:"categoryId"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type UpdateTagRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

// SetEndpointTagsRequest replaces all tags on an endpoint.
type SetEndpointTagsRequest struct {
	TagIDs []string `json:"tagIds"`
}
