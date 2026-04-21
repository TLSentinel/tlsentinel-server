package certificates

import (
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
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

// IngestCertificateRequest represents the payload for ingesting a certificate,
// accepting either a PEM string or a base64-encoded DER certificate.
type IngestCertificateRequest struct {
	CertificatePEM       string `json:"certificatePem,omitempty"`
	CertificateDERBase64 string `json:"certificateDerBase64,omitempty"`
}

// @Summary      List expiring certificates
// @Description  Returns active host-certificate pairs where the certificate expires within the given number of days. Includes already-expired certificates (negative days_remaining).
// @Tags         certificates
// @Produce      json
// @Param        days  query  int  false  "Expiry window in days (default 30)"
// @Success      200  {object}  models.ExpiringCertList
// @Failure      500  {string}  string  "internal server error"
// @Router       /certificates/expiring [get]
func (h *Handler) Expiring(w http.ResponseWriter, r *http.Request) {
	days := 30
	if d := r.URL.Query().Get("days"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 {
			days = n
		}
	}

	items, err := h.store.ListExpiringCerts(r.Context(), days)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, models.ExpiringCertList{Items: items})
}

// @Summary      List active certificates
// @Description  Returns a paginated list of active host-certificate pairs. Supports search, status filter, and sort.
// @Tags         certificates
// @Produce      json
// @Param        page       query  int     false  "Page number (default 1)"
// @Param        page_size  query  int     false  "Page size (default 20, max 100)"
// @Param        name       query  string  false  "Search endpoint name, DNS name, or common name (partial match)"
// @Param        status     query  string  false  "Filter by status: expired, critical, warning, ok"
// @Param        sort       query  string  false  "Sort order: \"\" (expiring soonest, default), days_desc, endpoint_name, common_name"
// @Success      200  {object}  models.ExpiringCertList
// @Failure      500  {string}  string  "internal server error"
// @Router       /certificates/active [get]
func (h *Handler) Active(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pagination.Parse(r, 20, 100)

	name := r.URL.Query().Get("name")
	status := r.URL.Query().Get("status")
	sort := r.URL.Query().Get("sort")
	tagID := r.URL.Query().Get("tag_id")

	result, err := h.store.ListAllActiveCerts(r.Context(), page, pageSize, name, status, sort, tagID)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if result.Items == nil {
		result.Items = []models.ExpiringCertItem{}
	}
	response.JSON(w, http.StatusOK, result)
}

// @Summary      List certificates
// @Description  Returns a paginated list of certificates with optional filters
// @Tags         certificates
// @Produce      json
// @Param        page            query  int     false  "Page number (default 1)"
// @Param        page_size       query  int     false  "Page size (default 20, max 100)"
// @Param        common_name     query  string  false  "Filter by common name (partial match)"
// @Param        expiring_before query  string  false  "Filter by expiry date (RFC3339)"
// @Param        status          query  string  false  "Filter by status: expired, critical, warning, ok"
// @Param        sort            query  string  false  "Sort order: \"\" (newest first, default), expiry_asc, expiry_desc, common_name"
// @Success      200  {object}  models.CertificateList
// @Failure      500  {string}  string  "internal server error"
// @Router       /certificates [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page, pageSize := pagination.Parse(r, 20, 100)

	commonName := r.URL.Query().Get("common_name")
	status := r.URL.Query().Get("status")
	sort := r.URL.Query().Get("sort")

	var expiringBefore *time.Time
	if eb := r.URL.Query().Get("expiring_before"); eb != "" {
		t, err := time.Parse(time.RFC3339, eb)
		if err != nil {
			http.Error(w, "expiring_before must be RFC3339 format", http.StatusBadRequest)
			return
		}
		expiringBefore = &t
	}

	result, err := h.store.ListCertificates(r.Context(), page, pageSize, commonName, expiringBefore, status, sort)
	if err != nil {
		http.Error(w, "failed to list certificates", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, result)
}

