package groups

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/ptr"
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
		UserID:       ptr.IfNonEmpty(identity.UserID),
		Username:     identity.Username,
		Action:       action,
		ResourceType: &resType,
		ResourceID:   &resID,
		IPAddress:    &ip,
	}); err != nil {
		slog.Error("audit log failed", "err", err)
	}
}


type CreateGroupRequest struct {
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	HostIDs     []string `json:"hostIds"`
}

type UpdateGroupRequest struct {
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	HostIDs     []string `json:"hostIds"`
}

// List returns a paginated list of groups.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	list, err := h.store.ListGroups(r.Context(), page, pageSize)
	if err != nil {
		http.Error(w, "failed to list groups", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// Get returns a single group by ID.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "groupID")
	group, err := h.store.GetGroupByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "group not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to get group", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(group)
}

// GetEndpoints returns the endpoint IDs assigned to a group.
func (h *Handler) GetEndpoints(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "groupID")
	ids, err := h.store.ListGroupHostIDs(r.Context(), id)
	if err != nil {
		http.Error(w, "failed to get group hosts", http.StatusInternalServerError)
		return
	}
	if ids == nil {
		ids = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ids)
}

// Create creates a new group and assigns hosts.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	group, err := h.store.InsertGroup(r.Context(), req.Name, req.Description)
	if err != nil {
		http.Error(w, "failed to create group", http.StatusInternalServerError)
		return
	}

	if len(req.HostIDs) > 0 {
		if err := h.store.ReplaceGroupHosts(r.Context(), group.ID, req.HostIDs); err != nil {
			if errors.Is(err, db.ErrInvalidInput) {
				http.Error(w, "one or more host ids are invalid", http.StatusBadRequest)
				return
			}
			http.Error(w, "failed to assign hosts", http.StatusInternalServerError)
			return
		}
	}

	h.logAudit(r, audit.GroupCreate, "group", group.ID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(group)
}

// Update updates a group's name, description, and host assignments.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "groupID")

	var req UpdateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	group, err := h.store.UpdateGroup(r.Context(), id, req.Name, req.Description)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "group not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update group", http.StatusInternalServerError)
		return
	}

	if err := h.store.ReplaceGroupHosts(r.Context(), id, req.HostIDs); err != nil {
		if errors.Is(err, db.ErrInvalidInput) {
			http.Error(w, "one or more host ids are invalid", http.StatusBadRequest)
			return
		}
		http.Error(w, "failed to update hosts", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.GroupUpdate, "group", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(group)
}

// Delete removes a group by ID.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "groupID")

	if err := h.store.DeleteGroup(r.Context(), id); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "group not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to delete group", http.StatusInternalServerError)
		return
	}

	h.logAudit(r, audit.GroupDelete, "group", id)
	w.WriteHeader(http.StatusNoContent)
}
