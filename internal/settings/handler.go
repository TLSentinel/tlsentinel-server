package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"github.com/tlsentinel/tlsentinel-server/internal/audit"
	"github.com/tlsentinel/tlsentinel-server/internal/auth"
	"github.com/tlsentinel/tlsentinel-server/internal/db"
	"github.com/tlsentinel/tlsentinel-server/internal/models"
	"github.com/tlsentinel/tlsentinel-server/internal/rootstore"
	"github.com/tlsentinel/tlsentinel-server/internal/scheduler"
	"github.com/tlsentinel/tlsentinel-server/pkg/response"
)

// Handler handles HTTP requests for the settings endpoints.
type Handler struct {
	store *db.Store
	sched *scheduler.Scheduler
}

// NewHandler creates a new Handler.
func NewHandler(store *db.Store, sched *scheduler.Scheduler) *Handler {
	return &Handler{store: store, sched: sched}
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

	auth.Log(r.Context(), h.store, r, audit.Entry{Action: audit.AlertThresholdsUpdate})
	response.JSON(w, http.StatusOK, alertThresholdsResponse{Thresholds: sorted})
}

// DefaultAlertThresholds returns the hardcoded defaults as an HTTP response.
// Useful for the UI to show what will be used when no config is saved.
func DefaultAlertThresholds() alertThresholdsResponse {
	return alertThresholdsResponse{Thresholds: models.DefaultAlertThresholds}
}

// scanHistoryRetentionResponse is the response envelope for scan history retention endpoints.
type scanHistoryRetentionResponse struct {
	Days int `json:"days"`
}

// @Summary      Get scan history retention
// @Tags         maintenance
// @Produce      json
// @Success      200  {object}  scanHistoryRetentionResponse
// @Router       /maintenance/scan-history-retention [get]
func (h *Handler) GetScanHistoryRetention(w http.ResponseWriter, r *http.Request) {
	days, err := h.store.GetScanHistoryRetentionDays(r.Context())
	if err != nil {
		http.Error(w, "failed to get scan history retention", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, scanHistoryRetentionResponse{Days: days})
}

// @Summary      List scheduled jobs
// @Tags         maintenance
// @Produce      json
// @Success      200  {array}   models.ScheduledJob
// @Router       /maintenance/scheduled-jobs [get]
func (h *Handler) GetScheduledJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.store.ListScheduledJobs(r.Context())
	if err != nil {
		http.Error(w, "failed to get scheduled jobs", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, jobs)
}

// @Summary      Update scheduled job
// @Description  Updates the cron expression and enabled state for a named scheduled job. Hot-reloads the scheduler immediately.
// @Tags         maintenance
// @Accept       json
// @Produce      json
// @Param        name     path   string  true  "Job name"
// @Param        request  body   object  true  "Job update payload"
// @Success      200  {object}  models.ScheduledJob
// @Failure      400  {string}  string  "invalid request"
// @Failure      404  {string}  string  "job not found"
// @Failure      500  {string}  string  "internal server error"
// @Router       /maintenance/scheduled-jobs/{name} [put]
func (h *Handler) UpdateScheduledJob(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var req struct {
		CronExpression string `json:"cronExpression"`
		Enabled        bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.CronExpression == "" {
		http.Error(w, "cronExpression is required", http.StatusBadRequest)
		return
	}
	job, err := h.store.UpsertScheduledJob(r.Context(), name, req.CronExpression, req.Enabled)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "job not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to update scheduled job", http.StatusInternalServerError)
		return
	}
	// Hot-reload the scheduler if we have a registered function for this job.
	if fn := h.sched.Func(name); fn != nil {
		h.sched.Reload(name, req.CronExpression, req.Enabled, fn)
	}

	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "settings.scheduled_job.update"})
	response.JSON(w, http.StatusOK, job)
}

// @Summary      Set scan history retention
// @Tags         maintenance
// @Accept       json
// @Produce      json
// @Param        request  body      scanHistoryRetentionResponse  true  "Retention days"
// @Success      200  {object}  scanHistoryRetentionResponse
// @Router       /maintenance/scan-history-retention [put]
func (h *Handler) SetScanHistoryRetention(w http.ResponseWriter, r *http.Request) {
	var req scanHistoryRetentionResponse
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Days < 1 || req.Days > 3650 {
		http.Error(w, "retention must be between 1 and 3650 days", http.StatusBadRequest)
		return
	}
	if err := h.store.SetScanHistoryRetentionDays(r.Context(), req.Days); err != nil {
		http.Error(w, "failed to save scan history retention", http.StatusInternalServerError)
		return
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "settings.scan_history_retention.update"})
	response.JSON(w, http.StatusOK, scanHistoryRetentionResponse{Days: req.Days})
}

