package auth

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
)

// EnsureAdminUser creates the initial admin user from the provided credentials
// if no users currently exist. It is a no-op once any user exists.
func EnsureAdminUser(ctx context.Context, store *db.Store, username, password string) error {
	count, err := store.CountUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to count users: %w", err)
	}
	if count > 0 {
		return nil // already bootstrapped
	}

	if username == "" || password == "" {
		return fmt.Errorf("TLSENTINEL_ADMIN_USERNAME and TLSENTINEL_ADMIN_PASSWORD must be set for initial bootstrap")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %w", err)
	}

	if _, err := store.InsertUser(ctx, username, string(hash), "admin", nil, nil, nil); err != nil {
		return fmt.Errorf("failed to create admin user: %w", err)
	}

	zap.L().Info("bootstrapped admin user", zap.String("username", username))
	return nil
}
