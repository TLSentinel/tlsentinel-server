package jwt

import (
	"strings"
	"testing"
	"time"
)

func newTestConfig() *JWTConfig {
	return &JWTConfig{
		SecretKey: []byte("test-secret-key-for-unit-tests-only"),
		TTL:       24 * time.Hour,
	}
}

func TestIssueAndValidateToken_RoundTrip(t *testing.T) {
	cfg := newTestConfig()
	first := "Alice"
	last := "Example"
	tok, err := cfg.IssueToken("user-1", "alice", "admin", &first, &last)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}

	claims, err := cfg.ValidateToken(tok)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if claims.UserID != "user-1" {
		t.Errorf("UserID = %q, want user-1", claims.UserID)
	}
	if claims.Username != "alice" {
		t.Errorf("Username = %q, want alice", claims.Username)
	}
	if claims.Role != "admin" {
		t.Errorf("Role = %q, want admin", claims.Role)
	}
	if claims.Purpose != "" {
		t.Errorf("session token Purpose = %q, want empty (only challenge tokens carry a purpose)", claims.Purpose)
	}
	if claims.FirstName == nil || *claims.FirstName != "Alice" {
		t.Errorf("FirstName = %v, want pointer to Alice", claims.FirstName)
	}
}

func TestIssueTOTPChallengeToken_HasPurpose(t *testing.T) {
	cfg := newTestConfig()
	tok, err := cfg.IssueTOTPChallengeToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueTOTPChallengeToken: %v", err)
	}
	claims, err := cfg.ValidateToken(tok)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if claims.Purpose != PurposeTOTPChallenge {
		t.Errorf("Purpose = %q, want %q", claims.Purpose, PurposeTOTPChallenge)
	}
	// Challenge tokens must be short-lived (5 min by design). The exact
	// TTL is an implementation detail; we just assert it's well under
	// the session TTL so a leaked challenge can't function as a session.
	ttl := time.Until(claims.ExpiresAt.Time)
	if ttl > 10*time.Minute {
		t.Errorf("challenge TTL = %v, want under 10 minutes", ttl)
	}
	if ttl <= 0 {
		t.Errorf("challenge TTL non-positive: %v", ttl)
	}
}

func TestSessionAndChallengeTokens_AreDistinguishable(t *testing.T) {
	// Regression guard for the multi-step login design: a session token and
	// a challenge token issued for the same user must be distinguishable
	// by the Purpose claim — otherwise the auth middleware could not tell
	// them apart and a leaked challenge would unlock the API.
	cfg := newTestConfig()
	session, err := cfg.IssueToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	challenge, err := cfg.IssueTOTPChallengeToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueTOTPChallengeToken: %v", err)
	}
	if session == challenge {
		t.Fatal("session and challenge tokens are byte-identical — Purpose claim is missing")
	}

	sc, err := cfg.ValidateToken(session)
	if err != nil {
		t.Fatalf("ValidateToken(session): %v", err)
	}
	cc, err := cfg.ValidateToken(challenge)
	if err != nil {
		t.Fatalf("ValidateToken(challenge): %v", err)
	}
	if sc.Purpose == cc.Purpose {
		t.Error("session and challenge tokens have the same Purpose — middleware can't tell them apart")
	}
}

func TestValidateToken_RejectsWrongSecret(t *testing.T) {
	a := newTestConfig()
	tok, err := a.IssueToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	b := &JWTConfig{SecretKey: []byte("a-completely-different-secret-key"), TTL: time.Hour}
	if _, err := b.ValidateToken(tok); err == nil {
		t.Error("ValidateToken accepted a token signed with a different key")
	}
}

func TestValidateToken_RejectsExpired(t *testing.T) {
	cfg := &JWTConfig{SecretKey: []byte("test"), TTL: -time.Second}
	tok, err := cfg.IssueToken("user-1", "alice", "admin", nil, nil)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	if _, err := cfg.ValidateToken(tok); err == nil {
		t.Error("ValidateToken accepted an already-expired token")
	}
}

func TestValidateToken_RejectsGarbage(t *testing.T) {
	cfg := newTestConfig()
	for _, in := range []string{"", "not-a-jwt", "a.b.c", strings.Repeat("x", 200)} {
		if _, err := cfg.ValidateToken(in); err == nil {
			t.Errorf("ValidateToken(%q) accepted garbage input", in)
		}
	}
}