// @Summary      Ingest a certificate
// @Description  Accepts a PEM or base64 DER encoded certificate and stores it. Returns 201 if newly inserted, 200 if already present.
// @Tags         certificates
// @Accept       json
// @Produce      json
// @Param        request  body      IngestCertificateRequest  true  "Certificate payload"
// @Success      200  {object}  models.CertificateDetail  "Already present"
// @Success      201  {object}  models.CertificateDetail  "Newly inserted"
// @Failure      400  {string}  string  "invalid request"
// @Failure      500  {string}  string  "internal server error"
// @Router       /certificates [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req IngestCertificateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	cert, err := parseIngestRequest(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rec := ExtractCertificateRecord(cert)

	inserted, err := h.store.InsertCertificate(r.Context(), rec)
	if err != nil {
		slog.Error("failed to store certificate",
			"fingerprint", rec.Fingerprint,
			"error", err,
		)
		http.Error(w, "failed to store certificate", http.StatusInternalServerError)
		return
	}

	stored, err := h.store.GetCertificate(r.Context(), rec.Fingerprint)
	if err != nil {
		slog.Error("failed to retrieve stored certificate",
			"fingerprint", rec.Fingerprint,
			"error", err,
		)
		http.Error(w, "failed to retrieve stored certificate", http.StatusInternalServerError)
		return
	}

	status := http.StatusOK
	if inserted {
		status = http.StatusCreated
		auth.LogAction(r.Context(), h.store, r, audit.CertIngest, "certificate", rec.Fingerprint)
	}
	response.JSON(w, status, stored)
}

// @Summary      Get a certificate
// @Description  Returns the full detail of a certificate by its SHA-256 fingerprint
// @Tags         certificates
// @Produce      json
// @Param        fingerprint  path      string  true  "Certificate fingerprint"
// @Success      200          {object}  models.CertificateDetail
// @Failure      404          {string}  string  "certificate not found"
// @Failure      500          {string}  string  "internal server error"
// @Router       /certificates/{fingerprint} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	fingerprint := chi.URLParam(r, "fingerprint")

	detail, err := h.store.GetCertificate(r.Context(), fingerprint)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "certificate not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get certificate", http.StatusInternalServerError)
		return
	}

	// Enrich with derived fields parsed from the stored PEM.
	if block, _ := pem.Decode([]byte(detail.PEM)); block != nil {
		if x509Cert, err := x509.ParseCertificate(block.Bytes); err == nil {
			EnrichDetail(&detail, x509Cert)
		}
	}

	// Populate trust matrix: which root stores' anchors appear in this chain.
	trustedBy, err := h.store.GetChainTrustedBy(r.Context(), fingerprint)
	if err != nil {
		slog.Warn("failed to compute trust matrix", "fingerprint", fingerprint, "error", err)
		trustedBy = []string{}
	}
	detail.TrustedBy = trustedBy

	response.JSON(w, http.StatusOK, detail)
}

// @Summary      List root stores
// @Description  Returns all enabled root stores (id + display name). Used by the
// @Description  certificate detail page to render the Root Store Trust matrix.
// @Tags         certificates
// @Produce      json
// @Success      200  {array}  models.RootStoreSummary
// @Failure      500  {string} string  "internal server error"
// @Router       /root-stores [get]
func (h *Handler) ListRootStores(w http.ResponseWriter, r *http.Request) {
	stores, err := h.store.ListRootStoreSummaries(r.Context())
	if err != nil {
		http.Error(w, "failed to list root stores", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, stores)
}

// @Summary      List anchors in a root store
// @Description  Returns a paginated list of trust anchors (certificates) that are members
// @Description  of the given root store, optionally filtered by common-name substring.
// @Tags         certificates
// @Produce      json
// @Param        id         path   string  true   "Root store ID (e.g. microsoft, apple, mozilla, chrome)"
// @Param        page       query  int     false  "Page number (default 1)"
// @Param        page_size  query  int     false  "Page size (default 20, max 100)"
// @Param        q          query  string  false  "Filter by common name (partial match)"
// @Success      200  {object}  models.RootStoreAnchorList
// @Failure      500  {string}  string  "internal server error"
// @Router       /root-stores/{id}/anchors [get]
func (h *Handler) ListAnchors(w http.ResponseWriter, r *http.Request) {
	storeID := chi.URLParam(r, "id")
	page, pageSize := pagination.Parse(r, 20, 100)
	q := r.URL.Query().Get("q")

	result, err := h.store.ListRootStoreAnchors(r.Context(), storeID, q, page, pageSize)
	if err != nil {
		http.Error(w, "failed to list anchors", http.StatusInternalServerError)
		return
	}
	if result.Items == nil {
		result.Items = []models.RootStoreAnchorItem{}
	}
	response.JSON(w, http.StatusOK, result)
}

// @Summary      Get endpoints using a certificate
// @Description  Returns all endpoints whose active certificate matches the given fingerprint
// @Tags         certificates
// @Produce      json
// @Param        fingerprint  path      string  true  "Certificate fingerprint"
// @Success      200          {array}   models.EndpointListItem
// @Failure      500          {string}  string  "internal server error"
// @Router       /certificates/{fingerprint}/endpoints [get]
func (h *Handler) GetEndpoints(w http.ResponseWriter, r *http.Request) {
	fingerprint := chi.URLParam(r, "fingerprint")

	endpoints, err := h.store.GetCertificateHosts(r.Context(), fingerprint)
	if err != nil {
		http.Error(w, "failed to get certificate endpoints", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, endpoints)
}

// @Summary      Delete a certificate
// @Description  Deletes a certificate by its SHA-256 fingerprint
// @Tags         certificates
// @Param        fingerprint  path  string  true  "Certificate fingerprint"
// @Success      204
// @Failure      404  {string}  string  "certificate not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /certificates/{fingerprint} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	fingerprint := chi.URLParam(r, "fingerprint")

	if err := h.store.DeleteCertificate(r.Context(), fingerprint); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "certificate not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to delete certificate", http.StatusInternalServerError)
		return
	}

	auth.LogAction(r.Context(), h.store, r, audit.CertDelete, "certificate", fingerprint)
	w.WriteHeader(http.StatusNoContent)
}

