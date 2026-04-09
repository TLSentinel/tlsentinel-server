package audit

import (
	"net/http"
	"strconv"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

type Handler struct {
	store *db.Store
}

func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// @Summary      List audit logs
// @Description  Returns a paginated list of audit log entries. Supports filtering by username and action.
// @Tags         logs
// @Produce      json
// @Param        page       query  int     false  "Page number (default 1)"
// @Param        page_size  query  int     false  "Page size, max 200 (default 50)"
// @Param        username   query  string  false  "Filter by username"
// @Param        action     query  string  false  "Filter by action"
// @Success      200  {object}  models.AuditLogList
// @Failure      500  {string}  string  "internal server error"
// @Router       /logs/audit [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	pageSize, err := strconv.Atoi(r.URL.Query().Get("page_size"))
	if err != nil || pageSize < 1 {
		pageSize = 50
	}
	if pageSize > 200 {
		pageSize = 200
	}

	username := r.URL.Query().Get("username")
	action := r.URL.Query().Get("action")

	result, err := h.store.ListAuditLogs(r.Context(), page, pageSize, username, action)
	if err != nil {
		http.Error(w, "failed to list audit logs", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, result)
}
