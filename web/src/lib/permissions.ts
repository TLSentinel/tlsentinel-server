// ---------------------------------------------------------------------------
// Permission constants — mirrors internal/permission/permission.go exactly.
// ---------------------------------------------------------------------------

export const PERM = {
  EndpointsView:  'endpoints:view',
  EndpointsEdit:  'endpoints:edit',
  CertsView:      'certs:view',
  CertsEdit:      'certs:edit',
  SelfAccess:     'self:access',
  ScannersView:   'scanners:view',
  ScannersEdit:   'scanners:edit',
  UsersView:        'users:view',
  UsersEdit:        'users:edit',
  UsersCredentials: 'users:credentials',
  APIKeysAdmin:   'apikeys:admin',
  GroupsView:     'groups:view',
  GroupsEdit:     'groups:edit',
  SettingsView:   'settings:view',
  SettingsEdit:   'settings:edit',
  TagsView:       'tags:view',
  TagsEdit:       'tags:edit',
  LogsView:       'logs:view',
  Maintenance:    'maintenance',
  DiscoveryView:  'discovery:view',
  DiscoveryEdit:  'discovery:edit',
} as const

// ---------------------------------------------------------------------------
// Role → permission map — mirrors RolePermissions in permission.go.
// Keep in sync when roles or permissions change.
// ---------------------------------------------------------------------------

const rolePermissions: Record<string, string[]> = {
  admin: ['*'],
  operator: [
    PERM.EndpointsView, PERM.EndpointsEdit,
    PERM.CertsView,
    PERM.ScannersView,
    PERM.UsersView,
    PERM.GroupsView,
    PERM.SettingsView,
    PERM.TagsView, PERM.TagsEdit,
    PERM.LogsView,
    PERM.Maintenance,
    PERM.DiscoveryView, PERM.DiscoveryEdit,
    PERM.SelfAccess,
  ],
  viewer: [
    PERM.EndpointsView,
    PERM.CertsView,
    PERM.GroupsView,
    PERM.TagsView,
    PERM.DiscoveryView,
    PERM.SelfAccess,
  ],
}

export function hasPermission(role: string, perm: string): boolean {
  const perms = rolePermissions[role] ?? []
  return perms.includes('*') || perms.includes(perm)
}
