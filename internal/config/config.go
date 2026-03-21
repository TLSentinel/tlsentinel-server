package config

import (
	"encoding/base64"
	"fmt"
	"os"
)

type Config struct {
	Host              string
	Port              string
	DBConnString      string
	JWTSecret         string
	EncryptionKey     []byte
	AdminUsername     string
	AdminPassword     string
	OIDCClientID      string
	OIDCClientSecret  string
	OIDCRedirectURL   string
	OIDCIssuer        string
	OIDCScopes        string
	OIDCUsernameClaim string
	OIDCEnabled       bool
}

// Addr returns the combined host:port string for http.Server
func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%s", c.Host, c.Port)
}

// LoadConfig loads the configuration from environment variables.
func LoadConfig() (*Config, error) {
	cfg := &Config{}
	var err error

	cfg.Host = envOr("TLSENTINEL_HOST", "0.0.0.0")
	cfg.Port = envOr("TLSENTINEL_PORT", "8080")

	cfg.AdminUsername = os.Getenv("TLSENTINEL_ADMIN_USERNAME")
	cfg.AdminPassword = os.Getenv("TLSENTINEL_ADMIN_PASSWORD")

	cfg.EncryptionKey, err = loadEncryptionKey()
	if err != nil {
		return nil, fmt.Errorf("failed to load encryption key: %w", err)
	}

	if cfg.JWTSecret, err = getRequiredEnv("TLSENTINEL_JWT_SECRET"); err != nil {
		return nil, err
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("TLSENTINEL_JWT_SECRET must be at least 32 characters")
	}

	dbConnString, err := buildDBConnString()
	if err != nil {
		return nil, err
	}
	cfg.DBConnString = dbConnString

	cfg.OIDCClientID = os.Getenv("TLSENTINEL_OIDC_CLIENT_ID")
	cfg.OIDCClientSecret = os.Getenv("TLSENTINEL_OIDC_CLIENT_SECRET")
	cfg.OIDCRedirectURL = os.Getenv("TLSENTINEL_OIDC_REDIRECT_URL")
	cfg.OIDCIssuer = os.Getenv("TLSENTINEL_OIDC_ISSUER")
	cfg.OIDCScopes = os.Getenv("TLSENTINEL_OIDC_SCOPES")
	cfg.OIDCUsernameClaim = os.Getenv("TLSENTINEL_OIDC_USERNAME_CLAIM")
	cfg.OIDCEnabled =
		cfg.OIDCClientID != "" &&
			cfg.OIDCClientSecret != "" &&
			cfg.OIDCRedirectURL != "" &&
			cfg.OIDCIssuer != ""

	return cfg, nil
}

func envOr(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getRequiredEnv(key string) (string, error) {
	value, ok := os.LookupEnv(key)
	if !ok {
		return "", fmt.Errorf("missing required environment variable: %s", key)
	}
	return value, nil
}

func loadEncryptionKey() ([]byte, error) {
	val := os.Getenv("TLSENTINEL_ENCRYPTION_KEY")
	if val == "" {
		return nil, fmt.Errorf("TLSENTINEL_ENCRYPTION_KEY is not set")
	}

	key, err := base64.StdEncoding.DecodeString(val)
	if err != nil {
		return nil, fmt.Errorf("not valid base64: %w", err)
	}

	if len(key) != 32 {
		return nil, fmt.Errorf("must decode to 32 bytes, got %d", len(key))
	}

	return key, nil
}

func buildDBConnString() (string, error) {
	if url := os.Getenv("TLSENTINEL_DATABASE_URL"); url != "" {
		return url, nil
	}

	// Required fields
	required := map[string]string{
		"TLSENTINEL_DB_HOST":     os.Getenv("TLSENTINEL_DB_HOST"),
		"TLSENTINEL_DB_USERNAME": os.Getenv("TLSENTINEL_DB_USERNAME"),
		"TLSENTINEL_DB_PASSWORD": os.Getenv("TLSENTINEL_DB_PASSWORD"),
		"TLSENTINEL_DB_NAME":     os.Getenv("TLSENTINEL_DB_NAME"),
	}

	for key, val := range required {
		if val == "" {
			return "", fmt.Errorf("missing environment variable: %s", key)
		}
	}

	// Optional fields with defaults
	port := envOr("TLSENTINEL_DB_PORT", "5432")
	sslmode := envOr("TLSENTINEL_DB_SSLMODE", "require")

	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		required["TLSENTINEL_DB_USERNAME"],
		required["TLSENTINEL_DB_PASSWORD"],
		required["TLSENTINEL_DB_HOST"],
		port,
		required["TLSENTINEL_DB_NAME"],
		sslmode,
	), nil
}
