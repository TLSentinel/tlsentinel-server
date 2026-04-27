package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/jwt"
)

func newJWTConfig() *jwt.JWTConfig {
	return &jwt.JWTConfig{
		SecretKey: []byte("test-secret-for-middleware-tests"),
		TTL:       24 * time.Hour,
	}
}

// TestVerifyJWT_AcceptsSessionToken locks in the happy path: a normal session
// token (no Purpose claim) maps to a user identity with the right fields.
func TestVerifyJWT_AcceptsSessionToken(t *testing.T) {
	cfg := newJWTConfig()
	tok, err := cfg.IssueToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}

	id, err := verifyJWT(cfg, tok)
	if err != nil {
		t.Fatalf("verifyJWT rejected a valid session token: %v", err)
	}
	if id.Kind != KindUser {
		t.Errorf("Identity.Kind = %v, want KindUser", id.Kind)
	}
	if id.UserID != "user-1" || id.Username != "alice" || id.Role != "admin" {
		t.Errorf("Identity fields wrong: %+v", id)
	}
}

// TestVerifyJWT_RejectsChallengeToken is the security-critical case: a
// password-only challenge token must not unlock /api/v1/* routes. If this
// test ever passes-by-accepting, an attacker who phished a password could
// use the challenge token directly against the API and skip the second
// factor entirely.
func TestVerifyJWT_RejectsChallengeToken(t *testing.T) {
	cfg := newJWTConfig()
	tok, err := cfg.IssueTOTPChallengeToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueTOTPChallengeToken: %v", err)
	}

	_, err = verifyJWT(cfg, tok)
	if err == nil {
		t.Fatal("verifyJWT accepted a challenge token — challenge tokens must be rejected by the API auth middleware")
	}
	if !strings.Contains(err.Error(), "api access") {
		t.Errorf("error %q does not mention api access — message change is fine but the rejection must be unambiguous", err.Error())
	}
}

func TestVerifyJWT_RejectsExpired(t *testing.T) {
	cfg := &jwt.JWTConfig{SecretKey: []byte("test"), TTL: -time.Second}
	tok, err := cfg.IssueToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	if _, err := verifyJWT(cfg, tok); err == nil {
		t.Error("verifyJWT accepted an expired token")
	}
}
