package scanners

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) logAudit(r *http.Request, action, resourceType, resourceID string) {
	identity, _ := auth.GetIdentity(r.Context())
	ip := audit.IPFromRequest(r)
	resType := resourceType
	resID := resourceID
	if err := h.store.LogAuditEvent(r.Context(), db.AuditLog{
		UserID:       ptrIfNonEmpty(identity.UserID),
		Username:     identity.Username,
		Action:       action,
		ResourceType: &resType,
		ResourceID:   &resID,
		IPAddress:    &ip,
	}); err != nil {
		slog.Error("audit log failed", "err", err)
	}
}

func ptrIfNonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// createScannerTokenRequest is the payload for creating a new scanner token.
type createScannerTokenRequest struct {
	Name                string `json:"name"`
	ScanIntervalSeconds int    `json:"scanIntervalSeconds"` // optional; defaults to 3600
	ScanConcurrency     int    `json:"scanConcurrency"`     // optional; defaults to 5
}

// updateScannerTokenRequest is the payload for updating a scanner token.
type updateScannerTokenRequest struct {
	Name                string `json:"name"`
	ScanIntervalSeconds int    `json:"scanIntervalSeconds"`
	ScanConcurrency     int    `json:"scanConcurrency"`
}

// createScannerTokenResponse is returned once on creation and includes the raw token.
type createScannerTokenResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	CreatedAt  string `json:"createdAt"`
	LastUsedAt any    `json:"lastUsedAt"`
	// Token is the raw bearer token. Shown exactly once — not stored.
	Token string `json:"token"`
}

// @Summary      List scanner tokens
// @Description  Returns all registered scanner tokens (without the raw token value)
// @Tags         scanners
// @Produce      json
// @Success      200  {array}   models.ScannerTokenResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /scanners [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	tokens, err := h.store.ListScannerTokens(r.Context())
	if err != nil {
		http.Error(w, "failed to list scanner tokens", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, tokens)
}

// @Summary      Get a scanner token
// @Description  Returns a single scanner token by ID
// @Tags         scanners
// @Produce      json
// @Param        scannerID  path      string  true  "Scanner token ID"
// @Success      200        {object}  models.ScannerTokenResponse
// @Failure      404        {string}  string  "scanner token not found"
// @Failure      500        {string}  string  "internal server error"
// @Router       /scanners/{scannerID} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	scannerID := chi.URLParam(r, "scannerID")
	token, err := h.store.GetScannerToken(r.Context(), scannerID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "scanner token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get scanner token", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, token)
}

// @Summary      Create a scanner token
// @Description  Generates a new scanner token. The raw token is returned once and cannot be retrieved again.
// @Tags         scanners
// @Accept       json
// @Produce      json
// @Param        request  body      createScannerTokenRequest  true  "Scanner token payload"
// @Success      201      {object}  createScannerTokenResponse
// @Failure      400      {string}  string  "invalid request"
// @Failure      500      {string}  string  "internal server error"
// @Router       /scanners [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createScannerTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.ScanIntervalSeconds <= 0 {
		req.ScanIntervalSeconds = 3600
	}
	if req.ScanConcurrency <= 0 {
		req.ScanConcurrency = 5
	}

	raw, hash, err := auth.GenerateScannerToken()
	if err != nil {
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}

	token, err := h.store.InsertScannerToken(r.Context(), req.Name, hash, req.ScanIntervalSeconds, req.ScanConcurrency)
	if err != nil {
		http.Error(w, "failed to create scanner token", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.ScannerCreate, "scanner", token.ID)
	response.JSON(w, http.StatusCreated, createScannerTokenResponse{
		ID:         token.ID,
		Name:       token.Name,
		CreatedAt:  token.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		LastUsedAt: token.LastUsedAt,
		Token:      raw,
	})
}

