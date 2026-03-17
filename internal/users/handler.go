package users

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"golang.org/x/crypto/bcrypt"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"

	"github.com/go-chi/chi/v5"
)

var validRoles = map[string]bool{"admin": true, "viewer": true}

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

type CreateUserRequest struct {
	Username  string  `json:"username"`
	Password  string  `json:"password"`
	Role      string  `json:"role"` // "admin" or "viewer"; defaults to "viewer"
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     *string `json:"email"`
}

type UpdateUserRequest struct {
	Username  string  `json:"username"`
	Role      string  `json:"role"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     *string `json:"email"`
}

type ChangePasswordRequest struct {
	Password string `json:"password"`
}

// @Summary      List users
// @Description  Returns a paginated list of users
// @Tags         users
// @Produce      json
// @Param        page       query  int  false  "Page number (default 1)"
// @Param        page_size  query  int  false  "Page size (default 20, max 100)"
// @Success      200  {object}  models.UserList
// @Failure      500  {string}  string  "internal server error"
// @Router       /users [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	pageSize, err := strconv.Atoi(r.URL.Query().Get("page_size"))
	if err != nil || pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	result, err := h.store.ListUsers(r.Context(), page, pageSize)
	if err != nil {
		http.Error(w, "failed to list users", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, result)
}

// @Summary      Create a user
// @Description  Creates a new local user
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

	if req.Username == "" || req.Password == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = "viewer"
	}
	if !validRoles[req.Role] {
		http.Error(w, "role must be 'admin' or 'viewer'", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "failed to process password", http.StatusInternalServerError)
		return
	}

	user, err := h.store.InsertUser(r.Context(), req.Username, string(hash), req.Role, req.FirstName, req.LastName, req.Email)
	if err != nil {
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusCreated, user)
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
// @Description  Updates a user's username and role
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
		http.Error(w, "role must be 'admin' or 'viewer'", http.StatusBadRequest)
		return
	}

	user, err := h.store.UpdateUser(r.Context(), userID, req.Username, req.Role, req.FirstName, req.LastName, req.Email)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update user", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, user)
}

// @Summary      Change password
// @Description  Replaces a user's password
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
	if target.Role == "admin" {
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

	w.WriteHeader(http.StatusNoContent)
}
