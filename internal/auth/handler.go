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
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/jwt"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/provider"
	"github.com/tlsentinel/tlsentinel-server/internal/totp"
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
	enc          *crypto.Encryptor
	oidcEnabled  bool
	providerHint string
}

func NewHandler(store *db.Store, cfg *config.Config) *Handler {
	jwtCfg := cfg.JWTSecret.Config()

	return &Handler{
		store:        store,
		jwtCfg:       &jwtCfg,
		enc:          crypto.NewEncryptor(cfg.EncryptionKey),
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

// loginResponse covers both legs of the login flow.
//
// First leg (POST /auth/login):
//   - User has no TOTP enabled  → Token is the full session JWT.
//   - User has TOTP enabled     → Token is empty, ChallengeToken is set,
//     and the client posts it with the user's TOTP code to /auth/totp.
//
// Returning a single shape keeps the frontend happy with one Login
// type and one branch on the response. The challenge-only response is
// shaped so an old client (one that doesn't know about TOTP) sees a
// missing token and surfaces an error instead of silently logging the
// user in — never the other way around.
type loginResponse struct {
	Token          string `json:"token,omitempty"`
	ChallengeToken string `json:"challengeToken,omitempty"`
	TOTPRequired   bool   `json:"totpRequired,omitempty"`
}

type totpLoginRequest struct {
	ChallengeToken string `json:"challengeToken"`
	Code           string `json:"code"`
	IsRecovery     bool   `json:"isRecovery,omitempty"`
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

	// If the user has TOTP armed, password alone does not log them in —
	// we hand back a short-lived challenge token and let the frontend
	// gather the second factor.
	if user.TOTPEnabled {
		challenge, err := h.jwtCfg.IssueTOTPChallengeToken(user.ID, user.Username, user.Role, user.FirstName, user.LastName)
		if err != nil {
			http.Error(w, "failed to issue challenge", http.StatusInternalServerError)
			return
		}
		// Don't audit "login" here yet — the user is not authenticated
		// until they complete the second factor. A fully observable
		// failure leg (TOTPVerifyFailed) covers the "password OK,
		// TOTP wrong" case from /auth/totp.
		response.JSON(w, http.StatusOK, loginResponse{ChallengeToken: challenge, TOTPRequired: true})
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

// @Summary      Complete TOTP login
// @Description  Exchanges a TOTP challenge token + 6-digit code (or recovery code) for a full session JWT. Issued only after a successful POST /auth/login on a TOTP-enabled local account.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        request  body      totpLoginRequest  true  "Challenge token + code"
// @Success      200      {object}  loginResponse
// @Failure      400      {string}  string  "missing challenge token or code"
// @Failure      401      {string}  string  "invalid or expired challenge"
// @Router       /auth/totp [post]
func (h *Handler) LoginTOTP(w http.ResponseWriter, r *http.Request) {
	var req totpLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.ChallengeToken == "" || req.Code == "" {
		http.Error(w, "challengeToken and code are required", http.StatusBadRequest)
		return
	}

	claims, err := h.jwtCfg.ValidateToken(req.ChallengeToken)
	if err != nil || claims.Purpose != jwt.PurposeTOTPChallenge {
		http.Error(w, "invalid or expired challenge", http.StatusUnauthorized)
		return
	}

	ip := audit.IPFromRequest(r)

	user, err := h.store.GetUserByID(r.Context(), claims.UserID)
	if err != nil || !user.Enabled || !user.TOTPEnabled {
		// Fall through to the same generic 401 the wrong-code path uses
		// so we don't leak whether a challenge corresponds to a still-
		// existent / TOTP-armed account.
		http.Error(w, "invalid or expired challenge", http.StatusUnauthorized)
		return
	}

	encrypted, _, err := h.store.GetUserTOTPSecret(r.Context(), user.ID)
	if err != nil || encrypted == nil {
		http.Error(w, "invalid or expired challenge", http.StatusUnauthorized)
		return
	}
	secret, err := h.enc.Decrypt(*encrypted)
	if err != nil {
		http.Error(w, "failed to decrypt totp secret", http.StatusInternalServerError)
		return
	}

	verified := false
	usedRecovery := false
	if req.IsRecovery {
		usedRecovery = h.consumeRecoveryCode(r, user.ID, req.Code)
		verified = usedRecovery
	} else {
		verified = totp.Validate(secret, req.Code)
	}

	if !verified {
		h.logAudit(r, db.AuditLog{
			UserID:    &user.ID,
			Username:  user.Username,
			Action:    audit.TOTPVerifyFailed,
			IPAddress: &ip,
		})
		http.Error(w, "invalid code", http.StatusUnauthorized)
		return
	}

	token, err := h.jwtCfg.IssueToken(user.ID, user.Username, user.Role, user.FirstName, user.LastName)
	if err != nil {
		http.Error(w, "failed to issue token", http.StatusInternalServerError)
		return
	}
	h.logAudit(r, db.AuditLog{UserID: &user.ID, Username: user.Username, Action: audit.Login, IPAddress: &ip})
	if usedRecovery {
		// Surface the recovery-redemption separately so an admin can
		// see "Alice signed in via recovery code" instead of just
		// "Alice signed in" — that pattern usually means the device
		// was lost and the user should re-enroll.
		h.logAudit(r, db.AuditLog{UserID: &user.ID, Username: user.Username, Action: audit.TOTPRecoveryUsed, IPAddress: &ip})
	}
	response.JSON(w, http.StatusOK, loginResponse{Token: token})
}

// consumeRecoveryCode walks the user's unused codes and stamps used_at
// on the first match. Returns true on a successful redemption.
func (h *Handler) consumeRecoveryCode(r *http.Request, userID, code string) bool {
	rows, err := h.store.ListUnusedUserTOTPRecoveryCodes(r.Context(), userID)
	if err != nil {
		return false
	}
	normalized := totp.NormalizeRecoveryCode(code)
	for _, row := range rows {
		if bcrypt.CompareHashAndPassword([]byte(row.CodeHash), []byte(normalized)) == nil {
			if err := h.store.MarkUserTOTPRecoveryCodeUsed(r.Context(), row.ID); err != nil {
				return false
			}
			return true
		}
	}
	return false
}

func (h *Handler) logAudit(r *http.Request, entry db.AuditLog) {
	if err := h.store.LogAuditEvent(r.Context(), entry); err != nil {
		slog.Error("audit log failed", "err", err)
	}
}
