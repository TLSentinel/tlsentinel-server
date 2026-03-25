package audit

const (
	// Auth
	Login       = "auth.login"
	LoginFailed = "auth.login_failed"
	OIDCLogin   = "auth.oidc_login"

	// Endpoints
	EndpointCreate = "endpoint.create"
	EndpointUpdate = "endpoint.update"
	EndpointDelete = "endpoint.delete"

	// Certificates
	CertDelete = "certificate.delete"

	// Scanners
	ScannerCreate     = "scanner.create"
	ScannerUpdate     = "scanner.update"
	ScannerDelete     = "scanner.delete"
	ScannerSetDefault = "scanner.set_default"

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

	// Settings
	MailConfigUpdate      = "settings.mail_config_update"
	AlertThresholdsUpdate = "settings.alert_thresholds_update"
)
