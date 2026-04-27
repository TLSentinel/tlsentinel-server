package totp

import (
	"crypto/rand"
	"encoding/base32"
	"fmt"
	"strings"
)

// RecoveryCodeCount is the number of single-use codes generated when a
// user enrolls in TOTP or regenerates the set. Ten is the de-facto
// industry standard (GitHub, Google, GitLab all default to 10).
const RecoveryCodeCount = 10

// recoveryCodeBytes is the entropy per code. 10 bytes (80 bits) gives
// 16 base32 characters before formatting — well past brute-force
// territory once they're bcrypt-hashed at rest.
const recoveryCodeBytes = 10

// GenerateRecoveryCodes produces RecoveryCodeCount random codes formatted
// as XXXX-XXXX-XXXX-XXXX. The plaintext is meant to be displayed to the
// user once and then discarded — the server only ever stores the bcrypt
// hash. Returns the plaintext slice for display + storage hashing.
func GenerateRecoveryCodes() ([]string, error) {
	codes := make([]string, RecoveryCodeCount)
	for i := range codes {
		c, err := generateRecoveryCode()
		if err != nil {
			return nil, err
		}
		codes[i] = c
	}
	return codes, nil
}

// NormalizeRecoveryCode strips formatting (spaces, dashes) and uppercases
// the input so the user can type the code with or without dashes, in
// any case, and still match.
func NormalizeRecoveryCode(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, " ", "")
	return strings.ToUpper(s)
}

func generateRecoveryCode() (string, error) {
	buf := make([]byte, recoveryCodeBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("totp: read random recovery code: %w", err)
	}
	enc := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf)
	// Format as XXXX-XXXX-XXXX-XXXX for legibility on paper.
	var b strings.Builder
	for i, r := range enc {
		if i > 0 && i%4 == 0 {
			b.WriteByte('-')
		}
		b.WriteRune(r)
	}
	return b.String(), nil
}
