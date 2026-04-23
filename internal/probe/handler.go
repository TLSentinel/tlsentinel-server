package probe

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/certificates"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/tlsprofile"
	"github.com/tlsentinel/tlsentinel-server/internal/trust"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"

	"github.com/go-chi/chi/v5"
)

// Handler handles scanner-specific API endpoints.
type Handler struct {
	store   *db.Store
	trustEv *trust.Evaluator
}

// NewHandler creates a new scanner Handler. trustEv may be nil in tests
// or in very early startup; the Result path tolerates a nil evaluator by
// skipping per-leaf trust evaluation and intermediates-pool updates.
func NewHandler(store *db.Store, trustEv *trust.Evaluator) *Handler {
	return &Handler{store: store, trustEv: trustEv}
}

// evaluateAndPersist runs the trust evaluator on the given leaf and
// persists the verdict to certificate_trust. Best-effort: failures are
// logged and swallowed so a slow DB or partial pool never blocks cert
// ingest.
func (h *Handler) evaluateAndPersist(ctx context.Context, cert *x509.Certificate, fingerprint string) {
	if h.trustEv == nil || cert == nil {
		return
	}
	verdicts := h.trustEv.Evaluate(cert)
	if len(verdicts) == 0 {
		return
	}
	if err := h.store.UpsertCertificateTrust(ctx, fingerprint, verdicts); err != nil {
		slog.Warn("failed to persist certificate_trust at ingest",
			"fingerprint", fingerprint, "error", err)
	}
}

