package audit

const (
	// Auth
	Login       = "auth.login"
	LoginFailed = "auth.login_failed"
	OIDCLogin   = "auth.oidc_login"

	// TOTP / second factor
	TOTPEnable             = "auth.totp.enable"
	TOTPDisable            = "auth.totp.disable"
	TOTPVerifyFailed       = "auth.totp.verify_failed"
	TOTPRecoveryUsed       = "auth.totp.recovery_used"
	TOTPRecoveryRegenerate = "auth.totp.recovery_regenerate"

	// Endpoints
	EndpointCreate = "endpoint.create"
	EndpointUpdate = "endpoint.update"
	EndpointDelete = "endpoint.delete"

	// Certificates
	CertIngest = "certificate.ingest"
	CertDelete = "certificate.delete"

	// Scanners
	ScannerCreate           = "scanner.create"
	ScannerUpdate           = "scanner.update"
	ScannerDelete           = "scanner.delete"
	ScannerSetDefault       = "scanner.set_default"
	ScannerRegenerateToken  = "scanner.regenerate_token"

	// Users
	UserCreate         = "user.create"
	UserUpdate         = "user.update"
	UserDelete         = "user.delete"
	UserPasswordChange = "user.password_change"
	UserEnabledChange  = "user.enabled_change"
	MyPasswordChange   = "me.password_change"

	// Groups
	GroupCreate = "group.create"
	GroupUpdate = "group.update"
	GroupDelete = "group.delete"

	// Discovery
	DiscoveryNetworkCreate = "discovery.network.create"
	DiscoveryNetworkUpdate = "discovery.network.update"
	DiscoveryNetworkDelete = "discovery.network.delete"
	DiscoveryInboxPromote  = "discovery.inbox.promote"

	// Settings
	MailConfigUpdate      = "settings.mail_config_update"
	AlertThresholdsUpdate = "settings.alert_thresholds_update"

	// Maintenance — emitted for both manual "Run Now" and scheduler-triggered
	// runs. The details payload carries "trigger": "manual" or "scheduled" so
	// the two can be distinguished without relying on the username column.
	MaintenancePurgeScanHistory       = "maintenance.purge_scan_history.run"
	MaintenancePurgeExpiryAlerts      = "maintenance.purge_expiry_alerts.run"
	MaintenancePurgeUnreferencedCerts = "maintenance.purge_unreferenced_certs.run"
	MaintenancePurgeAuditLogs         = "maintenance.purge_audit_logs.run"
	MaintenanceRefreshRootStores      = "maintenance.refresh_root_stores.run"
	MaintenanceExpiryAlerts           = "maintenance.expiry_alerts.run"
)
