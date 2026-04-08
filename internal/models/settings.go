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
