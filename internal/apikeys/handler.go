package apikeys

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

type apiKeyResponse struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	LastUsedAt *string `json:"lastUsedAt"`
	CreatedAt  string  `json:"createdAt"`
}

type createAPIKeyResponse struct {
	apiKeyResponse
	Token string `json:"token"` // only present on creation
}

func toResponse(k db.UserAPIKey) apiKeyResponse {
	r := apiKeyResponse{
		ID:        k.ID,
		Name:      k.Name,
		Prefix:    k.Prefix,
		CreatedAt: k.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
	if k.LastUsedAt != nil {
		s := k.LastUsedAt.UTC().Format("2006-01-02T15:04:05Z")
		r.LastUsedAt = &s
	}
	return r
}

// @Summary      List API keys
// @Description  Returns all API keys for the authenticated user. The raw token is never returned after creation.
// @Tags         me
// @Produce      json
// @Success      200  {array}   apiKeyResponse
// @Router       /me/api-keys [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.GetIdentity(r.Context())
	keys, err := h.store.ListAPIKeys(r.Context(), identity.UserID)
	if err != nil {
		http.Error(w, "failed to list api keys", http.StatusInternalServerError)
		return
	}
	out := make([]apiKeyResponse, len(keys))
	for i, k := range keys {
		out[i] = toResponse(k)
	}
	response.JSON(w, http.StatusOK, out)
}

// @Summary      Create API key
// @Description  Generates a new API key. The full token is returned once and cannot be retrieved again.
// @Tags         me
// @Accept       json
// @Produce      json
// @Param        request  body  object  true  "API key name"
// @Success      201  {object}  createAPIKeyResponse
// @Failure      400  {string}  string  "invalid request"
// @Failure      500  {string}  string  "internal server error"
// @Router       /me/api-keys [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	identity, _ := auth.GetIdentity(r.Context())

	raw, hash, prefix, err := auth.GenerateAPIKey()
	if err != nil {
		http.Error(w, "failed to generate api key", http.StatusInternalServerError)
		return
	}

	key, err := h.store.CreateAPIKey(r.Context(), identity.UserID, req.Name, hash, prefix)
	if err != nil {
		http.Error(w, "failed to create api key", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusCreated, createAPIKeyResponse{
		apiKeyResponse: toResponse(*key),
		Token:          raw,
	})
}

// @Summary      Delete API key
// @Description  Revokes an API key. The key is immediately invalidated.
// @Tags         me
// @Param        id  path  string  true  "API key ID"
// @Success      204
// @Failure      404  {string}  string  "not found"
// @Router       /me/api-keys/{id} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	identity, _ := auth.GetIdentity(r.Context())
	keyID := chi.URLParam(r, "id")

	if err := h.store.DeleteAPIKey(r.Context(), identity.UserID, keyID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to delete api key", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

type adminAPIKeyResponse struct {
	apiKeyResponse
	UserID   string `json:"userId"`
	Username string `json:"username"`
}

// @Summary      List all API keys (admin)
// @Description  Returns all API keys across all users. Requires apikeys:admin permission.
// @Tags         admin
// @Produce      json
// @Success      200  {array}   adminAPIKeyResponse
// @Router       /admin/api-keys [get]
func (h *Handler) ListAll(w http.ResponseWriter, r *http.Request) {
	keys, err := h.store.ListAllAPIKeys(r.Context())
	if err != nil {
		http.Error(w, "failed to list api keys", http.StatusInternalServerError)
		return
	}
	out := make([]adminAPIKeyResponse, len(keys))
	for i, k := range keys {
		out[i] = adminAPIKeyResponse{
			apiKeyResponse: toResponse(k.UserAPIKey),
			UserID:         k.UserID,
			Username:       k.Username,
		}
	}
	response.JSON(w, http.StatusOK, out)
}

// @Summary      Revoke any API key (admin)
// @Description  Revokes any user's API key by ID. Requires apikeys:admin permission.
// @Tags         admin
// @Param        id  path  string  true  "API key ID"
// @Success      204
// @Failure      404  {string}  string  "not found"
// @Router       /admin/api-keys/{id} [delete]
func (h *Handler) DeleteAdmin(w http.ResponseWriter, r *http.Request) {
	keyID := chi.URLParam(r, "id")
	if err := h.store.DeleteAPIKeyAdmin(r.Context(), keyID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to revoke api key", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
