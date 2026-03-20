package hosts

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

// CreateHostRequest is the payload for creating a new host.
type CreateHostRequest struct {
	Name      string  `json:"name"`
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
	ScannerID *string `json:"scannerId"`
	Notes     *string `json:"notes"`
}

// UpdateHostRequest is the payload for replacing a host's configuration.
type UpdateHostRequest struct {
	Name      string  `json:"name"`
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
	Enabled   bool    `json:"enabled"`
	ScannerID *string `json:"scannerId"`
	Notes     *string `json:"notes"`
}

// @Summary      List hosts
// @Description  Returns a paginated list of monitored hosts
// @Tags         hosts
// @Produce      json
// @Param        page       query  int     false  "Page number (default 1)"
// @Param        page_size  query  int     false  "Page size (default 20, max 100)"
// @Param        has_error  query  bool    false  "When true, return only hosts with an active scan error"
// @Param        name       query  string  false  "Filter by name or DNS name (partial match)"
// @Param        status     query  string  false  "Filter by enabled state: enabled, disabled"
// @Param        sort       query  string  false  "Sort order: \"\" (newest first, default), name, dns_name, last_scanned"
// @Success      200  {object}  models.HostList
// @Failure      500  {string}  string  "internal server error"
// @Router       /hosts [get]
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

	result, err := h.store.ListHosts(r.Context(), page, pageSize, hasError, name, status, sort)
	if err != nil {
		http.Error(w, "failed to list hosts", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, result)
}

// @Summary      Create a host
// @Description  Adds a new host to be monitored
// @Tags         hosts
// @Accept       json
// @Produce      json
// @Param        request  body      CreateHostRequest  true  "Host payload"
// @Success      201      {object}  models.Host
// @Failure      400      {string}  string  "invalid request"
// @Failure      500      {string}  string  "internal server error"
// @Router       /hosts [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateHostRequest
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

	rec := models.HostRecord{
		Name:      req.Name,
		DNSName:   req.DNSName,
		IPAddress: req.IPAddress,
		Port:      req.Port,
		Enabled:   true,
		ScannerID: req.ScannerID,
		Notes:     req.Notes,
	}

	host, err := h.store.InsertHost(r.Context(), rec)
	if err != nil {
		http.Error(w, "failed to create host", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusCreated, host)
}

// @Summary      Get a host
// @Description  Returns the full detail of a host by its ID
// @Tags         hosts
// @Produce      json
// @Param        hostID  path      string  true  "Host ID"
// @Success      200     {object}  models.Host
// @Failure      404     {string}  string  "host not found"
// @Failure      500     {string}  string  "internal server error"
// @Router       /hosts/{hostID} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "hostID")

	host, err := h.store.GetHost(r.Context(), hostID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get host", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, host)
}

// @Summary      Update a host
// @Description  Replaces the configuration of an existing host
// @Tags         hosts
// @Accept       json
// @Produce      json
// @Param        hostID   path      string             true  "Host ID"
// @Param        request  body      UpdateHostRequest  true  "Host payload"
// @Success      200      {object}  models.Host
// @Failure      400      {string}  string  "invalid request"
// @Failure      404      {string}  string  "host not found"
// @Failure      500      {string}  string  "internal server error"
// @Router       /hosts/{hostID} [put]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "hostID")

	var req UpdateHostRequest
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

	rec := models.HostRecord{
		Name:      req.Name,
		DNSName:   req.DNSName,
		IPAddress: req.IPAddress,
		Port:      req.Port,
		Enabled:   req.Enabled,
		ScannerID: req.ScannerID,
		Notes:     req.Notes,
	}

	host, err := h.store.UpdateHost(r.Context(), hostID, rec)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update host", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, host)
}

// @Summary      Delete a host
// @Description  Removes a host and its scan history
// @Tags         hosts
// @Param        hostID  path  string  true  "Host ID"
// @Success      204
// @Failure      404  {string}  string  "host not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /hosts/{hostID} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "hostID")

	if err := h.store.DeleteHost(r.Context(), hostID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "host not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to delete host", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// tlsProfileResponse is the enriched API response for a host TLS profile.
// It combines the raw scan data stored in the database with the classification
// computed by internal/tlsprofile.Classify at query time.
type tlsProfileResponse struct {
	HostID         string            `json:"hostId"`
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
// @Description  Returns the current TLS version and cipher suite profile for a host, with weakness classification
// @Tags         hosts
// @Produce      json
// @Param        hostID  path      string  true  "Host ID"
// @Success      200     {object}  tlsProfileResponse
// @Failure      404     {string}  string  "tls profile not found"
// @Failure      500     {string}  string  "internal server error"
// @Router       /hosts/{hostID}/tls-profile [get]
func (h *Handler) GetTLSProfile(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "hostID")

	profile, err := h.store.GetHostTLSProfile(r.Context(), hostID)
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
		HostID:         profile.HostID,
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
// @Description  Returns the most recent scan results for a host, newest first
// @Tags         hosts
// @Produce      json
// @Param        hostID  path      string  true   "Host ID"
// @Param        limit   query     int     false  "Max rows to return (default 20, max 100)"
// @Success      200     {object}  models.HostScanHistoryList
// @Failure      500     {string}  string  "internal server error"
// @Router       /hosts/{hostID}/history [get]
func (h *Handler) History(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "hostID")

	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	items, err := h.store.GetHostScanHistory(r.Context(), hostID, limit)
	if err != nil {
		http.Error(w, "failed to get scan history", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, models.HostScanHistoryList{Items: items})
}
