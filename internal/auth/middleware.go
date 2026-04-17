package auth

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/jwt"
	"github.com/tlsentinel/tlsentinel-server/internal/permission"
)


// Authenticate is Chi middleware that validates bearer tokens.
// It handles JWTs (users), scanner tokens (stx_s_ prefix), and API keys (stx_p_ prefix).
// Returns 401 immediately on failure.
func Authenticate(store *db.Store, cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := extractBearerToken(r)
			if raw == "" {
				logAuthFailure(r, "missing_bearer", "")
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			var identity Identity
			var err error
			var tokenKind string

			switch {
			case IsScannerToken(raw):
				tokenKind = "scanner"
				identity, err = verifyScannerToken(r.Context(), store, raw)
			case IsAPIKey(raw):
				tokenKind = "api_key"
				identity, err = verifyAPIKey(r.Context(), store, raw)
			default:
				tokenKind = "jwt"
				jwtCfg := cfg.JWTSecret.Config()
				identity, err = verifyJWT(&jwtCfg, raw)
			}

			if err != nil {
				logAuthFailure(r, "invalid_"+tokenKind, err.Error())
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r.WithContext(SetIdentity(r.Context(), identity)))
		})
	}
}

// RequireRole returns middleware that allows only users whose role is in the
// provided list. Must be used inside an Authenticate-protected group.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := GetIdentity(r.Context())
			if !ok || id.Kind != KindUser {
				logPermissionFailure(r, id, "non_user_identity", "")
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			if _, permitted := allowed[id.Role]; !permitted {
				logPermissionFailure(r, id, "role_not_allowed", "")
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequirePermission returns middleware that allows only users whose role grants
// the specified permission. Must be used inside an Authenticate-protected group.
func RequirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := GetIdentity(r.Context())
			if !ok || id.Kind != KindUser {
				logPermissionFailure(r, id, "non_user_identity", perm)
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			if !permission.Has(id.Role, perm) {
				logPermissionFailure(r, id, "permission_denied", perm)
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// logAuthFailure emits a structured warning for 401 responses from
// Authenticate. Reason is a short machine-readable token; detail is the
// underlying error string when available (never the raw bearer token).
func logAuthFailure(r *http.Request, reason, detail string) {
	slog.Warn("auth failed",
		"reason", reason,
		"method", r.Method,
		"path", r.URL.Path,
		"remote_addr", r.RemoteAddr,
		"detail", detail,
	)
}

// logPermissionFailure emits a structured warning for 403 responses from
// RequireRole / RequirePermission. Includes the authenticated identity so
// oncall can tell "unknown caller" from "legitimate user hitting the wrong
// endpoint".
func logPermissionFailure(r *http.Request, id Identity, reason, permName string) {
	slog.Warn("permission denied",
		"reason", reason,
		"method", r.Method,
		"path", r.URL.Path,
		"remote_addr", r.RemoteAddr,
		"user_id", id.UserID,
		"username", id.Username,
		"role", id.Role,
		"permission", permName,
	)
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}

func verifyJWT(cfg *jwt.JWTConfig, raw string) (Identity, error) {
	claims, err := cfg.ValidateToken(raw)
	if err != nil {
		return Identity{}, err
	}
	return Identity{
		Kind:      KindUser,
		UserID:    claims.UserID,
		Username:  claims.Username,
		Role:      claims.Role,
		FirstName: claims.FirstName,
		LastName:  claims.LastName,
	}, nil
}

func verifyAPIKey(ctx context.Context, store *db.Store, raw string) (Identity, error) {
	hash := db.HashAPIKey(raw)
	key, err := store.GetAPIKeyByHash(ctx, hash)
	if err != nil {
		return Identity{}, fmt.Errorf("invalid api key")
	}
	user, err := store.GetUserByID(ctx, key.UserID)
	if err != nil {
		return Identity{}, fmt.Errorf("api key user not found")
	}
	if !user.Enabled {
		return Identity{}, fmt.Errorf("user account disabled")
	}
	return Identity{
		Kind:      KindUser,
		UserID:    user.ID,
		Username:  user.Username,
		Role:      user.Role,
		FirstName: user.FirstName,
		LastName:  user.LastName,
	}, nil
}

func verifyScannerToken(ctx context.Context, store *db.Store, raw string) (Identity, error) {
	t, err := store.GetScannerTokenByHash(ctx, db.HashAPIKey(raw))
	if err != nil {
		return Identity{}, fmt.Errorf("invalid scanner token")
	}
	_ = store.TouchScannerToken(ctx, t.ID)
	return Identity{Kind: KindScanner, ScannerID: t.ID}, nil
}