// purgeScanHistoryResponse is the response envelope for a purge run.
type purgeScanHistoryResponse struct {
	Deleted int64 `json:"deleted"`
}

// @Summary      Run purge scan history
// @Description  Immediately purges scan history rows older than the configured retention window. Always preserves the most recent entry per endpoint.
// @Tags         maintenance
// @Produce      json
// @Success      200  {object}  purgeScanHistoryResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /maintenance/run/purge-scan-history [post]
func (h *Handler) RunPurgeScanHistory(w http.ResponseWriter, r *http.Request) {
	days, err := h.store.GetScanHistoryRetentionDays(r.Context())
	if err != nil {
		http.Error(w, "failed to get retention setting", http.StatusInternalServerError)
		return
	}
	deleted, err := h.store.PurgeScanHistory(r.Context(), days)
	if err != nil {
		http.Error(w, "purge failed", http.StatusInternalServerError)
		return
	}
	if err := h.store.UpdateJobLastRun(r.Context(), models.JobPurgeScanHistory,
		fmt.Sprintf("removed %d rows (manual run)", deleted)); err != nil {
		slog.Warn("failed to update job last run after manual purge", "err", err)
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "maintenance.purge_scan_history.run"})
	response.JSON(w, http.StatusOK, purgeScanHistoryResponse{Deleted: deleted})
}

// purgeExpiryAlertsResponse is the response envelope for an expiry alerts purge run.
type purgeExpiryAlertsResponse struct {
	Deleted int64 `json:"deleted"`
}

// @Summary      Run purge expiry alerts
// @Description  Immediately purges certificate_expiry_alerts rows for certificates that have already expired.
// @Tags         maintenance
// @Produce      json
// @Success      200  {object}  purgeExpiryAlertsResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /maintenance/run/purge-expiry-alerts [post]
func (h *Handler) RunPurgeExpiryAlerts(w http.ResponseWriter, r *http.Request) {
	deleted, err := h.store.PurgeExpiryAlerts(r.Context())
	if err != nil {
		http.Error(w, "purge failed", http.StatusInternalServerError)
		return
	}
	if err := h.store.UpdateJobLastRun(r.Context(), models.JobPurgeExpiryAlerts,
		fmt.Sprintf("removed %d rows (manual run)", deleted)); err != nil {
		slog.Warn("failed to update job last run after manual expiry alerts purge", "err", err)
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "maintenance.purge_expiry_alerts.run"})
	response.JSON(w, http.StatusOK, purgeExpiryAlertsResponse{Deleted: deleted})
}

// purgeUnreferencedCertsResponse is the response envelope for an unreferenced-cert purge run.
type purgeUnreferencedCertsResponse struct {
	Deleted int64 `json:"deleted"`
}

// @Summary      Run purge unreferenced certificates
// @Description  Immediately deletes certificates that are no longer referenced by any endpoint, scan-history row, discovery-inbox entry, root store, or other certificate's issuer chain. Trust anchors are never deleted.
// @Tags         maintenance
// @Produce      json
// @Success      200  {object}  purgeUnreferencedCertsResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /maintenance/run/purge-unreferenced-certs [post]
func (h *Handler) RunPurgeUnreferencedCerts(w http.ResponseWriter, r *http.Request) {
	deleted, err := h.store.PurgeUnreferencedCerts(r.Context())
	if err != nil {
		http.Error(w, "purge failed", http.StatusInternalServerError)
		return
	}
	if err := h.store.UpdateJobLastRun(r.Context(), models.JobPurgeUnreferencedCerts,
		fmt.Sprintf("removed %d rows (manual run)", deleted)); err != nil {
		slog.Warn("failed to update job last run after manual unreferenced certs purge", "err", err)
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "maintenance.purge_unreferenced_certs.run"})
	response.JSON(w, http.StatusOK, purgeUnreferencedCertsResponse{Deleted: deleted})
}

