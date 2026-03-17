package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
)

// Authenticate is Chi middleware that validates bearer tokens.
// It handles both JWTs (users) and scanner tokens (prefixed with tlsentinel_).
// Returns 401 immediately on failure.
func Authenticate(store *db.Store, cfg *JWTConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := extractBearerToken(r)
			if raw == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			var identity Identity
			var err error

			if IsScannerToken(raw) {
				identity, err = verifyScannerToken(r.Context(), store, raw)
			} else {
				identity, err = verifyJWT(cfg, raw)
			}

			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r.WithContext(SetIdentity(r.Context(), identity)))
		})
	}
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}

func verifyJWT(cfg *JWTConfig, raw string) (Identity, error) {
	claims, err := cfg.ValidateToken(raw)
	if err != nil {
		return Identity{}, err
	}
	return Identity{
		Kind:     KindUser,
		UserID:   claims.UserID,
		Username: claims.Username,
		Role:     claims.Role,
	}, nil
}

func verifyScannerToken(ctx context.Context, store *db.Store, raw string) (Identity, error) {
	tokens, err := store.GetAllScannerTokenHashes(ctx)
	if err != nil {
		return Identity{}, fmt.Errorf("failed to load scanner tokens: %w", err)
	}
	for _, t := range tokens {
		if CheckScannerToken(raw, t.TokenHash) {
			// Best-effort: update last_used_at; ignore error to not fail the request.
			_ = store.TouchScannerToken(ctx, t.ID)
			return Identity{
				Kind:      KindScanner,
				ScannerID: t.ID,
			}, nil
		}
	}
	return Identity{}, fmt.Errorf("no matching scanner token")
}
