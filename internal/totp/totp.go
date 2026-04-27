// Package totp wraps github.com/pquerna/otp/totp with the project's
// settings: 6-digit codes, 30-second period, SHA-1 (the only digest
// supported across the major authenticator apps in 2026), and a
// ±1-period skew window so a code typed near the boundary still works.
//
// The shared secret is base32 encoded for the otpauth:// URI that
// authenticator apps consume; we store the same string encrypted at
// rest via internal/crypto.
package totp

import (
	"crypto/rand"
	"encoding/base32"
	"fmt"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

// Issuer is the label that shows up next to the account name in the
// user's authenticator app (e.g. "TLSentinel: alice@example.com").
const Issuer = "TLSentinel"

// secretBytes is the size of the random shared secret. 20 bytes (160
// bits) is the RFC 4226 recommendation and matches what every major
// authenticator app expects.
const secretBytes = 20

// Setup is the data returned to the user when they begin TOTP enrollment.
// The secret is rendered as both an otpauth:// URI (scannable QR) and a
// raw base32 string (manual entry fallback). Neither value should be
// persisted as plaintext past the immediate response.
type Setup struct {
	Secret string // base32, no padding — the string the app stores
	URI    string // otpauth://totp/<issuer>:<account>?secret=...&issuer=...
}

// Generate produces a new random shared secret + matching otpauth URI for
// the given account label (typically the username). The secret is not
// persisted by this package — callers encrypt it and store it themselves.
func Generate(accountName string) (Setup, error) {
	buf := make([]byte, secretBytes)
	if _, err := rand.Read(buf); err != nil {
		return Setup{}, fmt.Errorf("totp: read random secret: %w", err)
	}
	// otpauth URIs use base32 without padding; pquerna/otp accepts the
	// same when validating, so we settle on no-padding everywhere.
	secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf)

	key, err := otp.NewKeyFromURL(fmt.Sprintf(
		"otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
		Issuer, accountName, secret, Issuer,
	))
	if err != nil {
		return Setup{}, fmt.Errorf("totp: build otpauth uri: %w", err)
	}
	return Setup{Secret: secret, URI: key.URL()}, nil
}

// Validate returns true iff code is a currently-valid 6-digit TOTP for
// secret. A ±1-period skew is permitted (so a code typed up to ~30s
// before or after rotation still works) — this matches the default in
// virtually every TOTP implementation.
func Validate(secret, code string) bool {
	ok, _ := totp.ValidateCustom(code, secret, nowUTC(), totp.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	return ok
}
