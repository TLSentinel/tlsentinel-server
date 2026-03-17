package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const agentTokenPrefix = "scanner_"

// GenerateScannerToken creates a new opaque scanner token.
// Returns the raw token (shown to the user once) and its bcrypt hash (stored in DB).
func GenerateScannerToken() (raw string, hash string, err error) {
	b := make([]byte, 32) // 32 bytes = 64 hex chars
	if _, err = rand.Read(b); err != nil {
		return "", "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	raw = agentTokenPrefix + hex.EncodeToString(b)
	hashed, err := bcrypt.GenerateFromPassword([]byte(raw), bcrypt.DefaultCost)
	if err != nil {
		return "", "", fmt.Errorf("failed to hash token: %w", err)
	}
	return raw, string(hashed), nil
}

// IsScannerToken returns true if the token has the scanner token prefix.
func IsScannerToken(token string) bool {
	return strings.HasPrefix(token, agentTokenPrefix)
}

// CheckScannerToken compares a raw token against a bcrypt hash.
func CheckScannerToken(raw, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(raw)) == nil
}