// @Summary      Update a scanner
// @Description  Updates a scanner's name and scan configuration (interval, concurrency)
// @Tags         scanners
// @Accept       json
// @Produce      json
// @Param        scannerID  path      string                     true  "Scanner token ID"
// @Param        request    body      updateScannerTokenRequest  true  "Scanner update payload"
// @Success      200        {object}  models.ScannerTokenResponse
// @Failure      400        {string}  string  "invalid request"
// @Failure      404        {string}  string  "scanner token not found"
// @Failure      500        {string}  string  "internal server error"
// @Router       /scanners/{scannerID} [put]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	scannerID := chi.URLParam(r, "scannerID")

	var req updateScannerTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.ScanIntervalSeconds <= 0 {
		req.ScanIntervalSeconds = 3600
	}
	if req.ScanConcurrency <= 0 {
		req.ScanConcurrency = 5
	}

	token, err := h.store.UpdateScannerToken(r.Context(), scannerID, req.Name, req.ScanIntervalSeconds, req.ScanConcurrency)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "scanner token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update scanner token", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.ScannerUpdate, "scanner", scannerID)
	response.JSON(w, http.StatusOK, token)
}

// patchScannerTokenRequest contains the scanner fields that may be partially updated.
// Only fields present in the JSON body are applied; omitted fields retain their current values.
type patchScannerTokenRequest struct {
	Name                *string `json:"name"`
	ScanIntervalSeconds *int    `json:"scanIntervalSeconds"`
	ScanConcurrency     *int    `json:"scanConcurrency"`
}

// @Summary      Partially update a scanner
// @Description  Applies a partial update to a scanner token. Only fields present in the request body are changed.
// @Tags         scanners
// @Accept       json
// @Produce      json
// @Param        scannerID  path      string                    true  "Scanner token ID"
// @Param        request    body      patchScannerTokenRequest  true  "Partial scanner payload"
// @Success      200        {object}  models.ScannerTokenResponse
// @Failure      400        {string}  string  "invalid request"
// @Failure      404        {string}  string  "scanner token not found"
// @Failure      500        {string}  string  "internal server error"
// @Router       /scanners/{scannerID} [patch]
func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	scannerID := chi.URLParam(r, "scannerID")

	current, err := h.store.GetScannerToken(r.Context(), scannerID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "scanner token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get scanner token", http.StatusInternalServerError)
		return
	}

	var req patchScannerTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	name := current.Name
	interval := current.ScanIntervalSeconds
	concurrency := current.ScanConcurrency

	if req.Name != nil {
		if *req.Name == "" {
			http.Error(w, "name must not be empty", http.StatusBadRequest)
			return
		}
		name = *req.Name
	}
	if req.ScanIntervalSeconds != nil {
		if *req.ScanIntervalSeconds <= 0 {
			http.Error(w, "scanIntervalSeconds must be positive", http.StatusBadRequest)
			return
		}
		interval = *req.ScanIntervalSeconds
	}
	if req.ScanConcurrency != nil {
		if *req.ScanConcurrency <= 0 {
			http.Error(w, "scanConcurrency must be positive", http.StatusBadRequest)
			return
		}
		concurrency = *req.ScanConcurrency
	}

	token, err := h.store.UpdateScannerToken(r.Context(), scannerID, name, interval, concurrency)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "scanner token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to patch scanner token", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.ScannerUpdate, "scanner", scannerID)
	response.JSON(w, http.StatusOK, token)
}

// @Summary      Set default scanner token
// @Description  Marks the specified scanner as the default; clears the flag on all others
// @Tags         scanners
// @Param        scannerID  path  string  true  "Scanner token ID"
// @Success      204
// @Failure      404  {string}  string  "scanner token not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /scanners/{scannerID}/default [post]
func (h *Handler) SetDefault(w http.ResponseWriter, r *http.Request) {
	scannerID := chi.URLParam(r, "scannerID")

	if err := h.store.SetDefaultScannerToken(r.Context(), scannerID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "scanner token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to set default scanner token", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.ScannerSetDefault, "scanner", scannerID)
	w.WriteHeader(http.StatusNoContent)
}

// @Summary      Delete a scanner token
// @Description  Revokes a scanner token by ID
// @Tags         scanners
// @Param        scannerID  path  string  true  "Scanner token ID"
// @Success      204
// @Failure      404  {string}  string  "scanner token not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /scanners/{scannerID} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	scannerID := chi.URLParam(r, "scannerID")

	if err := h.store.DeleteScannerToken(r.Context(), scannerID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "scanner token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to delete scanner token", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.ScannerDelete, "scanner", scannerID)
	w.WriteHeader(http.StatusNoContent)
}
