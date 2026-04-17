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
	"github.com/tlsentinel/tlsentinel-server/pkg/pagination"
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
	Enabled    bool    `json:"enabled"`
	ScanExempt bool    `json:"scanExempt"`
	ScannerID  *string `json:"scannerId"`
	Notes      *string `json:"notes"`
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
	page, pageSize := pagination.Parse(r, 20, 100)

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
		ScanExempt: false, // new endpoints are never scan-exempt
		ScannerID: req.ScannerID,
		Notes:     req.Notes,
	}

	endpoint, err := h.store.InsertEndpoint(r.Context(), rec)
	if err != nil {
		http.Error(w, "failed to create endpoint", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.EndpointCreate, "endpoint", endpoint.ID)
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
		ScanExempt: req.ScanExempt,
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

	auth.LogAction(r.Context(), h.store, r, audit.EndpointUpdate, "endpoint", endpointID)
	response.JSON(w, http.StatusOK, endpoint)
}

// @Summary      Partially update an endpoint
// @Description  Applies a partial update to an endpoint. Only fields present in the request body are changed; omitted fields retain their current values. scannerId and notes accept null to clear them.
// @Tags         endpoints
// @Accept       json
// @Produce      json
// @Param        endpointID  path      string  true  "Endpoint ID"
// @Param        request     body      object  true  "Partial endpoint payload"
// @Success      200         {object}  models.Endpoint
// @Failure      400         {string}  string  "invalid request"
// @Failure      404         {string}  string  "endpoint not found"
// @Failure      500         {string}  string  "internal server error"
// @Router       /endpoints/{endpointID} [patch]
func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	// Decode as raw key map so we can distinguish absent fields from explicit null.
	var rawFields map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&rawFields); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Fetch current state to seed the update record.
	current, err := h.store.GetEndpoint(r.Context(), endpointID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "endpoint not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get endpoint", http.StatusInternalServerError)
		return
	}

	// Start from current values; only override what's present in the patch.
	rec := models.EndpointRecord{
		Name:       current.Name,
		Type:       current.Type,
		DNSName:    current.DNSName,
		IPAddress:  current.IPAddress,
		Port:       current.Port,
		URL:        current.URL,
		Enabled:    current.Enabled,
		ScanExempt: current.ScanExempt,
		ScannerID:  current.ScannerID,
		Notes:      current.Notes,
	}

	if v, ok := rawFields["name"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil || s == "" {
			http.Error(w, "name must be a non-empty string", http.StatusBadRequest)
			return
		}
		rec.Name = s
	}
	if v, ok := rawFields["enabled"]; ok {
		var b bool
		if err := json.Unmarshal(v, &b); err != nil {
			http.Error(w, "enabled must be a boolean", http.StatusBadRequest)
			return
		}
		rec.Enabled = b
	}
	if v, ok := rawFields["scanExempt"]; ok {
		var b bool
		if err := json.Unmarshal(v, &b); err != nil {
			http.Error(w, "scanExempt must be a boolean", http.StatusBadRequest)
			return
		}
		rec.ScanExempt = b
	}
	if v, ok := rawFields["scannerId"]; ok {
		if string(v) == "null" {
			rec.ScannerID = nil
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				http.Error(w, "scannerId must be a string or null", http.StatusBadRequest)
				return
			}
			rec.ScannerID = &s
		}
	}
	if v, ok := rawFields["notes"]; ok {
		if string(v) == "null" {
			rec.Notes = nil
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				http.Error(w, "notes must be a string or null", http.StatusBadRequest)
				return
			}
			rec.Notes = &s
		}
	}
	if v, ok := rawFields["dnsName"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil || s == "" {
			http.Error(w, "dnsName must be a non-empty string", http.StatusBadRequest)
			return
		}
		rec.DNSName = s
	}
	if v, ok := rawFields["ipAddress"]; ok {
		if string(v) == "null" {
			rec.IPAddress = nil
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				http.Error(w, "ipAddress must be a string or null", http.StatusBadRequest)
				return
			}
			rec.IPAddress = &s
		}
	}
	if v, ok := rawFields["port"]; ok {
		var p int
		if err := json.Unmarshal(v, &p); err != nil || p < 1 || p > 65535 {
			http.Error(w, "port must be between 1 and 65535", http.StatusBadRequest)
			return
		}
		rec.Port = p
	}
	if v, ok := rawFields["url"]; ok {
		if string(v) == "null" {
			rec.URL = nil
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err != nil {
				http.Error(w, "url must be a string or null", http.StatusBadRequest)
				return
			}
			rec.URL = &s
		}
	}

	endpoint, err := h.store.UpdateEndpoint(r.Context(), endpointID, rec)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "endpoint not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to patch endpoint", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.EndpointUpdate, "endpoint", endpointID)
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

	auth.LogAction(r.Context(), h.store, r, audit.EndpointDelete, "endpoint", endpointID)
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

	certUse := req.CertUse
	switch certUse {
	case "signing", "encryption", "tls":
		// valid, keep as-is
	default:
		certUse = "manual"
	}
	if err := h.store.UpsertEndpointCert(r.Context(), endpointID, rec.Fingerprint, certUse); err != nil {
		slog.Error("failed to link certificate", "error", err)
		http.Error(w, "failed to link certificate", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.EndpointUpdate, "endpoint", endpointID)

	endpoint, err := h.store.GetEndpoint(r.Context(), endpointID)
	if err != nil {
		http.Error(w, "failed to fetch updated endpoint", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, endpoint)
}

type LinkCertificateRequest struct {
	PEM     string `json:"pem"`
	CertUse string `json:"certUse"` // optional: "manual" (default), "signing", "encryption"
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

// BulkImportRow is a single row in a bulk import request.
type BulkImportRow struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	DNSName   string  `json:"dnsName"`
	Port      int     `json:"port"`
	IPAddress *string `json:"ipAddress"`
	URL       *string `json:"url"`
	ScannerID *string `json:"scannerId"`
	Notes     *string `json:"notes"`
}

// BulkImportRequest is the payload for the bulk import endpoint.
type BulkImportRequest struct {
	Rows []BulkImportRow `json:"rows"`
}

// BulkImportRowResult is the per-row result returned after a bulk import.
type BulkImportRowResult struct {
	Row   int     `json:"row"`             // 1-based row number
	Name  string  `json:"name"`
	ID    *string `json:"id,omitempty"`    // set on success
	Error *string `json:"error,omitempty"` // set on failure
}

// BulkImportResponse is the full response from the bulk import endpoint.
type BulkImportResponse struct {
	Created int                   `json:"created"`
	Failed  int                   `json:"failed"`
	Results []BulkImportRowResult `json:"results"`
}

func validateBulkRow(row BulkImportRow) string {
	if row.Name == "" {
		return "name is required"
	}
	switch row.Type {
	case "host":
		if row.DNSName == "" {
			return "dnsName is required for type host"
		}
	case "saml":
		if row.URL == nil || *row.URL == "" {
			return "url is required for type saml"
		}
	case "manual":
		// no type-specific fields required
	default:
		return "unknown type: must be host, saml, or manual"
	}
	return ""
}

// @Summary      Bulk import endpoints
// @Description  Creates multiple endpoints in a single request; processes all rows and returns per-row results
// @Tags         endpoints
// @Accept       json
// @Produce      json
// @Param        request  body      BulkImportRequest   true  "Bulk import payload"
// @Success      200      {object}  BulkImportResponse
// @Failure      400      {string}  string  "invalid request"
// @Failure      500      {string}  string  "internal server error"
// @Router       /endpoints/bulk [post]
func (h *Handler) BulkImport(w http.ResponseWriter, r *http.Request) {
	var req BulkImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.Rows) == 0 {
		http.Error(w, "rows must not be empty", http.StatusBadRequest)
		return
	}

	resp := BulkImportResponse{
		Results: make([]BulkImportRowResult, 0, len(req.Rows)),
	}

	for i, row := range req.Rows {
		rowNum := i + 1
		result := BulkImportRowResult{Row: rowNum, Name: row.Name}

		// Normalize type default
		if row.Type == "" {
			row.Type = "host"
		}
		if row.Type == "host" && row.Port == 0 {
			row.Port = 443
		}

		if errMsg := validateBulkRow(row); errMsg != "" {
			result.Error = &errMsg
			resp.Failed++
			resp.Results = append(resp.Results, result)
			continue
		}

		rec := models.EndpointRecord{
			Name:      row.Name,
			Type:      row.Type,
			DNSName:   row.DNSName,
			IPAddress: row.IPAddress,
			Port:      row.Port,
			URL:       row.URL,
			Enabled:   true,
			ScannerID: row.ScannerID,
			Notes:     row.Notes,
		}

		endpoint, err := h.store.InsertEndpoint(r.Context(), rec)
		if err != nil {
			msg := "failed to create endpoint"
			result.Error = &msg
			resp.Failed++
			resp.Results = append(resp.Results, result)
			continue
		}

		auth.LogAction(r.Context(), h.store, r, audit.EndpointCreate, "endpoint", endpoint.ID)
		result.ID = &endpoint.ID
		resp.Created++
		resp.Results = append(resp.Results, result)
	}

	response.JSON(w, http.StatusOK, resp)
}