// auditLogRetentionResponse is the response envelope for audit log retention endpoints.
type auditLogRetentionResponse struct {
	Days int `json:"days"`
}

// @Summary      Get audit log retention
// @Tags         maintenance
// @Produce      json
// @Success      200  {object}  auditLogRetentionResponse
// @Router       /maintenance/audit-log-retention [get]
func (h *Handler) GetAuditLogRetention(w http.ResponseWriter, r *http.Request) {
	days, err := h.store.GetAuditLogRetentionDays(r.Context())
	if err != nil {
		http.Error(w, "failed to get audit log retention", http.StatusInternalServerError)
		return
	}
	response.JSON(w, http.StatusOK, auditLogRetentionResponse{Days: days})
}

// @Summary      Set audit log retention
// @Tags         maintenance
// @Accept       json
// @Produce      json
// @Param        request  body      auditLogRetentionResponse  true  "Retention days"
// @Success      200  {object}  auditLogRetentionResponse
// @Router       /maintenance/audit-log-retention [put]
func (h *Handler) SetAuditLogRetention(w http.ResponseWriter, r *http.Request) {
	var req auditLogRetentionResponse
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Days < 1 || req.Days > 3650 {
		http.Error(w, "retention must be between 1 and 3650 days", http.StatusBadRequest)
		return
	}
	if err := h.store.SetAuditLogRetentionDays(r.Context(), req.Days); err != nil {
		http.Error(w, "failed to save audit log retention", http.StatusInternalServerError)
		return
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "settings.audit_log_retention.update"})
	response.JSON(w, http.StatusOK, auditLogRetentionResponse{Days: req.Days})
}

// purgeAuditLogsResponse is the response envelope for an audit log purge run.
type purgeAuditLogsResponse struct {
	Deleted int64 `json:"deleted"`
}

// @Summary      Run purge audit logs
// @Description  Immediately purges audit log entries older than the configured retention window.
// @Tags         maintenance
// @Produce      json
// @Success      200  {object}  purgeAuditLogsResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /maintenance/run/purge-audit-logs [post]
func (h *Handler) RunPurgeAuditLogs(w http.ResponseWriter, r *http.Request) {
	days, err := h.store.GetAuditLogRetentionDays(r.Context())
	if err != nil {
		http.Error(w, "failed to get retention setting", http.StatusInternalServerError)
		return
	}
	deleted, err := h.store.PurgeAuditLogs(r.Context(), days)
	if err != nil {
		http.Error(w, "purge failed", http.StatusInternalServerError)
		return
	}
	if err := h.store.UpdateJobLastRun(r.Context(), models.JobPurgeAuditLogs,
		fmt.Sprintf("removed %d rows (manual run)", deleted)); err != nil {
		slog.Warn("failed to update job last run after manual audit log purge", "err", err)
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "maintenance.purge_audit_logs.run"})
	response.JSON(w, http.StatusOK, purgeAuditLogsResponse{Deleted: deleted})
}

// refreshRootStoresResponse is the response envelope for a root store refresh run.
type refreshRootStoresResponse struct {
	Status string `json:"status"`
}

// @Summary      Run refresh root stores
// @Description  Fetches CCADB root bundles and repopulates root_stores / root_store_anchors. Synchronous; may take up to a minute.
// @Tags         maintenance
// @Produce      json
// @Success      200  {object}  refreshRootStoresResponse
// @Failure      500  {string}  string  "internal server error"
// @Router       /maintenance/run/refresh-root-stores [post]
func (h *Handler) RunRefreshRootStores(w http.ResponseWriter, r *http.Request) {
	if err := rootstore.Refresh(r.Context(), h.store, slog.Default()); err != nil {
		slog.Error("manual root store refresh failed", "err", err)
		http.Error(w, "refresh failed", http.StatusInternalServerError)
		return
	}
	if err := h.store.UpdateJobLastRun(r.Context(), models.JobRefreshRootStores, "manual run"); err != nil {
		slog.Warn("failed to update job last run after manual root store refresh", "err", err)
	}
	auth.Log(r.Context(), h.store, r, audit.Entry{Action: "maintenance.refresh_root_stores.run"})
	response.JSON(w, http.StatusOK, refreshRootStoresResponse{Status: "ok"})
}
