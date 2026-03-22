package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/provider"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

type Handler struct {
	store        *db.Store
	jwtCfg       *JWTConfig
	oidcEnabled  bool
	providerHint string
}

func NewHandler(store *db.Store, cfg *config.Config, jwtCfg *JWTConfig) *Handler {
	return &Handler{
		store:        store,
		jwtCfg:       jwtCfg,
		oidcEnabled:  cfg.OIDCEnabled,
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
	if req.Username == "" || req.Password == "" {
		http.Error(w, "username and password required", http.StatusBadRequest)
		return
	}

	user, err := h.store.GetUserByUsername(r.Context(), req.Username)
	if err != nil {
		// Always do a bcrypt comparison to prevent timing-based username enumeration.
		bcrypt.CompareHashAndPassword([]byte("$2a$10$dummydummydummydummydummydummydummydummydummy"), []byte(req.Password)) //nolint:errcheck
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if !user.Enabled {
		http.Error(w, "account disabled", http.StatusUnauthorized)
		return
	}

	if user.Provider != provider.Local {
		http.Error(w, "account requires SSO login", http.StatusUnauthorized)
		return
	}

	if user.PasswordHash == nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := h.jwtCfg.IssueToken(user.ID, user.Username, user.Role, user.FirstName, user.LastName)
	if err != nil {
		http.Error(w, "failed to issue token", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, loginResponse{Token: token})
}
