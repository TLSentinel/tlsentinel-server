package models

// AlertThresholdsKey is the settings key for the certificate expiry alert
// thresholds (sorted slice of days, e.g. [30, 14, 7, 1]).
const AlertThresholdsKey = "alert_thresholds_days"

// DefaultAlertThresholds is used when the key is absent from the database.
var DefaultAlertThresholds = []int{30, 14, 7, 1}
