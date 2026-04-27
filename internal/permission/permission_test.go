package permission

import "testing"

// TestUsersCredentials_AdminOnly is a regression guard for the credential-
// reset permission split. UsersCredentials gates account-takeover-class
// actions (resetting another user's password, resetting another user's
// 2FA). Anyone holding it can become any other user, so it must remain
// admin-only — accidentally adding it to operator or viewer in
// RolePermissions would silently widen the takeover surface.
func TestUsersCredentials_AdminOnly(t *testing.T) {
	if !Has(RoleAdmin, UsersCredentials) {
		t.Error("admin role should have users:credentials (via wildcard)")
	}
	if Has(RoleOperator, UsersCredentials) {
		t.Error("operator role must NOT have users:credentials — anyone with it can take over any account")
	}
	if Has(RoleViewer, UsersCredentials) {
		t.Error("viewer role must NOT have users:credentials — anyone with it can take over any account")
	}
}

// TestUsersEdit_StillSeparateFromCredentials locks in the split: an
// operator who is given users:edit later (e.g. a future "user manager"
// role) does not automatically inherit credential-reset authority.
func TestUsersEdit_DoesNotImplyCredentials(t *testing.T) {
	// Synthetic role with users:edit only — exactly the case we want to
	// keep working safely.
	RolePermissions["test-user-manager"] = []string{UsersEdit}
	defer delete(RolePermissions, "test-user-manager")

	if !Has("test-user-manager", UsersEdit) {
		t.Fatal("synthetic role lost users:edit — test setup broken")
	}
	if Has("test-user-manager", UsersCredentials) {
		t.Error("users:edit must not imply users:credentials — they are deliberately separate gates")
	}
}

// TestRoleSanityChecks pins down the role grants a future change might
// accidentally widen. Bumps to the operator/viewer permission set should
// be intentional, so this test forces the change to be explicit.
func TestRoleSanityChecks(t *testing.T) {
	// Operator must not hold any users:* mutation permission today.
	for _, p := range []string{UsersEdit, UsersCredentials} {
		if Has(RoleOperator, p) {
			t.Errorf("operator unexpectedly holds %q — review and update this test if intentional", p)
		}
	}
	// Viewer must not hold any users:* permission beyond the implicit
	// SelfAccess (which is held to manage their own account).
	for _, p := range []string{UsersView, UsersEdit, UsersCredentials} {
		if Has(RoleViewer, p) {
			t.Errorf("viewer unexpectedly holds %q — review and update this test if intentional", p)
		}
	}
}
