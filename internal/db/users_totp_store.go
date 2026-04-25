package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// GetUserTOTPSecret returns the encrypted TOTP secret for a user, plus
// whether TOTP is currently enabled. Both fields can be NULL/false on a
// user who has never enrolled — callers should always check enabled
// before treating the secret as authoritative for login.
func (s *Store) GetUserTOTPSecret(ctx context.Context, userID string) (encryptedSecret *string, enabled bool, err error) {
	var row User
	if err := s.db.NewSelect().
		Model(&row).
		Column("totp_secret", "totp_enabled").
		Where("id = ?", userID).
		Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, ErrNotFound
		}
		return nil, false, fmt.Errorf("get totp secret: %w", err)
	}
	return row.TOTPSecret, row.TOTPEnabled, nil
}

// StoreUserTOTPSecret saves the encrypted secret on the user row. The
// row is left with totp_enabled=FALSE so a partially-enrolled user
// (started setup, never confirmed) can't be forced through a TOTP prompt
// on the next login. EnableUserTOTP flips the flag once verification
// succeeds.
func (s *Store) StoreUserTOTPSecret(ctx context.Context, userID, encryptedSecret string) error {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.users").
		Set("totp_secret = ?", encryptedSecret).
		Set("totp_enabled = FALSE").
		Set("updated_at = NOW()").
		Where("id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("store totp secret: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// EnableUserTOTP marks the user's TOTP setup as confirmed and stamps the
// enrollment timestamp. Idempotent: re-enabling does not overwrite the
// original enrollment time.
func (s *Store) EnableUserTOTP(ctx context.Context, userID string) error {
	res, err := s.db.NewUpdate().
		TableExpr("tlsentinel.users").
		Set("totp_enabled = TRUE").
		Set("totp_enrolled_at = COALESCE(totp_enrolled_at, NOW())").
		Set("updated_at = NOW()").
		Where("id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("enable totp: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// DisableUserTOTP clears the secret, the enabled flag, the enrollment
// timestamp, and any unused recovery codes for the user. Used when the
// user opts out and when an admin force-disables the second factor on
// behalf of a user who lost their device. The codes table CASCADE-
// deletes if the user is deleted, but we still purge here so a future
// re-enrollment doesn't carry forward stale codes.
func (s *Store) DisableUserTOTP(ctx context.Context, userID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("disable totp begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	res, err := tx.NewUpdate().
		TableExpr("tlsentinel.users").
		Set("totp_secret = NULL").
		Set("totp_enabled = FALSE").
		Set("totp_enrolled_at = NULL").
		Set("updated_at = NOW()").
		Where("id = ?", userID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("disable totp update: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}

	if _, err := tx.NewDelete().
		Model((*UserTOTPRecoveryCode)(nil)).
		Where("user_id = ?", userID).
		Exec(ctx); err != nil {
		return fmt.Errorf("disable totp purge codes: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("disable totp commit: %w", err)
	}
	return nil
}

// ReplaceUserTOTPRecoveryCodes deletes any existing codes for the user
// and inserts the given hashed codes. Used both at first enrollment and
// when the user regenerates the set. The whole operation runs in a
// transaction so a partial replacement is impossible — either the user
// has the new set or the old set, never a mix.
func (s *Store) ReplaceUserTOTPRecoveryCodes(ctx context.Context, userID string, hashes []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("replace recovery codes begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.NewDelete().
		Model((*UserTOTPRecoveryCode)(nil)).
		Where("user_id = ?", userID).
		Exec(ctx); err != nil {
		return fmt.Errorf("replace recovery codes delete: %w", err)
	}

	if len(hashes) > 0 {
		rows := make([]UserTOTPRecoveryCode, len(hashes))
		for i, h := range hashes {
			rows[i] = UserTOTPRecoveryCode{UserID: userID, CodeHash: h}
		}
		if _, err := tx.NewInsert().
			Model(&rows).
			ExcludeColumn("id", "used_at", "created_at").
			Exec(ctx); err != nil {
			return fmt.Errorf("replace recovery codes insert: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("replace recovery codes commit: %w", err)
	}
	return nil
}

// ListUnusedUserTOTPRecoveryCodes returns the bcrypt hashes (with row
// IDs) for every code on the user that hasn't been redeemed yet. The
// caller bcrypt-compares the user-typed code against each hash; on the
// first match it calls MarkUserTOTPRecoveryCodeUsed with the row ID.
func (s *Store) ListUnusedUserTOTPRecoveryCodes(ctx context.Context, userID string) ([]UserTOTPRecoveryCode, error) {
	var rows []UserTOTPRecoveryCode
	if err := s.db.NewSelect().
		Model(&rows).
		Where("user_id = ?", userID).
		Where("used_at IS NULL").
		Scan(ctx); err != nil {
		return nil, fmt.Errorf("list recovery codes: %w", err)
	}
	return rows, nil
}

// MarkUserTOTPRecoveryCodeUsed stamps used_at on the given code row.
// Idempotent: re-marking is a no-op since the WHERE clause excludes
// already-used rows.
func (s *Store) MarkUserTOTPRecoveryCodeUsed(ctx context.Context, codeID string) error {
	_, err := s.db.NewUpdate().
		Model((*UserTOTPRecoveryCode)(nil)).
		Set("used_at = NOW()").
		Where("id = ?", codeID).
		Where("used_at IS NULL").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("mark recovery code used: %w", err)
	}
	return nil
}

// CountUnusedUserTOTPRecoveryCodes returns how many recovery codes the
// user still has available — surfaced in the UI so the user knows when
// to regenerate.
func (s *Store) CountUnusedUserTOTPRecoveryCodes(ctx context.Context, userID string) (int, error) {
	var count int
	if err := s.db.NewSelect().
		TableExpr("tlsentinel.user_totp_recovery_codes").
		ColumnExpr("COUNT(*)").
		Where("user_id = ?", userID).
		Where("used_at IS NULL").
		Scan(ctx, &count); err != nil {
		return 0, fmt.Errorf("count recovery codes: %w", err)
	}
	return count, nil
}
