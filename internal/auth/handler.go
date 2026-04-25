package auth

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/jwt"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/provider"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

// dummyPasswordHash is a valid bcrypt hash of a random secret, used to keep
// the login timing side-channel closed when the submitted username does not
// exist. bcrypt.CompareHashAndPassword short-circuits on malformed hashes,
// so it is critical this value be a real hash generated at the same cost
// as real user passwords (bcrypt.DefaultCost) — otherwise "user not found"
// returns in microseconds while "bad password" takes ~100ms, letting an
// attacker enumerate valid usernames by response time.
//
// The plaintext does not matter; the hash is never compared against a known
// password. It is generated once at package load and kept in memory.
var dummyPasswordHash = func() []byte {
	h, err := bcrypt.GenerateFromPassword([]byte("dummy-never-compared"), bcrypt.DefaultCost)
	if err != nil {
		// Unreachable under any realistic condition — bcrypt only errors on
		// impossible inputs. Panic so the server refuses to start rather than
		// running with the timing side-channel wide open.
		panic(fmt.Sprintf("auth: failed to generate dummy bcrypt hash: %v", err))
	}
	return h
}()

type Handler struct {
	store        *db.Store
	jwtCfg       *jwt.JWTConfig
	oidcEnabled  bool
	providerHint string
}

func NewHandler(store *db.Store, cfg *config.Config) *Handler {
	jwtCfg := cfg.JWTSecret.Config()

	return &Handler{
		store:        store,
		jwtCfg:       &jwtCfg,
		oidcEnabled:  cfg.OIDCEnabled(),
		providerHint: providerHintFromIssuer(cfg.OIDCIssuer),
	}
}

func providerHintFromIssuer(issuer string) string {
	switch {
	case strings.Contains(issuer, "microsoftonline.com") || strings.Contains(issuer, "microsoft.com"):
		return "microsoft"
	case strings.Contains(issuer, "accounts.google.com"):
		return "google"
	case issuer != "":
		return "generic"
	default:
		return ""
	}
}

type authConfigResponse struct {
	OIDCEnabled  bool   `json:"oidcEnabled"`
	ProviderHint string `json:"providerHint,omitempty"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string `json:"token"`
}

// @Summary      Auth config
// @Description  Returns authentication capabilities. When OIDC is enabled, providerHint indicates the identity provider ("microsoft", "google", or "generic") so the frontend can render the appropriate sign-in button.
// @Tags         auth
// @Produce      json
// @Success      200  {object}  authConfigResponse
// @Router       /auth/config [get]
func (h *Handler) Config(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, authConfigResponse{
		OIDCEnabled:  h.oidcEnabled,
		ProviderHint: h.providerHint,
	})
}

// @Summary      Login
// @Description  Authenticates a user and returns a signed JWT bearer token
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      loginRequest   true  "Login credentials"
// @Success      200      {object}  loginResponse
// @Failure      400      {string}  string  "missing username or password"
// @Failure      401      {string}  string  "invalid credentials"
// @Failure      500      {string}  string  "internal server error"
// @Router       /auth/login [post]
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	// Trim whitespace once at the boundary; case is preserved (the username
	// column is CITEXT, so the lookup matches case-insensitively without
	// needing to lowercase the input here).
	username := models.NormalizeUsername(req.Username)
	if username == "" || req.Password == "" {
		http.Error(w, "username and password required", http.StatusBadRequest)
		return
	}

	ip := audit.IPFromRequest(r)

	user, err := h.store.GetUserByUsername(r.Context(), username)
	if err != nil {
		// Always do a full bcrypt comparison against a valid dummy hash so the
		// unknown-username path takes the same ~100ms as the wrong-password
		// path. See dummyPasswordHash for rationale.
		bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(req.Password)) //nolint:errcheck
		h.logAudit(r, db.AuditLog{Username: username, Action: audit.LoginFailed, IPAddress: &ip})
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if !user.Enabled {
		h.logAudit(r, db.AuditLog{Username: user.Username, Action: audit.LoginFailed, IPAddress: &ip})
		http.Error(w, "account disabled", http.StatusUnauthorized)
		return
	}

	if user.Provider != provider.Local {
		h.logAudit(r, db.AuditLog{Username: user.Username, Action: audit.LoginFailed, IPAddress: &ip})
		http.Error(w, "account requires SSO login", http.StatusUnauthorized)
		return
	}

	if user.PasswordHash == nil {
		h.logAudit(r, db.AuditLog{Username: user.Username, Action: audit.LoginFailed, IPAddress: &ip})
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		h.logAudit(r, db.AuditLog{Username: user.Username, Action: audit.LoginFailed, IPAddress: &ip})
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := h.jwtCfg.IssueToken(user.ID, user.Username, user.Role, user.FirstName, user.LastName)
	if err != nil {
		http.Error(w, "failed to issue token", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, db.AuditLog{UserID: &user.ID, Username: user.Username, Action: audit.Login, IPAddress: &ip})
	response.JSON(w, http.StatusOK, loginResponse{Token: token})
}

func (h *Handler) logAudit(r *http.Request, entry db.AuditLog) {
	if err := h.store.LogAuditEvent(r.Context(), entry); err != nil {
		slog.Error("audit log failed", "err", err)
	}
}
