package users

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/config"
	"github.com/tlsentinel/tlsentinel-server/internal/crypto"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/provider"
	"github.com/tlsentinel/tlsentinel-server/internal/totp"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

// TOTPHandler owns the /me/totp subtree. It is split off from the main
// users.Handler so the encryption key dependency lives in one place
// instead of being threaded through every profile endpoint.
type TOTPHandler struct {
	store *db.Store
	enc   *crypto.Encryptor
}

func NewTOTPHandler(store *db.Store, cfg *config.Config) *TOTPHandler {
	return &TOTPHandler{store: store, enc: crypto.NewEncryptor(cfg.EncryptionKey)}
}

type totpStatusResponse struct {
	Enabled              bool `json:"enabled"`
	RemainingRecoveryCodes int `json:"remainingRecoveryCodes"`
}

type totpSetupResponse struct {
	Secret string `json:"secret"`
	URI    string `json:"uri"`
}

type totpVerifyRequest struct {
	Code string `json:"code"`
}

type totpVerifyResponse struct {
	RecoveryCodes []string `json:"recoveryCodes"`
}

type totpDisableRequest struct {
	Password string `json:"password"`
	Code     string `json:"code"` // either a current TOTP or a recovery code
}

// Status reports whether TOTP is enabled for the current user and how
// many recovery codes are still unused. Used by the account UI to
// decide whether to render "set up 2FA" or "disable / regenerate".
//
// @Summary      TOTP status
// @Tags         me,totp
// @Produce      json
// @Success      200  {object}  totpStatusResponse
// @Router       /me/totp [get]
func (h *TOTPHandler) Status(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.store.GetUserByID(r.Context(), identity.UserID)
	if err != nil {
		http.Error(w, "failed to load user", http.StatusInternalServerError)
		return
	}
	count := 0
	if user.TOTPEnabled {
		count, _ = h.store.CountUnusedUserTOTPRecoveryCodes(r.Context(), identity.UserID)
	}
	response.JSON(w, http.StatusOK, totpStatusResponse{
		Enabled:                user.TOTPEnabled,
		RemainingRecoveryCodes: count,
	})
}

// BeginSetup creates a fresh TOTP secret, encrypts and persists it
// against the user (with totp_enabled=FALSE), and returns the otpauth
// URI + raw base32 string for the authenticator app. The secret is
// only "armed" after the user proves possession by submitting a code
// to ConfirmSetup. Calling BeginSetup again before ConfirmSetup
// overwrites the in-flight secret — the previous QR is invalidated.
//
// Refused for OIDC accounts (their MFA is enforced at the IdP) and for
// any user who already has TOTP enabled (they must disable first to
// rotate the seed, which forces them to prove possession of the
// current factor).
//
// @Summary      Start TOTP enrollment
// @Tags         me,totp
// @Produce      json
// @Success      200  {object}  totpSetupResponse
// @Failure      400  {string}  string  "totp not available for this account"
// @Failure      409  {string}  string  "totp already enabled"
// @Router       /me/totp/setup [post]
func (h *TOTPHandler) BeginSetup(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.store.GetUserByID(r.Context(), identity.UserID)
	if err != nil {
		http.Error(w, "failed to load user", http.StatusInternalServerError)
		return
	}
	if user.Provider != provider.Local {
		http.Error(w, "totp is only available for local accounts; SSO users get MFA from their identity provider", http.StatusBadRequest)
		return
	}
	if user.TOTPEnabled {
		http.Error(w, "totp already enabled — disable first to re-enroll", http.StatusConflict)
		return
	}

	setup, err := totp.Generate(user.Username)
	if err != nil {
		http.Error(w, "failed to generate totp secret", http.StatusInternalServerError)
		return
	}
	encrypted, err := h.enc.Encrypt(setup.Secret)
	if err != nil {
		http.Error(w, "failed to encrypt totp secret", http.StatusInternalServerError)
		return
	}
	if err := h.store.StoreUserTOTPSecret(r.Context(), identity.UserID, encrypted); err != nil {
		http.Error(w, "failed to store totp secret", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, totpSetupResponse{Secret: setup.Secret, URI: setup.URI})
}

// ConfirmSetup completes enrollment: the user types a code from their
// authenticator, we validate it against the persisted (still-disabled)
// secret, flip totp_enabled to TRUE, and generate the recovery codes.
// The plaintext recovery codes are returned exactly once — the server
// only ever stores their bcrypt hashes after this response.
//
// @Summary      Confirm TOTP enrollment
// @Tags         me,totp
// @Accept       json
// @Produce      json
// @Param        request  body      totpVerifyRequest  true  "TOTP code"
// @Success      200      {object}  totpVerifyResponse
// @Failure      400      {string}  string  "invalid code"
// @Router       /me/totp/verify [post]
func (h *TOTPHandler) ConfirmSetup(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req totpVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		http.Error(w, "code is required", http.StatusBadRequest)
		return
	}

	secret, ok2 := h.loadSecret(w, r, identity.UserID)
	if !ok2 {
		return
	}
	if !totp.Validate(secret, req.Code) {
		auth.Log(r.Context(), h.store, r, audit.Entry{
			Action:       audit.TOTPVerifyFailed,
			ResourceType: "user",
			ResourceID:   identity.UserID,
			Label:        identity.Username,
			Details:      map[string]any{"phase": "enroll"},
		})
		http.Error(w, "invalid code", http.StatusBadRequest)
		return
	}

	codes, ok3 := h.rotateRecoveryCodes(w, r, identity.UserID)
	if !ok3 {
		return
	}
	if err := h.store.EnableUserTOTP(r.Context(), identity.UserID); err != nil {
		http.Error(w, "failed to enable totp", http.StatusInternalServerError)
		return
	}

	auth.Log(r.Context(), h.store, r, audit.Entry{
		Action:       audit.TOTPEnable,
		ResourceType: "user",
		ResourceID:   identity.UserID,
		Label:        identity.Username,
	})
	response.JSON(w, http.StatusOK, totpVerifyResponse{RecoveryCodes: codes})
}

