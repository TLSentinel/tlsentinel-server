package jwt

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims is the JWT payload.
//
// Purpose distinguishes a fully-authenticated session token (purpose
// empty) from a short-lived "password verified, awaiting second
// factor" challenge token (purpose="totp_challenge"). Challenge tokens
// must NEVER be accepted by the API authentication middleware — only
// the /auth/totp completion endpoint reads them.
type Claims struct {
	UserID    string  `json:"uid"`
	Username  string  `json:"sub"`
	Role      string  `json:"role"`
	Purpose   string  `json:"purpose,omitempty"`
	FirstName *string `json:"given_name,omitempty"`
	LastName  *string `json:"family_name,omitempty"`
	jwt.RegisteredClaims
}

// PurposeTOTPChallenge is the Purpose value carried by the
// password-verified-but-not-yet-MFA-verified token issued mid-login.
const PurposeTOTPChallenge = "totp_challenge"

// challengeTTL bounds how long a user has to complete the second-factor
// step. Five minutes leaves room for QR scanning / app switching while
// keeping the challenge window short enough that a stolen browser
// memory dump is not useful for long.
const challengeTTL = 5 * time.Minute

// JWTConfig holds the signing key and token lifetime.
type JWTConfig struct {
	SecretKey []byte
	TTL       time.Duration
}

// IssueToken signs and returns a full-session JWT for the given user.
func (c *JWTConfig) IssueToken(userID, username, role string, firstName, lastName *string) (string, error) {
	return c.signToken(userID, username, role, "", firstName, lastName, c.TTL)
}

// IssueTOTPChallengeToken signs a short-lived challenge JWT used after
// password verification when the account requires a second factor. The
// returned token is rejected by the standard auth middleware and is
// only consumable by /auth/totp.
func (c *JWTConfig) IssueTOTPChallengeToken(userID, username, role string, firstName, lastName *string) (string, error) {
	return c.signToken(userID, username, role, PurposeTOTPChallenge, firstName, lastName, challengeTTL)
}

func (c *JWTConfig) signToken(userID, username, role, purpose string, firstName, lastName *string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Username:  username,
		Role:      role,
		Purpose:   purpose,
		FirstName: firstName,
		LastName:  lastName,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			Issuer:    "tlsentinel",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(c.SecretKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}
	return signed, nil
}

// ValidateToken parses and validates a JWT, returning the claims on success.
func (c *JWTConfig) ValidateToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return c.SecretKey, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}
