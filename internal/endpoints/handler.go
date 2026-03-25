package endpoints

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/tlsprofile"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// CreateEndpointRequest is the payload for creating a new endpoint.
type CreateEndpointRequest struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
	ScannerID *string `json:"scannerId"`
	Notes     *string `json:"notes"`
}

// UpdateEndpointRequest is the payload for replacing an endpoint's configuration.
type UpdateEndpointRequest struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
	Enabled   bool    `json:"enabled"`
	ScannerID *string `json:"scannerId"`
	Notes     *string `json:"notes"`
}

// @Summary      List endpoints
// @Description  Returns a paginated list of monitored endpoints
// @Tags         endpoints
// @Produce      json
// @Param        page       query  int     false  "Page number (default 1)"
// @Param        page_size  query  int     false  "Page size (default 20, max 100)"
// @Param        has_error  query  bool    false  "When true, return only endpoints with an active scan error"
// @Param        name       query  string  false  "Filter by name or DNS name (partial match)"
// @Param        status     query  string  false  "Filter by enabled state: enabled, disabled"
// @Param        sort       query  string  false  "Sort order: \"\" (newest first, default), name, dns_name, last_scanned"
// @Success      200  {object}  models.EndpointList
// @Failure      500  {string}  string  "internal server error"
// @Router       /endpoints [get]
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

	hasError := r.URL.Query().Get("has_error") == "true"
	name := r.URL.Query().Get("name")
	status := r.URL.Query().Get("status")
	sort := r.URL.Query().Get("sort")

	result, err := h.store.ListEndpoints(r.Context(), page, pageSize, hasError, name, status, sort)
	if err != nil {
		http.Error(w, "failed to list endpoints", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, result)
}

// @Summary      Create an endpoint
// @Description  Adds a new endpoint to be monitored
// @Tags         endpoints
// @Accept       json
// @Produce      json
// @Param        request  body      CreateEndpointRequest  true  "Endpoint payload"
// @Success      201      {object}  models.Endpoint
// @Failure      400      {string}  string  "invalid request"
// @Failure      500      {string}  string  "internal server error"
// @Router       /endpoints [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.DNSName == "" {
		http.Error(w, "name and dnsName are required", http.StatusBadRequest)
		return
	}
	if req.Port == 0 {
		req.Port = 443
	}

	rec := models.EndpointRecord{
		Name:      req.Name,
		Type:      req.Type,
		DNSName:   req.DNSName,
		IPAddress: req.IPAddress,
		Port:      req.Port,
		Enabled:   true,
		ScannerID: req.ScannerID,
		Notes:     req.Notes,
	}
	if rec.Type == "" {
		rec.Type = "host"
	}

	endpoint, err := h.store.InsertEndpoint(r.Context(), rec)
	if err != nil {
		http.Error(w, "failed to create endpoint", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusCreated, endpoint)
}

// @Summary      Get an endpoint
// @Description  Returns the full detail of an endpoint by its ID
// @Tags         endpoints
// @Produce      json
// @Param        endpointID  path      string  true  "Endpoint ID"
// @Success      200         {object}  models.Endpoint
// @Failure      404         {string}  string  "endpoint not found"
// @Failure      500         {string}  string  "internal server error"
// @Router       /endpoints/{endpointID} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	endpoint, err := h.store.GetEndpoint(r.Context(), endpointID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "endpoint not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get endpoint", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, endpoint)
}

