package models

import "time"

type User struct {
	ID           string
	Username     string
	PasswordHash *string // nil for OIDC/SAML users
	Provider     string
	ProviderID   string
	Role         string
	FirstName    *string
	LastName     *string
	Email        *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// UserResponse is the safe public representation of a user (no password hash).
type UserResponse struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	Provider  string    `json:"provider"`
	FirstName *string   `json:"firstName"`
	LastName  *string   `json:"lastName"`
	Email     *string   `json:"email"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// UserList is a paginated list of users.
type UserList struct {
	Items      []UserResponse `json:"items"`
	Page       int            `json:"page"`
	PageSize   int            `json:"pageSize"`
	TotalCount int            `json:"totalCount"`
}

// ToResponse converts a User to its safe public representation.
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:        u.ID,
		Username:  u.Username,
		Role:      u.Role,
		Provider:  u.Provider,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Email:     u.Email,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}
