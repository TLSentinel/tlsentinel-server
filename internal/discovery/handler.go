package discovery

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
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

// validateRange accepts CIDR notation or a hyphenated IPv4 range.
// Returns a human-readable error string, or "" if valid.
func validateRange(s string) string {
	s = strings.TrimSpace(s)

	// CIDR — net.ParseCIDR also validates that host bits are zero.
	if _, _, err := net.ParseCIDR(s); err == nil {
		return ""
	}

	// Hyphenated range: <start>-<end>
	idx := strings.Index(s, "-")
	if idx > 0 {
		startStr := strings.TrimSpace(s[:idx])
		endStr := strings.TrimSpace(s[idx+1:])

		startIP := net.ParseIP(startStr).To4()
		endIP := net.ParseIP(endStr).To4()

		if startIP == nil {
			return fmt.Sprintf("invalid start IP %q in range", startStr)
		}
		if endIP == nil {
			return fmt.Sprintf("invalid end IP %q in range", endStr)
		}
		if bytes.Compare(startIP, endIP) > 0 {
			return fmt.Sprintf("range start %s must not be greater than range end %s", startStr, endStr)
		}
		return ""
	}

	return "range must be CIDR notation (e.g. 10.0.0.0/24) or a hyphenated range (e.g. 192.168.1.1-192.168.1.254)"
}

// ---------------------------------------------------------------------------
// Networks
// ---------------------------------------------------------------------------

// @Summary      List discovery networks
// @Description  Returns a paginated list of configured discovery networks.
// @Tags         discovery
// @Produce      json
// @Param        page       query  int  false  "Page number (default 1)"
// @Param        page_size  query  int  false  "Page size (default 20, max 100)"
// @Success      200  {object}  models.DiscoveryNetworkList
// @Failure      500  {string}  string  "internal server error"
// @Router       /discovery/networks [get]
func (h *Handler) ListNetworks(w http.ResponseWriter, r *http.Request) {
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

	result, err := h.store.ListDiscoveryNetworks(r.Context(), page, pageSize)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if result.Items == nil {
		result.Items = []models.DiscoveryNetwork{}
	}
	response.JSON(w, http.StatusOK, result)
}

// @Summary      Get a discovery network
// @Description  Returns a single discovery network by ID.
// @Tags         discovery
// @Produce      json
// @Param        networkID  path      string  true  "Network ID"
// @Success      200  {object}  models.DiscoveryNetwork
// @Failure      404  {string}  string  "not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /discovery/networks/{networkID} [get]
func (h *Handler) GetNetwork(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "networkID")
	net, err := h.store.GetDiscoveryNetwork(r.Context(), id)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "discovery network not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, net)
}

// @Summary      Create a discovery network
// @Description  Creates a new network range for discovery scanning.
// @Tags         discovery
// @Accept       json
// @Produce      json
// @Param        request  body      models.CreateDiscoveryNetworkRequest  true  "Network payload"
// @Success      201  {object}  models.DiscoveryNetwork
// @Failure      400  {string}  string  "invalid request"
// @Failure      500  {string}  string  "internal server error"
// @Router       /discovery/networks [post]
func (h *Handler) CreateNetwork(w http.ResponseWriter, r *http.Request) {
	var req models.CreateDiscoveryNetworkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Range == "" {
		http.Error(w, "range is required", http.StatusBadRequest)
		return
	}
	if msg := validateRange(req.Range); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	if len(req.Ports) == 0 {
		http.Error(w, "at least one port is required", http.StatusBadRequest)
		return
	}
	if req.CronExpression == "" {
		http.Error(w, "cronExpression is required", http.StatusBadRequest)
		return
	}

	net, err := h.store.InsertDiscoveryNetwork(r.Context(), req)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.DiscoveryNetworkCreate, "discovery_network", net.ID)
	response.JSON(w, http.StatusCreated, net)
}

// @Summary      Update a discovery network
// @Description  Replaces all mutable fields of a discovery network.
// @Tags         discovery
// @Accept       json
// @Produce      json
// @Param        networkID  path      string                               true  "Network ID"
// @Param        request    body      models.UpdateDiscoveryNetworkRequest  true  "Network payload"
// @Success      200  {object}  models.DiscoveryNetwork
// @Failure      400  {string}  string  "invalid request"
// @Failure      404  {string}  string  "not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /discovery/networks/{networkID} [put]
func (h *Handler) UpdateNetwork(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "networkID")

	var req models.UpdateDiscoveryNetworkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Range == "" {
		http.Error(w, "range is required", http.StatusBadRequest)
		return
	}
	if msg := validateRange(req.Range); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	if len(req.Ports) == 0 {
		http.Error(w, "at least one port is required", http.StatusBadRequest)
		return
	}
	if req.CronExpression == "" {
		http.Error(w, "cronExpression is required", http.StatusBadRequest)
		return
	}

	net, err := h.store.UpdateDiscoveryNetwork(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "discovery network not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.DiscoveryNetworkUpdate, "discovery_network", id)
	response.JSON(w, http.StatusOK, net)
}

// @Summary      Delete a discovery network
// @Description  Deletes a discovery network and cascades to its inbox entries.
// @Tags         discovery
// @Param        networkID  path  string  true  "Network ID"
// @Success      204
// @Failure      404  {string}  string  "not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /discovery/networks/{networkID} [delete]
func (h *Handler) DeleteNetwork(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "networkID")

	if err := h.store.DeleteDiscoveryNetwork(r.Context(), id); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "discovery network not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.DiscoveryNetworkDelete, "discovery_network", id)
	w.WriteHeader(http.StatusNoContent)
}
