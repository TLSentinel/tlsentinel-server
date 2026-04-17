package permission

const (
	// Endpoints
	EndpointsView = "endpoints:view"
	EndpointsEdit = "endpoints:edit"

	// Certificates
	CertsView = "certs:view"
	CertsEdit = "certs:edit"

	// Self — any authenticated user can access their own profile
	SelfRead = "self:read"

	// Scanners
	ScannersView = "scanners:view"
	ScannersEdit = "scanners:edit"

	// Users
	UsersView = "users:view"
	UsersEdit = "users:edit"

	// API keys (cross-user management; self-service is always allowed)
	APIKeysAdmin = "apikeys:admin"

	// Groups
	GroupsView = "groups:view"
	GroupsEdit = "groups:edit"

	// Settings (mail config, general, etc.)
	SettingsView = "settings:view"
	SettingsEdit = "settings:edit"

	// Logs (audit log, job run history, etc.)
	LogsView = "logs:view"

	// Maintenance (scheduled jobs, purge tasks, etc.)
	Maintenance = "maintenance"

	// Tags
	TagsView = "tags:view"
	TagsEdit = "tags:edit"

	// Discovery
	DiscoveryView = "discovery:view"
	DiscoveryEdit = "discovery:edit"

	// Wildcard — grants everything (admin only)
	Wildcard = "*"

	// Roles
	RoleAdmin    = "admin"
	RoleOperator = "operator"
	RoleViewer   = "viewer"
)

// RolePermissions maps a role name to its set of granted permissions.
// Admin receives the wildcard and is never explicitly listed here —
// the middleware short-circuits on "*" before checking individual permissions.
var RolePermissions = map[string][]string{
	RoleAdmin: {
		Wildcard,
	},
	RoleViewer: {
		EndpointsView,
		CertsView,
		GroupsView,
		TagsView,
		DiscoveryView,
		SelfRead,
	},
	RoleOperator: {
		EndpointsView,
		EndpointsEdit,
		CertsView,
		ScannersView,
		UsersView,
		GroupsView,
		SettingsView,
		TagsView,
		TagsEdit,
		LogsView,
		Maintenance,
		DiscoveryView,
		DiscoveryEdit,
		SelfRead,
	},
}

// Has reports whether the given role has the requested permission.
func Has(role, perm string) bool {
	perms, ok := RolePermissions[role]
	if !ok {
		return false
	}
	for _, p := range perms {
		if p == Wildcard || p == perm {
			return true
		}
	}
	return false
}