// Disable turns off TOTP for the current user. Requires the account
// password AND a current TOTP code (or recovery code) to defeat a
// drive-by attacker who briefly has session access. Both proofs are
// belt-and-suspenders — losing either does not let an attacker silently
// drop the second factor.
//
// @Summary      Disable TOTP
// @Tags         me,totp
// @Accept       json
// @Param        request  body      totpDisableRequest  true  "Password + code"
// @Success      204
// @Failure      400  {string}  string  "totp not enabled"
// @Failure      401  {string}  string  "invalid password or code"
// @Router       /me/totp [delete]
func (h *TOTPHandler) Disable(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req totpDisableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Password == "" || req.Code == "" {
		http.Error(w, "password and code are required", http.StatusBadRequest)
		return
	}

	user, err := h.store.GetUserByID(r.Context(), identity.UserID)
	if err != nil {
		http.Error(w, "failed to load user", http.StatusInternalServerError)
		return
	}
	if !user.TOTPEnabled {
		http.Error(w, "totp is not enabled", http.StatusBadRequest)
		return
	}
	if user.PasswordHash == nil {
		http.Error(w, "password verification not available for this account", http.StatusBadRequest)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, "invalid password", http.StatusUnauthorized)
		return
	}

	secret, ok2 := h.loadSecret(w, r, identity.UserID)
	if !ok2 {
		return
	}
	if !totp.Validate(secret, req.Code) {
		// Allow a recovery code as the second proof too — losing the device is the
		// most common reason to disable, and forcing the user to log in via a
		// recovery code first just to come back here would be silly.
		if !h.consumeRecoveryCode(r, identity.UserID, req.Code) {
			auth.Log(r.Context(), h.store, r, audit.Entry{
				Action:       audit.TOTPVerifyFailed,
				ResourceType: "user",
				ResourceID:   identity.UserID,
				Label:        identity.Username,
				Details:      map[string]any{"phase": "disable"},
			})
			http.Error(w, "invalid code", http.StatusUnauthorized)
			return
		}
	}

	if err := h.store.DisableUserTOTP(r.Context(), identity.UserID); err != nil {
		http.Error(w, "failed to disable totp", http.StatusInternalServerError)
		return
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{
		Action:       audit.TOTPDisable,
		ResourceType: "user",
		ResourceID:   identity.UserID,
		Label:        identity.Username,
	})
	w.WriteHeader(http.StatusNoContent)
}

// RegenerateRecoveryCodes invalidates the existing set and issues a
// fresh batch. Requires a current TOTP code so a stolen session alone
// can't quietly mint a new set the attacker keeps.
//
// @Summary      Regenerate TOTP recovery codes
// @Tags         me,totp
// @Accept       json
// @Produce      json
// @Param        request  body      totpVerifyRequest  true  "TOTP code"
// @Success      200      {object}  totpVerifyResponse
// @Failure      400      {string}  string  "totp not enabled or invalid code"
// @Router       /me/totp/recovery-codes [post]
func (h *TOTPHandler) RegenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req totpVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		http.Error(w, "code is required", http.StatusBadRequest)
		return
	}
	user, err := h.store.GetUserByID(r.Context(), identity.UserID)
	if err != nil {
		http.Error(w, "failed to load user", http.StatusInternalServerError)
		return
	}
	if !user.TOTPEnabled {
		http.Error(w, "totp is not enabled", http.StatusBadRequest)
		return
	}
	secret, ok2 := h.loadSecret(w, r, identity.UserID)
	if !ok2 {
		return
	}
	if !totp.Validate(secret, req.Code) {
		auth.Log(r.Context(), h.store, r, audit.Entry{
			Action:       audit.TOTPVerifyFailed,
			ResourceType: "user",
			ResourceID:   identity.UserID,
			Label:        identity.Username,
			Details:      map[string]any{"phase": "regenerate"},
		})
		http.Error(w, "invalid code", http.StatusUnauthorized)
		return
	}

	codes, ok3 := h.rotateRecoveryCodes(w, r, identity.UserID)
	if !ok3 {
		return
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{
		Action:       audit.TOTPRecoveryRegenerate,
		ResourceType: "user",
		ResourceID:   identity.UserID,
		Label:        identity.Username,
	})
	response.JSON(w, http.StatusOK, totpVerifyResponse{RecoveryCodes: codes})
}

