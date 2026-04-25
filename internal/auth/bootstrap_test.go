package auth

import (
	"strings"
	"testing"

	"github.com/tlsentinel/tlsentinel-server/internal/config"
)

// validateBreakglass is the env-var contract gate for the bootstrap
// recovery path. We test it as a pure function so the rules ("master
// toggle gates everything", "USER required when toggle on", "PASSWORD
// required iff RESET_PASSWORD") are locked in without spinning up a DB.
//
// The DB-touching half (executeBreakglass) is covered by manual operator
// runbook execution against a dev instance — there's no test-DB harness
// in this package to wire it into yet.

func TestValidateBreakglass_DefaultIsNoop(t *testing.T) {
	plan, err := validateBreakglass(&config.Config{})
	if err != nil {
		t.Fatalf("expected no error with empty config, got %v", err)
	}
	if plan != nil {
		t.Fatalf("expected nil plan with empty config, got %+v", plan)
	}
}

func TestValidateBreakglass_ResetFlagsWithoutToggle_NoopAndWarns(t *testing.T) {
	// Master toggle off + reset flags set → ignored, not an error. This
	// is the "operator left RESET_TOTP=true baked into compose" case;
	// the server should still boot.
	cfg := &config.Config{
		BreakglassResetTOTP:     true,
		BreakglassResetPassword: true,
		BreakglassPassword:      "doesntmatter",
	}
	plan, err := validateBreakglass(cfg)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if plan != nil {
		t.Fatalf("expected nil plan when master toggle off, got %+v", plan)
	}
}

func TestValidateBreakglass_ToggleWithoutUser_Errors(t *testing.T) {
	cfg := &config.Config{Breakglass: true, BreakglassResetTOTP: true}
	_, err := validateBreakglass(cfg)
	if err == nil {
		t.Fatal("expected error when BREAKGLASS=true but USER unset")
	}
	if !strings.Contains(err.Error(), "TLSENTINEL_BREAKGLASS_USER") {
		t.Errorf("error should name the missing var; got: %v", err)
	}
}

func TestValidateBreakglass_ToggleWithNoResetFlags_Noop(t *testing.T) {
	// Toggle on, user set, but neither reset requested. We treat this as
	// a "test the plumbing" run — warn and no-op rather than error.
	cfg := &config.Config{Breakglass: true, BreakglassUser: "admin"}
	plan, err := validateBreakglass(cfg)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if plan != nil {
		t.Fatalf("expected nil plan with no reset flags, got %+v", plan)
	}
}

func TestValidateBreakglass_ResetPasswordWithoutPassword_Errors(t *testing.T) {
	cfg := &config.Config{
		Breakglass:              true,
		BreakglassUser:          "admin",
		BreakglassResetPassword: true,
		// BreakglassPassword intentionally empty
	}
	_, err := validateBreakglass(cfg)
	if err == nil {
		t.Fatal("expected error when RESET_PASSWORD=true but PASSWORD unset")
	}
	if !strings.Contains(err.Error(), "TLSENTINEL_BREAKGLASS_PASSWORD") {
		t.Errorf("error should name the missing var; got: %v", err)
	}
}

func TestValidateBreakglass_ResetTOTPOnly_HappyPath(t *testing.T) {
	// The most common recovery shape: user remembers their password but
	// lost their authenticator. No new password needed.
	cfg := &config.Config{
		Breakglass:          true,
		BreakglassUser:      "admin",
		BreakglassResetTOTP: true,
	}
	plan, err := validateBreakglass(cfg)
	if err != nil {
		t.Fatalf("validateBreakglass: %v", err)
	}
	if plan == nil {
		t.Fatal("expected non-nil plan")
	}
	if plan.Username != "admin" || !plan.ResetTOTP || plan.ResetPassword {
		t.Errorf("plan = %+v, want {Username:admin ResetTOTP:true ResetPassword:false}", plan)
	}
}

func TestValidateBreakglass_BothResets_HappyPath(t *testing.T) {
	cfg := &config.Config{
		Breakglass:              true,
		BreakglassUser:          "admin",
		BreakglassResetTOTP:     true,
		BreakglassResetPassword: true,
		BreakglassPassword:      "newpw",
	}
	plan, err := validateBreakglass(cfg)
	if err != nil {
		t.Fatalf("validateBreakglass: %v", err)
	}
	if plan == nil {
		t.Fatal("expected non-nil plan")
	}
	if plan.Username != "admin" || !plan.ResetTOTP || !plan.ResetPassword || plan.NewPassword != "newpw" {
		t.Errorf("plan = %+v, want both resets and NewPassword=newpw", plan)
	}
}

func TestValidateBreakglass_ResetPasswordOnly_HappyPath(t *testing.T) {
	// Password reset alone — TOTP still works.
	cfg := &config.Config{
		Breakglass:              true,
		BreakglassUser:          "admin",
		BreakglassResetPassword: true,
		BreakglassPassword:      "newpw",
	}
	plan, err := validateBreakglass(cfg)
	if err != nil {
		t.Fatalf("validateBreakglass: %v", err)
	}
	if plan == nil {
		t.Fatal("expected non-nil plan")
	}
	if plan.ResetTOTP || !plan.ResetPassword {
		t.Errorf("plan = %+v, want ResetTOTP=false ResetPassword=true", plan)
	}
}
