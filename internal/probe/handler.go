package probe

import (
	"encoding/json"
	"errors"
	"net/http"

	"go.uber.org/zap"

	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/tlsprofile"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"

	"github.com/go-chi/chi/v5"
)

// Handler handles scanner-specific API endpoints.
type Handler struct {
	store *db.Store
}

// NewHandler creates a new scanner Handler.
func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
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

	response.JSON(w, http.StatusOK, token)
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

	hosts, err := h.store.GetScannerHosts(r.Context(), id.ScannerID)
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

	if err := h.store.RecordScanResult(r.Context(), hostID, req); err != nil {
		zap.L().Error("failed to record scan result", zap.String("host_id", hostID), zap.Error(err))
		http.Error(w, "failed to record scan result", http.StatusInternalServerError)
		return
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

	if err := h.store.UpsertHostTLSProfile(r.Context(), hostID, req); err != nil {
		http.Error(w, "failed to record TLS profile", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
