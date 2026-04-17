package config

import (
	"encoding/base64"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
	"github.com/tlsentinel/tlsentinel-server/internal/jwt"
)

type Config struct {
	Host              string             `env:"TLSENTINEL_HOST" envDefault:"0.0.0.0"`
	Port              string             `env:"TLSENTINEL_PORT" envDefault:"8080"`
	DBHost            string             `env:"TLSENTINEL_DB_HOST" envDefault:"localhost"`
	DBPort            string             `env:"TLSENTINEL_DB_PORT" envDefault:"5432"`
	DBName            string             `env:"TLSENTINEL_DB_NAME" envDefault:"tlsentinel"`
	DBUsername        string             `env:"TLSENTINEL_DB_USERNAME,required"`
	DBPassword        string             `env:"TLSENTINEL_DB_PASSWORD,required"`
	DBSSLMode         string             `env:"TLSENTINEL_DB_SSLMODE" envDefault:"require"`
	JWTSecret         JWTSecret          `env:"TLSENTINEL_JWT_SECRET,required"`
	EncryptionKey     EncryptionKeyBytes `env:"TLSENTINEL_ENCRYPTION_KEY,required"`
	AdminUsername     string             `env:"TLSENTINEL_ADMIN_USERNAME"`
	AdminPassword     string             `env:"TLSENTINEL_ADMIN_PASSWORD"`
	OIDCClientID      string             `env:"TLSENTINEL_OIDC_CLIENT_ID"`
	OIDCClientSecret  string             `env:"TLSENTINEL_OIDC_CLIENT_SECRET"`
	OIDCRedirectURL   string             `env:"TLSENTINEL_OIDC_REDIRECT_URL"`
	OIDCIssuer        string             `env:"TLSENTINEL_OIDC_ISSUER"`
	OIDCScopes        []string           `env:"TLSENTINEL_OIDC_SCOPES" envDefault:"openid,profile,email"`
	OIDCUsernameClaim string             `env:"TLSENTINEL_OIDC_USERNAME_CLAIM"`
	// TrustedProxyCIDRs lists CIDRs whose traffic is allowed to set
	// X-Forwarded-For. Empty means no proxies are trusted and XFF is
	// ignored (audit IP falls back to the TCP peer).
	TrustedProxyCIDRs []string `env:"TLSENTINEL_TRUSTED_PROXY_CIDRS" envSeparator:","`
}

type JWTSecret []byte

func (s *JWTSecret) UnmarshalText(text []byte) error {
	decoded, err := base64.StdEncoding.DecodeString(string(text))
	if err != nil {
		return fmt.Errorf("TLSENTINEL_JWT_SECRET not valid base64: %w", err)
	}
	if len(decoded) < 32 {
		return fmt.Errorf("TLSENTINEL_JWT_SECRET must decode to >=32 bytes (got %d)", len(decoded))
	}
	*s = decoded
	return nil
}

func (s JWTSecret) Config() jwt.JWTConfig {
	return jwt.JWTConfig{
		SecretKey: []byte(s),
		TTL:       24 * time.Hour,
	}
}

type EncryptionKeyBytes []byte

func (k *EncryptionKeyBytes) UnmarshalText(text []byte) error {
	decoded, err := base64.StdEncoding.DecodeString(string(text))
	if err != nil {
		return fmt.Errorf("not valid base64: %w", err)
	}
	if len(decoded) != 32 {
		return fmt.Errorf("must decode to 32 bytes, got %d", len(decoded))
	}
	*k = decoded
	return nil
}

// Addr returns the combined host:port string for http.Server
func (c *Config) ListenAddr() string {
	return fmt.Sprintf("%s:%s", c.Host, c.Port)
}

func (cfg *Config) DBConnString() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		cfg.DBUsername, cfg.DBPassword,
		cfg.DBHost, cfg.DBPort,
		cfg.DBName, cfg.DBSSLMode,
	)
}

func (cfg *Config) OIDCEnabled() bool {
	// OIDCEnabled — derived, not a direct env var
	return cfg.OIDCClientID != "" &&
		cfg.OIDCClientSecret != "" &&
		cfg.OIDCRedirectURL != "" &&
		cfg.OIDCIssuer != ""
}

func LoadConfig() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// ParseTrustedProxies converts the configured CIDR strings into parsed
// networks. Returns an error naming the offending entry if any string is
// not a valid CIDR. A bare IP (no "/") is accepted and promoted to a /32
// or /128.
func (cfg *Config) ParseTrustedProxies() ([]*net.IPNet, error) {
	nets := make([]*net.IPNet, 0, len(cfg.TrustedProxyCIDRs))
	for _, raw := range cfg.TrustedProxyCIDRs {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if !strings.Contains(raw, "/") {
			ip := net.ParseIP(raw)
			if ip == nil {
				return nil, fmt.Errorf("TLSENTINEL_TRUSTED_PROXY_CIDRS: %q is not a valid IP or CIDR", raw)
			}
			if ip.To4() != nil {
				raw += "/32"
			} else {
				raw += "/128"
			}
		}
		_, ipnet, err := net.ParseCIDR(raw)
		if err != nil {
			return nil, fmt.Errorf("TLSENTINEL_TRUSTED_PROXY_CIDRS: %q: %w", raw, err)
		}
		nets = append(nets, ipnet)
	}
	return nets, nil
}
