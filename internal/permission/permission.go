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

	// Groups
	GroupsView = "groups:view"
	GroupsEdit = "groups:edit"

	// Settings (mail config, general, etc.)
	SettingsView = "settings:view"
	SettingsEdit = "settings:edit"

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
		SelfRead,
	},
	RoleOperator: {
		EndpointsView,
		EndpointsEdit,
		CertsView,
		ScannersView,
		GroupsView,
		SettingsView,
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