// loadSecret fetches the encrypted secret, decrypts it, and writes a
// 4xx/5xx response on failure. Returns ("", false) when the response
// has already been sent — callers must just return.
func (h *TOTPHandler) loadSecret(w http.ResponseWriter, r *http.Request, userID string) (string, bool) {
	encrypted, _, err := h.store.GetUserTOTPSecret(r.Context(), userID)
	if err != nil {
		http.Error(w, "failed to load totp secret", http.StatusInternalServerError)
		return "", false
	}
	if encrypted == nil {
		http.Error(w, "totp not initialized", http.StatusBadRequest)
		return "", false
	}
	secret, err := h.enc.Decrypt(*encrypted)
	if err != nil {
		http.Error(w, "failed to decrypt totp secret", http.StatusInternalServerError)
		return "", false
	}
	return secret, true
}

// rotateRecoveryCodes generates a fresh set, replaces the persisted
// hashes, and returns the plaintext slice for one-time display. On
// failure the response is already written and ok is false.
func (h *TOTPHandler) rotateRecoveryCodes(w http.ResponseWriter, r *http.Request, userID string) (codes []string, ok bool) {
	codes, err := totp.GenerateRecoveryCodes()
	if err != nil {
		http.Error(w, "failed to generate recovery codes", http.StatusInternalServerError)
		return nil, false
	}
	hashes := make([]string, len(codes))
	for i, c := range codes {
		// Hash the normalized form so the user can type with or without
		// dashes / case at redemption time and still match.
		hashed, err := bcrypt.GenerateFromPassword([]byte(totp.NormalizeRecoveryCode(c)), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, "failed to hash recovery codes", http.StatusInternalServerError)
			return nil, false
		}
		hashes[i] = string(hashed)
	}
	if err := h.store.ReplaceUserTOTPRecoveryCodes(r.Context(), userID, hashes); err != nil {
		http.Error(w, "failed to store recovery codes", http.StatusInternalServerError)
		return nil, false
	}
	return codes, true
}

// AdminReset clears another user's TOTP enrollment — purges the secret
// and recovery codes and flips totp_enabled=false. Used when a user has
// lost their authenticator device AND their recovery codes; the admin
// verifies identity out-of-band (phone, in-person) and clears the
// second factor so the user can log in with password alone, then
// re-enroll from scratch.
//
// Gated by users:credentials, not users:edit, because this is an
// account-takeover-class operation. The audit entry carries
// reason=admin_reset so the trail clearly distinguishes "alice
// disabled her own 2FA" from "admin bob reset alice's 2FA".
//
// Refused on accounts that don't currently have TOTP enabled (nothing
// to clear). OIDC accounts can't have TOTP at all so they fail this
// check naturally.
//
// @Summary      Admin: reset a user's TOTP
// @Tags         users,totp
// @Param        userID  path  string  true  "Target user ID"
// @Success      204
// @Failure      400  {string}  string  "totp not enabled for this user"
// @Failure      404  {string}  string  "user not found"
// @Router       /users/{userID}/totp [delete]
func (h *TOTPHandler) AdminReset(w http.ResponseWriter, r *http.Request) {
	actor, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	targetID := chi.URLParam(r, "userID")
	if targetID == "" {
		http.Error(w, "user id is required", http.StatusBadRequest)
		return
	}

	target, err := h.store.GetUserByID(r.Context(), targetID)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if !target.TOTPEnabled {
		// No-op for users without TOTP — return 400 so the UI can
		// surface a clear "nothing to do" instead of pretending success.
		http.Error(w, "totp is not enabled for this user", http.StatusBadRequest)
		return
	}

	if err := h.store.DisableUserTOTP(r.Context(), target.ID); err != nil {
		http.Error(w, "failed to reset totp", http.StatusInternalServerError)
		return
	}

	auth.Log(r.Context(), h.store, r, audit.Entry{
		Action:       audit.TOTPDisable,
		ResourceType: "user",
		ResourceID:   target.ID,
		Label:        target.Username,
		Details: map[string]any{
			"reason":     "admin_reset",
			"actor_id":   actor.UserID,
			"actor_user": actor.Username,
		},
	})
	w.WriteHeader(http.StatusNoContent)
}

// consumeRecoveryCode checks the user-typed code against every unused
// recovery code on file. Returns true and stamps used_at on the first
// match. False means no match — the caller surfaces "invalid code" to
// the user.
//
// Walking the list is O(n) bcrypt comparisons (n=10), which is the only
// safe shape: bcrypt is one-way, so we cannot index by hash and look
// up a single row by the user's plaintext.
func (h *TOTPHandler) consumeRecoveryCode(r *http.Request, userID, code string) bool {
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
			auth.Log(r.Context(), h.store, r, audit.Entry{
				Action:       audit.TOTPRecoveryUsed,
				ResourceType: "user",
				ResourceID:   userID,
			})
			return true
		}
	}
	return false
}
