package endpoints

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/certificates"
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

func (h *Handler) logAudit(r *http.Request, action, resourceType, resourceID string) {
	identity, _ := auth.GetIdentity(r.Context())
	ip := audit.IPFromRequest(r)
	if err := h.store.LogAuditEvent(r.Context(), db.AuditLog{
		UserID:       ptrIfNonEmpty(identity.UserID),
		Username:     identity.Username,
		Action:       action,
		ResourceType: &resourceType,
		ResourceID:   &resourceID,
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

// CreateEndpointRequest is the payload for creating a new endpoint.
// Which fields are required depends on type:
//   - host:   dnsName required, port defaults to 443, ipAddress optional
//   - saml:   url required
//   - manual: no type-specific fields required
type CreateEndpointRequest struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	// Host-type fields.
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
	// SAML-type fields.
	URL       *string `json:"url"`
	// Common optional fields.
	ScannerID *string `json:"scannerId"`
	Notes     *string `json:"notes"`
}

// UpdateEndpointRequest is the payload for replacing an endpoint's configuration.
// Which fields are required depends on type — same rules as CreateEndpointRequest.
type UpdateEndpointRequest struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	// Host-type fields.
	DNSName   string  `json:"dnsName"`
	IPAddress *string `json:"ipAddress"`
	Port      int     `json:"port"`
	// SAML-type fields.
	URL       *string `json:"url"`
	// Common fields.
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
	tagID := r.URL.Query().Get("tag_id")

	result, err := h.store.ListEndpoints(r.Context(), page, pageSize, hasError, name, status, sort, tagID)
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

	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		req.Type = "host"
	}

	switch req.Type {
	case "host":
		if req.DNSName == "" {
			http.Error(w, "dnsName is required for type host", http.StatusBadRequest)
			return
		}
		if req.Port == 0 {
			req.Port = 443
		}
	case "saml":
		if req.URL == nil || *req.URL == "" {
			http.Error(w, "url is required for type saml", http.StatusBadRequest)
			return
		}
	case "manual":
		// no type-specific fields required
	default:
		http.Error(w, "unknown endpoint type", http.StatusBadRequest)
		return
	}

	rec := models.EndpointRecord{
		Name:      req.Name,
		Type:      req.Type,
		DNSName:   req.DNSName,
		IPAddress: req.IPAddress,
		Port:      req.Port,
		URL:       req.URL,
		Enabled:   true,
		ScannerID: req.ScannerID,
		Notes:     req.Notes,
	}

	endpoint, err := h.store.InsertEndpoint(r.Context(), rec)
	if err != nil {
		http.Error(w, "failed to create endpoint", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.EndpointCreate, "endpoint", endpoint.ID)
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

	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		req.Type = "host"
	}

	switch req.Type {
	case "host":
		if req.DNSName == "" {
			http.Error(w, "dnsName is required for type host", http.StatusBadRequest)
			return
		}
		if req.Port == 0 {
			req.Port = 443
		}
	case "saml":
		if req.URL == nil || *req.URL == "" {
			http.Error(w, "url is required for type saml", http.StatusBadRequest)
			return
		}
	case "manual":
		// no type-specific fields required
	default:
		http.Error(w, "unknown endpoint type", http.StatusBadRequest)
		return
	}

	rec := models.EndpointRecord{
		Name:      req.Name,
		Type:      req.Type,
		DNSName:   req.DNSName,
		IPAddress: req.IPAddress,
		Port:      req.Port,
		URL:       req.URL,
		Enabled:   req.Enabled,
		ScannerID: req.ScannerID,
		Notes:     req.Notes,
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

	h.logAudit(r, audit.EndpointUpdate, "endpoint", endpointID)
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

	h.logAudit(r, audit.EndpointDelete, "endpoint", endpointID)
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

// @Summary      Link a certificate to an endpoint
// @Description  Parses a PEM-encoded certificate, upserts it into the certificate store, and sets it as the active certificate for the endpoint. Intended for manual-type endpoints.
// @Tags         endpoints
// @Accept       json
// @Produce      json
// @Param        endpointID  path      string                  true  "Endpoint ID"
// @Param        body        body      LinkCertificateRequest  true  "PEM certificate"
// @Success      200         {object}  models.Endpoint
// @Failure      400         {string}  string  "bad request"
// @Failure      500         {string}  string  "internal server error"
// @Router       /endpoints/{endpointID}/certificate [post]
func (h *Handler) LinkCertificate(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	var req LinkCertificateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.PEM == "" {
		http.Error(w, "pem is required", http.StatusBadRequest)
		return
	}

	x509Cert, err := certificates.ParsePEMCertificate(req.PEM)
	if err != nil {
		http.Error(w, "invalid certificate PEM: "+err.Error(), http.StatusBadRequest)
		return
	}

	rec := certificates.ExtractCertificateRecord(x509Cert)

	if _, err := h.store.InsertCertificate(r.Context(), rec); err != nil {
		slog.Error("failed to upsert certificate", "error", err)
		http.Error(w, "failed to store certificate", http.StatusInternalServerError)
		return
	}

	if err := h.store.SetActiveFingerprint(r.Context(), endpointID, rec.Fingerprint); err != nil {
		slog.Error("failed to set active fingerprint", "error", err)
		http.Error(w, "failed to link certificate", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.EndpointUpdate, "endpoint", endpointID)

	endpoint, err := h.store.GetEndpoint(r.Context(), endpointID)
	if err != nil {
		http.Error(w, "failed to fetch updated endpoint", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, endpoint)
}

type LinkCertificateRequest struct {
	PEM string `json:"pem"`
}
