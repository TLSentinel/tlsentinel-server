package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
)

// ScannerTokenPrefix is the prefix used for scanner tokens.
const ScannerTokenPrefix = "stx_s_"

// APIKeyPrefix is the prefix for all user API keys.
const APIKeyPrefix = "stx_p_"

// GenerateScannerToken creates a new opaque scanner token.
// Returns the raw token (shown to the user once) and its SHA-256 hash (stored in DB).
func GenerateScannerToken() (raw string, hash string, err error) {
	b := make([]byte, 32) // 32 bytes = 64 hex chars
	if _, err = rand.Read(b); err != nil {
		return "", "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	raw = ScannerTokenPrefix + hex.EncodeToString(b)
	return raw, db.HashAPIKey(raw), nil
}

// IsScannerToken returns true if the token has the scanner token prefix.
func IsScannerToken(token string) bool {
	return strings.HasPrefix(token, ScannerTokenPrefix)
}

// GenerateAPIKey creates a new user API key.
// The raw token layout is "stx_p_<id>_<secret>" where <id> is 8 hex chars of
// independent randomness used purely for display, and <secret> is 64 hex chars
// (32 bytes) of key material. The stored prefix contains only "<id>" bits, so
// a DB read leaks zero bits of the secret.
// Returns the raw token (shown once), its SHA-256 hash (stored in DB), and
// the display prefix (shown in UI lists).
func GenerateAPIKey() (raw string, hash string, prefix string, err error) {
	idBytes := make([]byte, 4)
	if _, err = rand.Read(idBytes); err != nil {
		return "", "", "", fmt.Errorf("generate api key id: %w", err)
	}
	secretBytes := make([]byte, 32)
	if _, err = rand.Read(secretBytes); err != nil {
		return "", "", "", fmt.Errorf("generate api key secret: %w", err)
	}
	id := hex.EncodeToString(idBytes)         // 8 hex chars
	secret := hex.EncodeToString(secretBytes) // 64 hex chars
	raw = APIKeyPrefix + id + "_" + secret
	hash = db.HashAPIKey(raw)
	prefix = APIKeyPrefix + id
	return raw, hash, prefix, nil
}

// IsAPIKey returns true if the token has the API key prefix.
func IsAPIKey(token string) bool {
	return strings.HasPrefix(token, APIKeyPrefix)
}
