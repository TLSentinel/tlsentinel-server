package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/permission"
	"github.com/tlsentinel/tlsentinel-server/internal/provider"
)

// EnsureAdminUser runs at server startup and handles two distinct paths:
//
//  1. First-run seed — when the users table is empty, create an initial
//     admin from TLSENTINEL_ADMIN_USERNAME / TLSENTINEL_ADMIN_PASSWORD.
//
//  2. Break-glass recovery — when TLSENTINEL_BREAKGLASS=true is set, look
//     up TLSENTINEL_BREAKGLASS_USER and apply the requested resets (TOTP
//     and/or password). This is the lockout-recovery path for a sole
//     admin who lost both their authenticator device and recovery codes.
//     It runs regardless of how many users exist; the master toggle is
//     the explicit "I know what I'm doing" assertion required to take a
//     destructive action against an existing user. Reset flags without
//     the master toggle are logged and ignored.
//
// The two paths are mutually exclusive: break-glass takes precedence,
// since an operator setting it explicitly wants destructive behavior
// against an existing user.
func EnsureAdminUser(ctx context.Context, store *db.Store, cfg *config.Config) error {
	plan, err := validateBreakglass(cfg)
	if err != nil {
		return err
	}
	if plan != nil {
		return executeBreakglass(ctx, store, plan)
	}

	// First-run seed.
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

// breakglassPlan is the validated, ready-to-execute description of a
// break-glass run. nil from validateBreakglass means "no break-glass
// action requested" (or the master toggle was off and reset flags were
// ignored).
type breakglassPlan struct {
	Username      string
	ResetTOTP     bool
	ResetPassword bool
	NewPassword   string
}

// validateBreakglass enforces the env-var contract before we touch the
// database. It is a pure function so the contract is unit-testable
// without a DB. Returns:
//
//   - (nil, nil)  — no break-glass requested (or reset flags set without
//     the master toggle, which is logged and treated as no-op so an
//     accidentally-baked-in compose value doesn't error every restart).
//   - (plan, nil) — fully validated, caller should execute.
//   - (nil, err)  — operator config is internally inconsistent;
//     bootstrap should fail loud rather than guess.
func validateBreakglass(cfg *config.Config) (*breakglassPlan, error) {
	if !cfg.Breakglass {
		// Master toggle off — make sure stray reset flags are visible in the
		// logs but don't fail startup. A misconfigured compose file shouldn't
		// prevent the server from booting.
		if cfg.BreakglassResetTOTP || cfg.BreakglassResetPassword {
			slog.Warn("breakglass reset flags ignored: TLSENTINEL_BREAKGLASS not set",
				"reset_totp", cfg.BreakglassResetTOTP,
				"reset_password", cfg.BreakglassResetPassword)
		}
		return nil, nil
	}

	if cfg.BreakglassUser == "" {
		return nil, fmt.Errorf("TLSENTINEL_BREAKGLASS=true requires TLSENTINEL_BREAKGLASS_USER")
	}

	if !cfg.BreakglassResetTOTP && !cfg.BreakglassResetPassword {
		// Toggle on but nothing to do. Warn so operators can spot a typo in
		// the reset flag names — but no-op rather than error so a "test the
		// plumbing" run is harmless.
		slog.Warn("TLSENTINEL_BREAKGLASS=true but no reset flags set; nothing to do",
			"user", cfg.BreakglassUser)
		return nil, nil
	}

	if cfg.BreakglassResetPassword && cfg.BreakglassPassword == "" {
		return nil, fmt.Errorf("TLSENTINEL_BREAKGLASS_RESET_PASSWORD=true requires TLSENTINEL_BREAKGLASS_PASSWORD")
	}

	return &breakglassPlan{
		Username:      cfg.BreakglassUser,
		ResetTOTP:     cfg.BreakglassResetTOTP,
		ResetPassword: cfg.BreakglassResetPassword,
		NewPassword:   cfg.BreakglassPassword,
	}, nil
}

// executeBreakglass applies a validated plan against the database. By
// design it refuses to operate on:
//   - users that don't exist (fail loud — operator likely typo'd the
//     username; we don't want to silently fall back to the first-run
//     create path or guess a different user)
//   - non-admin users (break-glass is for admin lockout recovery, not a
//     generic password reset tool — refusing here means an attacker who
//     gained env access can't pick an arbitrary victim account)
//   - non-local users (OIDC accounts have no local password to reset
//     and TOTP isn't applicable to them)
func executeBreakglass(ctx context.Context, store *db.Store, plan *breakglassPlan) error {
	user, err := store.GetUserByUsername(ctx, plan.Username)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return fmt.Errorf("breakglass: user %q does not exist (typo in TLSENTINEL_BREAKGLASS_USER?)", plan.Username)
		}
		return fmt.Errorf("breakglass: lookup user: %w", err)
	}
	if user.Role != permission.RoleAdmin {
		return fmt.Errorf("breakglass: user %q is role=%q, not admin — refusing", plan.Username, user.Role)
	}
	if user.Provider != provider.Local {
		return fmt.Errorf("breakglass: user %q is provider=%q, not local — refusing", plan.Username, user.Provider)
	}

	if plan.ResetPassword {
		hash, err := bcrypt.GenerateFromPassword([]byte(plan.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("breakglass: hash password: %w", err)
		}
		if err := store.UpdateUserPassword(ctx, user.ID, string(hash)); err != nil {
			return fmt.Errorf("breakglass: update password: %w", err)
		}
	}
	if plan.ResetTOTP {
		// DisableUserTOTP transactionally clears secret + enabled flag +
		// enrolled_at + purges recovery codes. If the user never enrolled
		// it's still a valid no-op against those columns.
		if err := store.DisableUserTOTP(ctx, user.ID); err != nil {
			return fmt.Errorf("breakglass: disable totp: %w", err)
		}
	}

	// One audit row, both reset booleans in details — keeps the log read
	// naturally as "this single break-glass operation did X and Y."
	LogSystem(ctx, store, audit.Entry{
		Action:       audit.BootstrapBreakglass,
		ResourceType: "user",
		ResourceID:   user.ID,
		Label:        user.Username,
		Details: map[string]any{
			"reset_totp":     plan.ResetTOTP,
			"reset_password": plan.ResetPassword,
		},
	})

	slog.Warn("breakglass executed",
		"user", user.Username,
		"reset_totp", plan.ResetTOTP,
		"reset_password", plan.ResetPassword,
		"next_step", "remove TLSENTINEL_BREAKGLASS_* env vars and restart")
	return nil
}
