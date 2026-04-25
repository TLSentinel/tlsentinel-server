package totp

import (
	"strings"
	"testing"
	"time"

	"github.com/pquerna/otp"
	totplib "github.com/pquerna/otp/totp"
)

// stubNow swaps the nowUTC clock for the duration of the test and returns a
// restore function. Failing to call the returned cleanup leaks the override
// into other tests, so callers must `defer restore()` immediately.
func stubNow(t *testing.T, instant time.Time) (restore func()) {
	t.Helper()
	prev := nowUTC
	nowUTC = func() time.Time { return instant }
	return func() { nowUTC = prev }
}

// codeAt returns a valid TOTP for `secret` at the given moment, using the
// same parameters as the production Validate call. Used to drive the
// happy-path verification tests without coupling to the wall clock.
func codeAt(t *testing.T, secret string, instant time.Time) string {
	t.Helper()
	code, err := totplib.GenerateCodeCustom(secret, instant, totplib.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	if err != nil {
		t.Fatalf("GenerateCodeCustom: %v", err)
	}
	return code
}

func TestGenerate_ProducesValidSetup(t *testing.T) {
	setup, err := Generate("alice@example.com")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if setup.Secret == "" {
		t.Fatal("Setup.Secret is empty")
	}
	// 20 random bytes base32-encoded with no padding -> 32 characters.
	if len(setup.Secret) != 32 {
		t.Errorf("Secret length = %d, want 32 (base32 of 20 random bytes, no padding)", len(setup.Secret))
	}
	if !strings.HasPrefix(setup.URI, "otpauth://totp/") {
		t.Errorf("URI does not start with otpauth scheme: %q", setup.URI)
	}
	if !strings.Contains(setup.URI, "issuer=TLSentinel") {
		t.Errorf("URI missing issuer parameter: %q", setup.URI)
	}
	if !strings.Contains(setup.URI, "alice%40example.com") && !strings.Contains(setup.URI, "alice@example.com") {
		t.Errorf("URI does not embed account label: %q", setup.URI)
	}
}

func TestGenerate_UniqueSecrets(t *testing.T) {
	a, err := Generate("alice")
	if err != nil {
		t.Fatalf("Generate a: %v", err)
	}
	b, err := Generate("alice")
	if err != nil {
		t.Fatalf("Generate b: %v", err)
	}
	if a.Secret == b.Secret {
		t.Fatal("two consecutive Generate calls produced the same secret — RNG broken")
	}
}

func TestValidate_AcceptsCurrentCode(t *testing.T) {
	setup, err := Generate("bob")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	defer stubNow(t, now)()

	code := codeAt(t, setup.Secret, now)
	if !Validate(setup.Secret, code) {
		t.Errorf("Validate rejected current code %q for secret %q", code, setup.Secret)
	}
}

func TestValidate_RejectsWrongCode(t *testing.T) {
	setup, err := Generate("bob")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	defer stubNow(t, now)()

	if Validate(setup.Secret, "000000") {
		t.Error("Validate accepted clearly-wrong code 000000")
	}
	if Validate(setup.Secret, "") {
		t.Error("Validate accepted empty code")
	}
	if Validate(setup.Secret, "12345") {
		t.Error("Validate accepted under-length code 12345")
	}
}

func TestValidate_AllowsOnePeriodSkew(t *testing.T) {
	setup, err := Generate("bob")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)

	// Code generated for "30 seconds ago" should still be accepted under the
	// configured ±1-period skew window.
	codePrev := codeAt(t, setup.Secret, now.Add(-30*time.Second))
	codeNext := codeAt(t, setup.Secret, now.Add(30*time.Second))

	defer stubNow(t, now)()
	if !Validate(setup.Secret, codePrev) {
		t.Errorf("Validate rejected previous-period code %q (skew=1 should accept)", codePrev)
	}
	if !Validate(setup.Secret, codeNext) {
		t.Errorf("Validate rejected next-period code %q (skew=1 should accept)", codeNext)
	}
}

func TestValidate_RejectsPeriodTwoSteps(t *testing.T) {
	setup, err := Generate("bob")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	// Two periods (60s) out should fall outside the skew window. Using 65s
	// to stay clear of the 30s boundary regardless of where `now` lands.
	stale := codeAt(t, setup.Secret, now.Add(-65*time.Second))

	defer stubNow(t, now)()
	if Validate(setup.Secret, stale) {
		t.Errorf("Validate accepted code from two periods ago — skew window too wide")
	}
}

func TestValidate_RejectsCodeForDifferentSecret(t *testing.T) {
	a, _ := Generate("alice")
	b, _ := Generate("bob")
	now := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)

	defer stubNow(t, now)()
	if Validate(a.Secret, codeAt(t, b.Secret, now)) {
		t.Error("Validate accepted a code generated from a different secret")
	}
}

func TestGenerateRecoveryCodes_Shape(t *testing.T) {
	codes, err := GenerateRecoveryCodes()
	if err != nil {
		t.Fatalf("GenerateRecoveryCodes: %v", err)
	}
	if len(codes) != RecoveryCodeCount {
		t.Errorf("got %d codes, want %d", len(codes), RecoveryCodeCount)
	}

	seen := map[string]bool{}
	for i, c := range codes {
		// 10 random bytes base32-encoded (no padding) is 16 chars; with three
		// dashes inserted the formatted string is 19 chars.
		if len(c) != 19 {
			t.Errorf("code[%d] = %q has length %d, want 19 (XXXX-XXXX-XXXX-XXXX)", i, c, len(c))
		}
		// Group/dash positions:  XXXX-XXXX-XXXX-XXXX
		if c[4] != '-' || c[9] != '-' || c[14] != '-' {
			t.Errorf("code[%d] = %q is not in XXXX-XXXX-XXXX-XXXX shape", i, c)
		}
		if seen[c] {
			t.Errorf("code[%d] = %q is a duplicate of an earlier code", i, c)
		}
		seen[c] = true
	}
}

func TestNormalizeRecoveryCode(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"abcd-efgh-ijkl-mnop", "ABCDEFGHIJKLMNOP"},
		{"ABCD-EFGH-IJKL-MNOP", "ABCDEFGHIJKLMNOP"},
		{"  abcd efgh ijkl mnop  ", "ABCDEFGHIJKLMNOP"},
		{"abcdefghijklmnop", "ABCDEFGHIJKLMNOP"},
		{"AbCd-EfGh-IjKl-MnOp", "ABCDEFGHIJKLMNOP"},
		{"", ""},
	}
	for _, c := range cases {
		if got := NormalizeRecoveryCode(c.in); got != c.want {
			t.Errorf("NormalizeRecoveryCode(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestNormalizeRecoveryCode_PreservesNonDelimiterChars(t *testing.T) {
	// Anything that's not a space or dash is preserved (and uppercased) —
	// the caller bcrypt-compares against a known-good code, so weird input
	// just yields a no-match rather than passing through.
	got := NormalizeRecoveryCode("ab/cd")
	if got != "AB/CD" {
		t.Errorf("got %q, want AB/CD (only spaces and dashes should be stripped)", got)
	}
}
