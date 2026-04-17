package auth

import (
	"context"
	"fmt"
	"log/slog"

	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/permission"
	"github.com/tlsentinel/tlsentinel-server/internal/provider"
)

// EnsureAdminUser creates the initial admin user from the provided credentials
// if no users currently exist. It is a no-op once any user exists.
func EnsureAdminUser(ctx context.Context, store *db.Store, cfg *config.Config) error {
	count, err := store.CountUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to count users: %w", err)
	}
	if count > 0 {
		return nil
	}

	if cfg.AdminUsername == "" || cfg.AdminPassword == "" {
		return fmt.Errorf("TLSENTINEL_ADMIN_USERNAME and TLSENTINEL_ADMIN_PASSWORD must be set for initial bootstrap")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %w", err)
	}

	firstName := "Administrator"
	if _, err := store.InsertUser(ctx, cfg.AdminUsername, string(hash), permission.RoleAdmin, provider.Local, false, &firstName, nil, nil); err != nil {
		return fmt.Errorf("failed to create admin user: %w", err)
	}

	slog.Info("bootstrapped admin user", "username", cfg.AdminUsername)
	return nil
}
