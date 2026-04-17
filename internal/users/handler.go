package users

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"

	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/permission"
	"github.com/tlsentinel/tlsentinel-server/internal/provider"
	"github.com/tlsentinel/tlsentinel-server/pkg/pagination"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"

	"github.com/go-chi/chi/v5"
)

// validateEmailPtr returns nil for a nil or empty-string pointer; otherwise
// it parses the value with net/mail and rejects anything that isn't a valid
// RFC 5322 address. This also rejects embedded CR/LF that would enable SMTP
// header injection downstream in the alert pipeline.
func validateEmailPtr(e *string) error {
	if e == nil || *e == "" {
		return nil
	}
	if _, err := mail.ParseAddress(*e); err != nil {
		return err
	}
	return nil
}

var validRoles = map[string]bool{permission.RoleAdmin: true, permission.RoleOperator: true, permission.RoleViewer: true}
var validProviders = map[string]bool{provider.Local: true, provider.OIDC: true}

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

type CreateUserRequest struct {
	Username  string  `json:"username"`
	Password  string  `json:"password"`
	Role      string  `json:"role"`     // "admin", "operator", or "viewer"; defaults to "viewer"
	Provider  string  `json:"provider"` // "local" or "oidc"; defaults to "local"
	Notify    bool    `json:"notify"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     *string `json:"email"`
}

type UpdateUserRequest struct {
	Username  string  `json:"username"`
	Role      string  `json:"role"`
	Provider  string  `json:"provider"` // "local" or "oidc"
	Notify    bool    `json:"notify"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     *string `json:"email"`
}

type SetEnabledRequest struct {
	Enabled bool `json:"enabled"`
}

type ChangePasswordRequest struct {
	Password string `json:"password"`
}

