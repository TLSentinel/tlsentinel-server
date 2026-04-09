package models

// AlertThresholdsKey is the settings key for the certificate expiry alert
// thresholds (sorted slice of days, e.g. [30, 14, 7, 1]).
const AlertThresholdsKey = "alert_thresholds_days"

// DefaultAlertThresholds is used when the key is absent from the database.
var DefaultAlertThresholds = []int{30, 14, 7, 1}

// ScanHistoryRetentionKey is the settings key for the scan history retention
// window in days. History older than this is eligible for purging.
const ScanHistoryRetentionKey = "scan_history_retention_days"

// DefaultScanHistoryRetentionDays is used when the key is absent from the database.
const DefaultScanHistoryRetentionDays = 90

// ScheduledJob represents a named recurring job whose schedule is stored in the DB.
type ScheduledJob struct {
	Name           string  `json:"name"`
	DisplayName    string  `json:"displayName"`
	CronExpression string  `json:"cronExpression"`
	Enabled        bool    `json:"enabled"`
	LastRunAt      *string `json:"lastRunAt"`  // ISO 8601 or null
	LastRunStatus  *string `json:"lastRunStatus"`
}

// AuditLogRetentionKey is the settings key for the audit log retention window in days.
const AuditLogRetentionKey = "audit_log_retention_days"

// DefaultAuditLogRetentionDays is used when the key is absent from the database.
const DefaultAuditLogRetentionDays = 365

// Known job names.
const (
	JobExpiryAlerts      = "expiry_alerts"
	JobPurgeScanHistory  = "purge_scan_history"
	JobPurgeAuditLogs    = "purge_audit_logs"
	JobPurgeExpiryAlerts = "purge_expiry_alerts"
)
