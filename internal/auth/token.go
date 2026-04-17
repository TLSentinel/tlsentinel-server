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
// Returns the raw token (shown once), its SHA-256 hash (stored in DB),
// and the display prefix (first 12 chars of the raw token).
func GenerateAPIKey() (raw string, hash string, prefix string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", "", fmt.Errorf("generate api key: %w", err)
	}
	raw = APIKeyPrefix + hex.EncodeToString(b)
	hash = db.HashAPIKey(raw)
	prefix = raw[:12] // "stx_p_" (6) + first 6 hex chars
	return raw, hash, prefix, nil
}

// IsAPIKey returns true if the token has the API key prefix.
func IsAPIKey(token string) bool {
	return strings.HasPrefix(token, APIKeyPrefix)
}
