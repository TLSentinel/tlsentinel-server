package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
)

func userToModel(u User) models.User {
	return models.User{
		ID:           u.ID,
		Username:     u.Username,
		PasswordHash: u.PasswordHash,
		Provider:     u.Provider,
		ProviderID:   u.ProviderID,
		Role:         u.Role,
		FirstName:    u.FirstName,
		LastName:     u.LastName,
		Email:        u.Email,
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	}
}

// CountUsers returns the total number of users.
func (s *Store) CountUsers(ctx context.Context) (int64, error) {
	var count int64
	err := s.db.NewSelect().
		TableExpr("tlsentinel.users").
		ColumnExpr("COUNT(*)").
		Scan(ctx, &count)
	if err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}
	return count, nil
}

// CountAdminUsers returns the number of users with the admin role.
func (s *Store) CountAdminUsers(ctx context.Context) (int64, error) {
	var count int64
	err := s.db.NewSelect().
		TableExpr("tlsentinel.users").
		ColumnExpr("COUNT(*)").
		Where("role = 'admin'").
		Scan(ctx, &count)
	if err != nil {
		return 0, fmt.Errorf("failed to count admin users: %w", err)
	}
	return count, nil
}

// ListUsers returns a paginated list of users.
//
// search: case-insensitive partial match on username, first_name, or last_name.
// role: "" = all, "admin", "viewer".
// provider: "" = all, "local", "OIDC".
// sort: "" or "newest" (default, created_at DESC), "username" (A→Z), "name" (last_name, first_name A→Z).
func (s *Store) ListUsers(ctx context.Context, page, pageSize int, search, role, provider, sort string) (models.UserList, error) {
	var rows []User

	var orderExpr string
	switch sort {
	case "username":
		orderExpr = "username ASC"
	case "name":
		orderExpr = "last_name ASC NULLS LAST, first_name ASC NULLS LAST"
	default:
		orderExpr = "created_at DESC"
	}

	q := s.db.NewSelect().
		Model(&rows).
		OrderExpr(orderExpr).
		Limit(pageSize).
		Offset((page - 1) * pageSize)

	if search != "" {
		pattern := "%" + search + "%"
		q = q.Where("(username ILIKE ? OR first_name ILIKE ? OR last_name ILIKE ?)", pattern, pattern, pattern)
	}
	if role != "" {
		q = q.Where("role = ?", role)
	}
	if provider != "" {
		q = q.Where("provider = ?", provider)
	}

	total, err := q.ScanAndCount(ctx)
	if err != nil {
		return models.UserList{}, fmt.Errorf("failed to list users: %w", err)
	}

	items := make([]models.UserResponse, len(rows))
	for i, r := range rows {
		u := userToModel(r)
		items[i] = u.ToResponse()
	}
	return models.UserList{
		Items:      items,
		Page:       page,
		PageSize:   pageSize,
		TotalCount: total,
	}, nil
}

// GetUserByID returns a single user by their UUID.
func (s *Store) GetUserByID(ctx context.Context, id string) (models.User, error) {
	var row User
	err := s.db.NewSelect().
		Model(&row).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.User{}, ErrNotFound
		}
		return models.User{}, fmt.Errorf("failed to get user: %w", err)
	}
	return userToModel(row), nil
}

// GetUserByUsername returns a single user by their username.
func (s *Store) GetUserByUsername(ctx context.Context, username string) (models.User, error) {
	var row User
	err := s.db.NewSelect().
		Model(&row).
		Where("username = ?", username).
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.User{}, ErrNotFound
		}
		return models.User{}, fmt.Errorf("failed to get user by username: %w", err)
	}
	return userToModel(row), nil
}

// InsertUser creates a new local user. provider and provider_id are always set to "local" / username.
func (s *Store) InsertUser(ctx context.Context, username, passwordHash, role string, firstName, lastName, email *string) (models.User, error) {
	hash := &passwordHash
	row := &User{
		Username:     username,
		PasswordHash: hash,
		Provider:     "local",
		ProviderID:   username,
		Role:         role,
		FirstName:    firstName,
		LastName:     lastName,
		Email:        email,
	}
	if _, err := s.db.NewInsert().Model(row).
		ExcludeColumn("id", "created_at", "updated_at").
		Returning("*").
		Exec(ctx); err != nil {
		return models.User{}, fmt.Errorf("failed to insert user: %w", err)
	}
	return userToModel(*row), nil
}

// UpdateUser updates mutable user fields (username, role, name, email).
func (s *Store) UpdateUser(ctx context.Context, id, username, role string, firstName, lastName, email *string) (models.User, error) {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.users").
		Set("username = ?", username).
		Set("role = ?", role).
		Set("first_name = ?", firstName).
		Set("last_name = ?", lastName).
		Set("email = ?", email).
		Set("updated_at = NOW()").
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return models.User{}, fmt.Errorf("failed to update user: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return models.User{}, ErrNotFound
	}
	return s.GetUserByID(ctx, id)
}

// UpdateUserPassword replaces the password hash for the given user.
func (s *Store) UpdateUserPassword(ctx context.Context, id, passwordHash string) error {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.users").
		Set("password_hash = ?", passwordHash).
		Set("updated_at = NOW()").
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to update user password: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// OIDCUserParams carries the identity information from an OIDC ID token.
type OIDCUserParams struct {
	ProviderID  string  // idToken.Subject — stored for reference
	Username    string  // derived from email / preferred_username
	Email       *string
	FirstName   *string
	LastName    *string
	DefaultRole string // assigned only when creating a new user
}

// UpsertOIDCUser provisions a user from an OIDC login.
// It matches by email so that an existing local account is automatically
// linked when the email matches. If no match is found a new user is created.
func (s *Store) UpsertOIDCUser(ctx context.Context, p OIDCUserParams) (models.User, error) {
	role := p.DefaultRole
	if role == "" {
		role = "viewer"
	}

	// Try to find an existing user by email.
	if p.Email != nil && *p.Email != "" {
		var existing User
		err := s.db.NewSelect().Model(&existing).
			Where("email = ?", *p.Email).
			Scan(ctx)
		if err == nil {
			// Update mutable profile fields from the latest claims.
			_, updateErr := s.db.NewUpdate().
				TableExpr("tlsentinel.users").
				Set("username = ?", p.Username).
				Set("first_name = ?", p.FirstName).
				Set("last_name = ?", p.LastName).
				Set("provider = 'OIDC'").
				Set("provider_id = ?", p.ProviderID).
				Set("updated_at = NOW()").
				Where("id = ?", existing.ID).
				Exec(ctx)
			if updateErr != nil {
				return models.User{}, fmt.Errorf("failed to update oidc user profile: %w", updateErr)
			}
			return s.GetUserByID(ctx, existing.ID)
		}
	}

	// No existing user — create one.
	row := &User{
		Username:   p.Username,
		Provider:   "OIDC",
		ProviderID: p.ProviderID,
		Role:       role,
		Email:      p.Email,
		FirstName:  p.FirstName,
		LastName:   p.LastName,
	}
	if _, err := s.db.NewInsert().Model(row).
		ExcludeColumn("id", "created_at", "updated_at", "password_hash").
		Returning("*").
		Exec(ctx); err != nil {
		return models.User{}, fmt.Errorf("failed to create oidc user: %w", err)
	}
	return userToModel(*row), nil
}

// DeleteUser removes a user by ID.
func (s *Store) DeleteUser(ctx context.Context, id string) error {
	res, err := s.db.NewDelete().
		Model((*User)(nil)).
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