// @Summary      Update an endpoint
// @Description  Replaces the configuration of an existing endpoint
// @Tags         endpoints
// @Accept       json
// @Produce      json
// @Param        endpointID  path      string                 true  "Endpoint ID"
// @Param        request     body      UpdateEndpointRequest  true  "Endpoint payload"
// @Success      200         {object}  models.Endpoint
// @Failure      400         {string}  string  "invalid request"
// @Failure      404         {string}  string  "endpoint not found"
// @Failure      500         {string}  string  "internal server error"
// @Router       /endpoints/{endpointID} [put]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	var req UpdateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.DNSName == "" {
		http.Error(w, "name and dnsName are required", http.StatusBadRequest)
		return
	}
	if req.Port == 0 {
		req.Port = 443
	}

	rec := models.EndpointRecord{
		Name:      req.Name,
		Type:      req.Type,
		DNSName:   req.DNSName,
		IPAddress: req.IPAddress,
		Port:      req.Port,
		Enabled:   req.Enabled,
		ScannerID: req.ScannerID,
		Notes:     req.Notes,
	}
	if rec.Type == "" {
		rec.Type = "host"
	}

	endpoint, err := h.store.UpdateEndpoint(r.Context(), endpointID, rec)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "endpoint not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update endpoint", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, endpoint)
}

// @Summary      Delete an endpoint
// @Description  Removes an endpoint and its scan history
// @Tags         endpoints
// @Param        endpointID  path  string  true  "Endpoint ID"
// @Success      204
// @Failure      404  {string}  string  "endpoint not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /endpoints/{endpointID} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	if err := h.store.DeleteEndpoint(r.Context(), endpointID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "endpoint not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to delete endpoint", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// tlsProfileResponse is the enriched API response for an endpoint TLS profile.
// It combines the raw scan data stored in the database with the classification
// computed by internal/tlsprofile.Classify at query time.
type tlsProfileResponse struct {
	EndpointID     string            `json:"endpointId"`
	ScannedAt      time.Time         `json:"scannedAt"`
	TLS10          bool              `json:"tls10"`
	TLS11          bool              `json:"tls11"`
	TLS12          bool              `json:"tls12"`
	TLS13          bool              `json:"tls13"`
	CipherSuites   []string          `json:"cipherSuites"`
	SelectedCipher *string           `json:"selectedCipher,omitempty"`
	ScanError      *string           `json:"scanError,omitempty"`
	Classification tlsprofile.Result `json:"classification"`
}

// @Summary      Get TLS profile
// @Description  Returns the current TLS version and cipher suite profile for an endpoint, with weakness classification
// @Tags         endpoints
// @Produce      json
// @Param        endpointID  path      string  true  "Endpoint ID"
// @Success      200         {object}  tlsProfileResponse
// @Failure      404         {string}  string  "tls profile not found"
// @Failure      500         {string}  string  "internal server error"
// @Router       /endpoints/{endpointID}/tls-profile [get]
func (h *Handler) GetTLSProfile(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	profile, err := h.store.GetEndpointTLSProfile(r.Context(), endpointID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "tls profile not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get TLS profile", http.StatusInternalServerError)
		return
	}

	// Ensure non-nil slice for clean JSON serialisation.
	if profile.CipherSuites == nil {
		profile.CipherSuites = []string{}
	}

	resp := tlsProfileResponse{
		EndpointID:     profile.EndpointID,
		ScannedAt:      profile.ScannedAt,
		TLS10:          profile.TLS10,
		TLS11:          profile.TLS11,
		TLS12:          profile.TLS12,
		TLS13:          profile.TLS13,
		CipherSuites:   profile.CipherSuites,
		SelectedCipher: profile.SelectedCipher,
		ScanError:      profile.ScanError,
		Classification: tlsprofile.Classify(
			profile.TLS10,
			profile.TLS11,
			profile.TLS12,
			profile.TLS13,
			profile.CipherSuites,
		),
	}

	response.JSON(w, http.StatusOK, resp)
}

// @Summary      Get scan history
// @Description  Returns the most recent scan results for an endpoint, newest first
// @Tags         endpoints
// @Produce      json
// @Param        endpointID  path      string  true   "Endpoint ID"
// @Param        limit       query     int     false  "Max rows to return (default 20, max 100)"
// @Success      200         {object}  models.EndpointScanHistoryList
// @Failure      500         {string}  string  "internal server error"
// @Router       /endpoints/{endpointID}/history [get]
func (h *Handler) History(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	items, err := h.store.GetEndpointScanHistory(r.Context(), endpointID, limit)
	if err != nil {
		http.Error(w, "failed to get scan history", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, models.EndpointScanHistoryList{Items: items})
}
