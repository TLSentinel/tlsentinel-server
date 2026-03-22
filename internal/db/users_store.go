package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/role"
)

func userToModel(u User) models.User {
	return models.User{
		ID:           u.ID,
		Username:     u.Username,
		PasswordHash: u.PasswordHash,
		Provider:     u.Provider,
		Enabled:      u.Enabled,
		Notify:       u.Notify,
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
		Where("role = ?", role.Admin).
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

// InsertUser creates a new user. passwordHash may be empty for OIDC-only accounts.
func (s *Store) InsertUser(ctx context.Context, username, passwordHash, role, provider string, notify bool, firstName, lastName, email *string) (models.User, error) {
	var hash *string
	if passwordHash != "" {
		hash = &passwordHash
	}
	row := &User{
		Username:     username,
		PasswordHash: hash,
		Provider:     provider,
		Enabled:      true,
		Notify:       notify,
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

// UpdateUser updates mutable user fields (username, role, provider, notify, name, email).
// Switching to "oidc" clears password_hash — OIDC users authenticate via SSO only.
func (s *Store) UpdateUser(ctx context.Context, id, username, role, provider string, notify bool, firstName, lastName, email *string) (models.User, error) {
	q := s.db.NewUpdate().
		TableExpr("tlsentinel.users").
		Set("username = ?", username).
		Set("role = ?", role).
		Set("provider = ?", provider).
		Set("notify = ?", notify).
		Set("first_name = ?", firstName).
		Set("last_name = ?", lastName).
		Set("email = ?", email).
		Set("updated_at = NOW()").
		Where("id = ?", id)
	if provider == "oidc" {
		q = q.Set("password_hash = NULL")
	}
	res, err := q.Exec(ctx)
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

// GetUserForOIDCLogin looks up an existing, enabled user by username for OIDC login.
// Users must be pre-provisioned by an admin — OIDC is an authentication mechanism only,
// not an auto-provisioning path. Returns ErrNotFound if the user does not exist or is disabled.
func (s *Store) GetUserForOIDCLogin(ctx context.Context, username string) (models.User, error) {
	var row User
	err := s.db.NewSelect().
		Model(&row).
		Where("username = ?", username).
		Where("enabled = TRUE").
		Scan(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.User{}, ErrNotFound
		}
		return models.User{}, fmt.Errorf("failed to look up oidc user: %w", err)
	}
	return userToModel(row), nil
}

// SetUserEnabled enables or disables a user account.
func (s *Store) SetUserEnabled(ctx context.Context, id string, enabled bool) (models.User, error) {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.users").
		Set("enabled = ?", enabled).
		Set("updated_at = NOW()").
		Where("id = ?", id).
		Exec(ctx)
	if err != nil {
		return models.User{}, fmt.Errorf("failed to set user enabled: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return models.User{}, ErrNotFound
	}
	return s.GetUserByID(ctx, id)
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