// LookupResponse is the response body for GET /certificates/lookup.
type LookupResponse struct {
	Domain        string    `json:"domain"`
	Port          int       `json:"port"`
	CommonName    string    `json:"commonName"`
	Fingerprint   string    `json:"fingerprint"`
	Issuer        string    `json:"issuer"`
	SANs          []string  `json:"sans"`
	NotBefore     time.Time `json:"notBefore"`
	NotAfter      time.Time `json:"notAfter"`
	DaysRemaining int       `json:"daysRemaining"`
	Valid         bool      `json:"valid"`
	Monitored     bool      `json:"monitored"`
	EndpointID    *string   `json:"endpointId"`
}

// @Summary      Live certificate lookup
// @Description  Dials the given domain over TLS in real-time and returns the leaf certificate. Also reports whether the domain is currently monitored in TLSentinel.
// @Tags         certificates
// @Produce      json
// @Param        domain  query  string  true   "Hostname to probe"
// @Param        port    query  int     false  "TCP port (default 443)"
// @Success      200  {object}  LookupResponse
// @Failure      400  {string}  string  "missing or invalid parameters"
// @Failure      502  {string}  string  "could not connect to host"
// @Router       /certificates/lookup [get]
func (h *Handler) Lookup(w http.ResponseWriter, r *http.Request) {
	domain := r.URL.Query().Get("domain")
	if domain == "" {
		http.Error(w, "domain is required", http.StatusBadRequest)
		return
	}

	port := 443
	if p := r.URL.Query().Get("port"); p != "" {
		var err error
		port, err = strconv.Atoi(p)
		if err != nil || port < 1 || port > 65535 {
			http.Error(w, "invalid port", http.StatusBadRequest)
			return
		}
	}

	cert, err := dialAndFetchCert(r.Context(), domain, port)
	if err != nil {
		slog.Warn("certificate lookup failed", "domain", domain, "port", port, "error", err)
		http.Error(w, "could not connect to host: "+err.Error(), http.StatusBadGateway)
		return
	}

	rec := ExtractCertificateRecord(cert)
	daysRemaining := int(time.Until(cert.NotAfter).Hours() / 24)

	resp := LookupResponse{
		Domain:        domain,
		Port:          port,
		CommonName:    rec.CommonName,
		Fingerprint:   rec.Fingerprint,
		Issuer:        cert.Issuer.CommonName,
		SANs:          rec.SANs,
		NotBefore:     cert.NotBefore,
		NotAfter:      cert.NotAfter,
		DaysRemaining: daysRemaining,
		Valid:          time.Now().Before(cert.NotAfter) && time.Now().After(cert.NotBefore),
	}

	// Check if this domain is monitored — best-effort, non-fatal.
	ep, err := h.store.GetEndpointByDNSName(r.Context(), domain)
	if err == nil {
		resp.Monitored = true
		resp.EndpointID = &ep.ID
	}

	response.JSON(w, http.StatusOK, resp)
}