// RequireScanner is a middleware that allows only scanner identities through.
// Returns 403 Forbidden for user JWTs or unauthenticated requests.
func RequireScanner(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.GetIdentity(r.Context())
		if !ok || id.Kind != auth.KindScanner {
			http.Error(w, "forbidden: scanner token required", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Config returns the scan configuration for the authenticated scanner.
//
// @Summary      Get scanner config
// @Description  Returns the scan interval and concurrency settings for the authenticated scanner
// @Tags         probe
// @Produce      json
// @Success      200  {object}  models.ScannerTokenResponse
// @Failure      403  {string}  string  "scanner token required"
// @Failure      500  {string}  string  "internal server error"
// @Router       /probe/config [get]
func (h *Handler) Config(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.GetIdentity(r.Context())

	token, err := h.store.GetScannerToken(r.Context(), id.ScannerID)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "scanner token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get scanner config", http.StatusInternalServerError)
		return
	}

	// Embed the scanner's discovery networks so the scanner only needs one API call.
	networks, err := h.store.ListNetworksForScanner(r.Context(), id.ScannerID)
	if err != nil {
		slog.Error("failed to list networks for scanner config",
			"scanner_id", id.ScannerID,
			"error", err,
		)
		// Non-fatal — return config without networks rather than failing.
		networks = nil
	}
	if networks == nil {
		token.Networks = []models.ScannerDiscoveryNetwork{}
	} else {
		token.Networks = networks
	}

	response.JSON(w, http.StatusOK, token)
}

// ReportDiscovery ingests TLS-bearing IP:port pairs found during a discovery sweep.
//
// @Summary      Report discovery results
// @Description  Upserts discovered IP:port pairs into the discovery inbox
// @Tags         probe
// @Accept       json
// @Param        request  body  models.DiscoveryReportRequest  true  "Discovery results"
// @Success      204
// @Failure      400  {string}  string  "invalid request"
// @Failure      403  {string}  string  "scanner token required"
// @Failure      500  {string}  string  "internal server error"
// @Router       /probe/discovery [post]
func (h *Handler) ReportDiscovery(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.GetIdentity(r.Context())

	var req models.DiscoveryReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Items) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if err := h.store.UpsertDiscoveryInboxItems(r.Context(), id.ScannerID, req.NetworkID, req.Items); err != nil {
		slog.Error("failed to upsert discovery inbox items",
			"scanner_id", id.ScannerID,
			"network_id", req.NetworkID,
			"error", err,
		)
		http.Error(w, "failed to record discovery results", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Hosts returns the list of enabled hosts assigned to the authenticated scanner.
//
// @Summary      Get scanner hosts
// @Description  Returns all enabled hosts assigned to the authenticated scanner
// @Tags         probe
// @Produce      json
// @Success      200  {array}   models.ScannerHost
// @Failure      403  {string}  string  "scanner token required"
// @Failure      500  {string}  string  "internal server error"
// @Router       /probe/hosts [get]
func (h *Handler) Hosts(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.GetIdentity(r.Context())

	hosts, err := h.store.GetScannerHostEndpoints(r.Context(), id.ScannerID)
	if err != nil {
		http.Error(w, "failed to get scanner hosts", http.StatusInternalServerError)
		return
	}

	if hosts == nil {
		hosts = []models.ScannerHost{}
	}
	response.JSON(w, http.StatusOK, hosts)
}

// Result records the outcome of a single host scan.
//
// @Summary      Post scan result
// @Description  Records the TLS scan result for a host
// @Tags         probe
// @Accept       json
// @Param        hostID   path  string                    true  "Host ID"
// @Param        request  body  models.ScanResultRequest  true  "Scan result payload"
// @Success      204
// @Failure      400  {string}  string  "invalid request"
// @Failure      403  {string}  string  "scanner token required"
// @Failure      500  {string}  string  "internal server error"
// @Router       /probe/hosts/{hostID}/result [post]
func (h *Handler) Result(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "hostID")

	var req models.ScanResultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Upsert each certificate the scanner found (leaf first, then chain).
	// If the leaf cert fails to ingest we clear ActiveFingerprint so we don't
	// create a dangling foreign-key reference in the hosts table.
	leafOK := len(req.PEMs) == 0 // no PEMs means error scan — leave fingerprint as-is
	for i, pemStr := range req.PEMs {
		cert, err := certificates.ParsePEMCertificate(pemStr)
		if err != nil {
			slog.Warn("scanner submitted unparseable PEM, skipping",
				"host_id", hostID,
				"index", i,
				"error", err,
			)
			continue
		}
		rec := certificates.ExtractCertificateRecord(cert)
		if _, err := h.store.InsertCertificate(r.Context(), rec); err != nil {
			slog.Error("failed to upsert scanner certificate",
				"host_id", hostID,
				"fingerprint", rec.Fingerprint,
				"error", err,
			)
			// Leaf failed — don't link a fingerprint that may not be in the DB.
			if i == 0 {
				req.ActiveFingerprint = nil
			}
			continue
		}
		if i == 0 {
			leafOK = true
			// Evaluate the freshly-ingested leaf against every enabled root
			// program so its row in the trust matrix is available immediately,
			// without waiting for the next weekly ReevaluateAll pass.
			h.evaluateAndPersist(r.Context(), cert, rec.Fingerprint)
		} else if h.trustEv != nil {
			// Opportunistically add chain intermediates to the shared pool so
			// later leaves whose issuer happens to be this cert can build a
			// complete path. No-op for non-CA certs.
			h.trustEv.AddIntermediate(cert)
		}
	}
	if !leafOK {
		req.ActiveFingerprint = nil
	}

	if err := h.store.RecordScanResult(r.Context(), hostID, req); err != nil {
		slog.Error("failed to record scan result", "host_id", hostID, "error", err)
		http.Error(w, "failed to record scan result", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// SAMLEndpoints returns the list of enabled SAML endpoints assigned to the authenticated scanner.
//
// @Summary      Get scanner SAML endpoints
// @Description  Returns all enabled SAML endpoints assigned to the authenticated scanner
// @Tags         probe
// @Produce      json
// @Success      200  {array}   models.ScannerSAMLEndpoint
// @Failure      403  {string}  string  "scanner token required"
// @Failure      500  {string}  string  "internal server error"
// @Router       /probe/saml [get]
func (h *Handler) SAMLEndpoints(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.GetIdentity(r.Context())

	endpoints, err := h.store.GetScannerSAMLEndpoints(r.Context(), id.ScannerID)
	if err != nil {
		http.Error(w, "failed to get SAML endpoints", http.StatusInternalServerError)
		return
	}

	if endpoints == nil {
		endpoints = []models.ScannerSAMLEndpoint{}
	}
	response.JSON(w, http.StatusOK, endpoints)
}

// SAMLResult records the outcome of a single SAML metadata fetch.
//
// @Summary      Post SAML scan result
// @Description  Records the certificate(s) extracted from a SAML metadata fetch
// @Tags         probe
// @Accept       json
// @Param        endpointID  path  string                        true  "SAML Endpoint ID"
// @Param        request     body  models.SAMLScanResultRequest  true  "SAML scan result payload"
// @Success      204
// @Failure      400  {string}  string  "invalid request"
// @Failure      403  {string}  string  "scanner token required"
// @Failure      500  {string}  string  "internal server error"
// @Router       /probe/saml/{endpointID}/result [post]
func (h *Handler) SAMLResult(w http.ResponseWriter, r *http.Request) {
	endpointID := chi.URLParam(r, "endpointID")

	var req models.SAMLScanResultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Record endpoint scan state (timestamps, error tracking) — no ActiveFingerprint
	// on the SAML path; cert linkage is handled per-cert below.
	scanReq := models.ScanResultRequest{
		Error: req.Error,
	}
	if err := h.store.RecordScanResult(r.Context(), endpointID, scanReq); err != nil {
		slog.Error("failed to record SAML scan result", "endpoint_id", endpointID, "error", err)
		http.Error(w, "failed to record SAML scan result", http.StatusInternalServerError)
		return
	}

	// Persist parsed metadata + raw XML + sha256 when the scan succeeded and the
	// scanner supplied them. History row append is O(1) deduped on (endpoint_id, sha256).
	if req.Error == nil && req.MetadataXML != nil && req.MetadataXMLSha256 != nil {
		var metaJSON json.RawMessage
		if req.Metadata != nil {
			if buf, err := json.Marshal(req.Metadata); err == nil {
				metaJSON = buf
			} else {
				slog.Warn("failed to marshal SAML metadata payload", "endpoint_id", endpointID, "error", err)
			}
		}
		if err := h.store.UpsertSAMLMetadata(r.Context(), endpointID, metaJSON, *req.MetadataXML, *req.MetadataXMLSha256); err != nil {
			slog.Error("failed to persist SAML metadata", "endpoint_id", endpointID, "error", err)
			// Continue — cert persistence below still useful even if metadata write failed.
		}
	}

	// Upsert each certificate and link it to the endpoint with its declared use.
	for i, entry := range req.Certs {
		use := entry.Use
		if use != "signing" && use != "encryption" {
			slog.Warn("scanner submitted SAML cert with unrecognised use, skipping",
				"endpoint_id", endpointID,
				"index", i,
				"use", use,
			)
			continue
		}

		cert, err := certificates.ParsePEMCertificate(entry.PEM)
		if err != nil {
			slog.Warn("scanner submitted unparseable SAML PEM, skipping",
				"endpoint_id", endpointID,
				"index", i,
				"use", use,
				"error", err,
			)
			continue
		}
		rec := certificates.ExtractCertificateRecord(cert)
		if _, err := h.store.InsertCertificate(r.Context(), rec); err != nil {
			slog.Error("failed to upsert SAML certificate",
				"endpoint_id", endpointID,
				"fingerprint", rec.Fingerprint,
				"use", use,
				"error", err,
			)
			continue
		}
		if err := h.store.UpsertEndpointCert(r.Context(), endpointID, rec.Fingerprint, use); err != nil {
			slog.Error("failed to link SAML cert to endpoint",
				"endpoint_id", endpointID,
				"fingerprint", rec.Fingerprint,
				"use", use,
				"error", err,
			)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// TLSProfile records the TLS profile probed by the scanner for a host.
// Cipher suite names are normalised to IANA form before storage.
//
// @Summary      Post TLS profile
// @Description  Records the TLS version and cipher suite profile for a host
// @Tags         probe
// @Accept       json
// @Param        hostID   path  string                          true  "Host ID"
// @Param        request  body  models.TLSProfileIngestRequest  true  "TLS profile payload"
// @Success      204
// @Failure      400  {string}  string  "invalid request"
// @Failure      403  {string}  string  "scanner token required"
// @Failure      500  {string}  string  "internal server error"
// @Router       /probe/hosts/{hostID}/tls-profile [post]
func (h *Handler) TLSProfile(w http.ResponseWriter, r *http.Request) {
	hostID := chi.URLParam(r, "hostID")

	var req models.TLSProfileIngestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Normalise cipher names to IANA form regardless of scanner backend.
	req.CipherSuites = tlsprofile.NormalizeCipherNames(req.CipherSuites)
	if req.SelectedCipher != nil {
		norm := tlsprofile.NormalizeCipherName(*req.SelectedCipher)
		req.SelectedCipher = &norm
	}

	if err := h.store.UpsertEndpointTLSProfile(r.Context(), hostID, req); err != nil {
		http.Error(w, "failed to record TLS profile", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