type UpdateMeRequest struct {
	Notify    bool    `json:"notify"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     *string `json:"email"`
}

type ChangeMyPasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// @Summary      Get current user
// @Description  Returns the profile of the authenticated user
// @Tags         me
// @Produce      json
// @Success      200  {object}  models.UserResponse
// @Failure      401  {string}  string  "unauthorized"
// @Failure      404  {string}  string  "user not found"
// @Router       /me [get]
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.store.GetUserByID(r.Context(), identity.UserID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get user", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, user.ToResponse())
}

// @Summary      Update current user
// @Description  Updates the authenticated user's name, email, and notification preference
// @Tags         me
// @Accept       json
// @Produce      json
// @Param        request  body      UpdateMeRequest  true  "Profile payload"
// @Success      200      {object}  models.UserResponse
// @Failure      400      {string}  string  "invalid request"
// @Failure      401      {string}  string  "unauthorized"
// @Failure      404      {string}  string  "user not found"
// @Router       /me [put]
func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	current, err := h.store.GetUserByID(r.Context(), identity.UserID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get user", http.StatusInternalServerError)
		return
	}

	var req UpdateMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := validateEmailPtr(req.Email); err != nil {
		http.Error(w, "invalid email address", http.StatusBadRequest)
		return
	}

	// Role, username, and provider are not self-serviceable.
	user, err := h.store.UpdateUser(r.Context(), identity.UserID, current.Username, current.Role, current.Provider, req.Notify, req.FirstName, req.LastName, req.Email)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update profile", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, user.ToResponse())
}

// @Summary      Change current user's password
// @Description  Changes the authenticated user's password. Requires the current password for verification.
// @Tags         me
// @Accept       json
// @Param        request  body  ChangeMyPasswordRequest  true  "Password payload"
// @Success      204
// @Failure      400  {string}  string  "invalid request"
// @Failure      401  {string}  string  "unauthorized or wrong current password"
// @Failure      404  {string}  string  "user not found"
// @Router       /me/password [patch]
func (h *Handler) ChangeMyPassword(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req ChangeMyPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		http.Error(w, "currentPassword and newPassword are required", http.StatusBadRequest)
		return
	}

	user, err := h.store.GetUserByID(r.Context(), identity.UserID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get user", http.StatusInternalServerError)
		return
	}

	if user.PasswordHash == nil {
		http.Error(w, "password change not supported for this account", http.StatusBadRequest)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		http.Error(w, "current password is incorrect", http.StatusUnauthorized)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "failed to process password", http.StatusInternalServerError)
		return
	}

	if err := h.store.UpdateUserPassword(r.Context(), identity.UserID, string(hash)); err != nil {
		http.Error(w, "failed to update password", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.MyPasswordChange, "user", identity.UserID)
	w.WriteHeader(http.StatusNoContent)
}

// SetSubscriptionsRequest is the payload for replacing a user's tag subscriptions.
type SetSubscriptionsRequest struct {
	TagIDs []string `json:"tagIds"`
}

// @Summary      Get notification tag subscriptions
// @Description  Returns the current user's tag notification subscriptions
// @Tags         me
// @Produce      json
// @Success      200  {array}   models.TagWithCategory
// @Failure      401  {string}  string  "unauthorized"
// @Router       /me/tag-subscriptions [get]
func (h *Handler) GetMySubscriptions(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	subs, err := h.store.GetUserTagSubscriptions(r.Context(), identity.UserID)
	if err != nil {
		http.Error(w, "failed to get subscriptions", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, subs)
}

// @Summary      Set notification tag subscriptions
// @Description  Replaces the current user's tag notification subscriptions. Send an empty tagIds array to clear all subscriptions (reverts to notify-all).
// @Tags         me
// @Accept       json
// @Produce      json
// @Param        request  body      SetSubscriptionsRequest  true  "Tag IDs"
// @Success      200      {array}   models.TagWithCategory
// @Failure      400      {string}  string  "invalid request"
// @Failure      401      {string}  string  "unauthorized"
// @Router       /me/tag-subscriptions [put]
func (h *Handler) SetMySubscriptions(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req SetSubscriptionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TagIDs == nil {
		req.TagIDs = []string{}
	}
	if err := h.store.SetUserTagSubscriptions(r.Context(), identity.UserID, req.TagIDs); err != nil {
		http.Error(w, "failed to set subscriptions", http.StatusInternalServerError)
		return
	}
	subs, err := h.store.GetUserTagSubscriptions(r.Context(), identity.UserID)
	if err != nil {
		http.Error(w, "failed to get updated subscriptions", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, subs)
}

// RotateCalendarToken generates a new calendar token for the authenticated user.
func (h *Handler) RotateCalendarToken(w http.ResponseWriter, r *http.Request) {
	identity, ok := auth.GetIdentity(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	token, err := h.store.RotateCalendarToken(r.Context(), identity.UserID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to rotate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"calendarToken": token})
}

// @Summary      List users
// @Description  Returns a paginated list of users with optional search, role, provider, and sort filters
// @Tags         users
// @Produce      json
// @Param        page       query  int     false  "Page number (default 1)"
// @Param        page_size  query  int     false  "Page size (default 20, max 100)"
// @Param        search     query  string  false  "Search username, first name, or last name (partial match)"
// @Param        role       query  string  false  "Filter by role: admin, operator, viewer"
// @Param        provider   query  string  false  "Filter by provider: local, oidc"
// @Param        sort       query  string  false  "Sort order: \"\" (newest first, default), username, name"
// @Success      200  {object}  models.UserList
// @Failure      500  {string}  string  "internal server error"
// @Router       /users [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pagination.Parse(r, 20, 100)

	search := r.URL.Query().Get("search")
	role := r.URL.Query().Get("role")
	provider := r.URL.Query().Get("provider")
	sort := r.URL.Query().Get("sort")

	result, err := h.store.ListUsers(r.Context(), page, pageSize, search, role, provider, sort)
	if err != nil {
		http.Error(w, "failed to list users", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, result)
}

// @Summary      Create a user
// @Description  Creates a new user. Provider "local" requires a password; "oidc" users authenticate via SSO only.
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        request  body      CreateUserRequest  true  "User payload"
// @Success      201      {object}  models.UserResponse
// @Failure      400      {string}  string  "invalid request"
// @Failure      500      {string}  string  "internal server error"
// @Router       /users [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = permission.RoleViewer
	}
	if !validRoles[req.Role] {
		http.Error(w, "role must be 'admin', 'operator', or 'viewer'", http.StatusBadRequest)
		return
	}
	if req.Provider == "" {
		req.Provider = provider.Local
	}
	if !validProviders[req.Provider] {
		http.Error(w, "provider must be 'local' or 'oidc'", http.StatusBadRequest)
		return
	}
	if req.Provider == provider.Local && req.Password == "" {
		http.Error(w, "password is required for local users", http.StatusBadRequest)
		return
	}
	if err := validateEmailPtr(req.Email); err != nil {
		http.Error(w, "invalid email address", http.StatusBadRequest)
		return
	}

	var passwordHash string
	if req.Provider == provider.Local {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, "failed to process password", http.StatusInternalServerError)
			return
		}
		passwordHash = string(hash)
	}

	user, err := h.store.InsertUser(r.Context(), req.Username, passwordHash, req.Role, req.Provider, req.Notify, req.FirstName, req.LastName, req.Email)
	if err != nil {
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.UserCreate, "user", user.ID)
	response.JSON(w, http.StatusCreated, user.ToResponse())
}

// @Summary      Get a user
// @Description  Returns a user by ID
// @Tags         users
// @Produce      json
// @Param        userID  path      string  true  "User ID"
// @Success      200     {object}  models.UserResponse
// @Failure      404     {string}  string  "user not found"
// @Failure      500     {string}  string  "internal server error"
// @Router       /users/{userID} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	user, err := h.store.GetUserByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get user", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, user.ToResponse())
}

// @Summary      Update a user
// @Description  Updates username, role, provider, and profile fields. Switching to "oidc" clears the password hash.
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        userID   path      string             true  "User ID"
// @Param        request  body      UpdateUserRequest  true  "User payload"
// @Success      200      {object}  models.UserResponse
// @Failure      400      {string}  string  "invalid request"
// @Failure      404      {string}  string  "user not found"
// @Failure      500      {string}  string  "internal server error"
// @Router       /users/{userID} [put]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	if req.Role == "" || !validRoles[req.Role] {
		http.Error(w, "role must be 'admin', 'operator', or 'viewer'", http.StatusBadRequest)
		return
	}
	if req.Provider == "" {
		req.Provider = provider.Local
	}
	if !validProviders[req.Provider] {
		http.Error(w, "provider must be 'local' or 'oidc'", http.StatusBadRequest)
		return
	}
	if err := validateEmailPtr(req.Email); err != nil {
		http.Error(w, "invalid email address", http.StatusBadRequest)
		return
	}

	user, err := h.store.UpdateUser(r.Context(), userID, req.Username, req.Role, req.Provider, req.Notify, req.FirstName, req.LastName, req.Email)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update user", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.UserUpdate, "user", userID)
	response.JSON(w, http.StatusOK, user.ToResponse())
}

// @Summary      Set user enabled
// @Description  Enables or disables a user account. An admin cannot disable their own account.
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        userID   path  string            true  "User ID"
// @Param        request  body  SetEnabledRequest true  "Enabled payload"
// @Success      200      {object}  models.UserResponse
// @Failure      400      {string}  string  "invalid request"
// @Failure      404      {string}  string  "user not found"
// @Failure      409      {string}  string  "cannot disable your own account"
// @Failure      500      {string}  string  "internal server error"
// @Router       /users/{userID}/enabled [patch]
func (h *Handler) SetEnabled(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	var req SetEnabledRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Prevent self-disable.
	if !req.Enabled {
		if identity, ok := auth.GetIdentity(r.Context()); ok {
			if identity.UserID == userID {
				http.Error(w, "cannot disable your own account", http.StatusConflict)
				return
			}
		}
	}

	user, err := h.store.SetUserEnabled(r.Context(), userID, req.Enabled)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update user", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.UserEnabledChange, "user", userID)
	response.JSON(w, http.StatusOK, user.ToResponse())
}

// @Summary      Change password
// @Description  Replaces a user's password. Only valid for local-provider users.
// @Tags         users
// @Accept       json
// @Param        userID   path  string                true  "User ID"
// @Param        request  body  ChangePasswordRequest true  "Password payload"
// @Success      204
// @Failure      400  {string}  string  "invalid request"
// @Failure      404  {string}  string  "user not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /users/{userID}/password [patch]
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		http.Error(w, "password is required", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "failed to process password", http.StatusInternalServerError)
		return
	}

	if err := h.store.UpdateUserPassword(r.Context(), userID, string(hash)); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update password", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.UserPasswordChange, "user", userID)
	w.WriteHeader(http.StatusNoContent)
}

// @Summary      Delete a user
// @Description  Deletes a user. Refused if it would remove the last admin.
// @Tags         users
// @Param        userID  path  string  true  "User ID"
// @Success      204
// @Failure      404  {string}  string  "user not found"
// @Failure      409  {string}  string  "cannot delete the last admin user"
// @Failure      500  {string}  string  "internal server error"
// @Router       /users/{userID} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	// Prevent deleting yourself.
	if identity, ok := auth.GetIdentity(r.Context()); ok {
		if identity.UserID == userID {
			http.Error(w, "cannot delete your own account", http.StatusConflict)
			return
		}
	}

	// Prevent removing the last admin.
	target, err := h.store.GetUserByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get user", http.StatusInternalServerError)
		return
	}
	if target.Role == permission.RoleAdmin {
		count, err := h.store.CountAdminUsers(r.Context())
		if err != nil {
			http.Error(w, "failed to verify admin count", http.StatusInternalServerError)
			return
		}
		if count <= 1 {
			http.Error(w, "cannot delete the last admin user", http.StatusConflict)
			return
		}
	}

	if err := h.store.DeleteUser(r.Context(), userID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to delete user", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.UserDelete, "user", userID)
	w.WriteHeader(http.StatusNoContent)
}
