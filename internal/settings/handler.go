package settings

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

// Handler handles HTTP requests for the settings endpoints.
type Handler struct {
	store *db.Store
}

// NewHandler creates a new Handler.
func NewHandler(store *db.Store) *Handler {
	return &Handler{store: store}
}

// alertThresholdsResponse is the response envelope for alert threshold endpoints.
type alertThresholdsResponse struct {
	Thresholds []int `json:"thresholds"`
}

// @Summary      Get alert thresholds
// @Description  Returns the configured certificate expiry alert thresholds in days. Falls back to defaults when not explicitly configured.
// @Tags         settings
// @Produce      json
// @Success      200  {object}  alertThresholdsResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /settings/alert-thresholds [get]
func (h *Handler) GetAlertThresholds(w http.ResponseWriter, r *http.Request) {
	thresholds, err := h.store.GetAlertThresholds(r.Context())
	if err != nil {
		http.Error(w, "failed to get alert thresholds", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, alertThresholdsResponse{Thresholds: thresholds})
}

// @Summary      Update alert thresholds
// @Description  Sets the certificate expiry alert thresholds in days. Must be a non-empty list of unique positive integers, each between 1 and 365.
// @Tags         settings
// @Accept       json
// @Produce      json
// @Param        request  body      alertThresholdsResponse  true  "Alert thresholds payload"
// @Success      200  {object}  alertThresholdsResponse
// @Failure      400  {string}  string  "invalid request"
// @Failure      500  {string}  string  "internal server error"
// @Router       /settings/alert-thresholds [put]
func (h *Handler) SetAlertThresholds(w http.ResponseWriter, r *http.Request) {
	var req alertThresholdsResponse
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Thresholds) == 0 {
		http.Error(w, "thresholds must contain at least one value", http.StatusBadRequest)
		return
	}

	seen := make(map[int]bool, len(req.Thresholds))
	for _, t := range req.Thresholds {
		if t < 1 || t > 365 {
			http.Error(w, "each threshold must be between 1 and 365 days", http.StatusBadRequest)
			return
		}
		if seen[t] {
			http.Error(w, "thresholds must be unique", http.StatusBadRequest)
			return
		}
		seen[t] = true
	}

	// Store descending so the scheduler naturally processes largest threshold first.
	sorted := make([]int, len(req.Thresholds))
	copy(sorted, req.Thresholds)
	sort.Sort(sort.Reverse(sort.IntSlice(sorted)))

	if err := h.store.SetAlertThresholds(r.Context(), sorted); err != nil {
		http.Error(w, "failed to save alert thresholds", http.StatusInternalServerError)
		return
	}

	response.JSON(w, http.StatusOK, alertThresholdsResponse{Thresholds: sorted})
}

// DefaultAlertThresholds returns the hardcoded defaults as an HTTP response.
// Useful for the UI to show what will be used when no config is saved.
func DefaultAlertThresholds() alertThresholdsResponse {
	return alertThresholdsResponse{Thresholds: models.DefaultAlertThresholds}
}
