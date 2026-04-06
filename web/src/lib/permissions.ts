// ---------------------------------------------------------------------------
// Permission constants — mirrors internal/permission/permission.go exactly.
// ---------------------------------------------------------------------------

export const PERM = {
  EndpointsView: 'endpoints:view',
  EndpointsEdit: 'endpoints:edit',
  CertsView:     'certs:view',
  CertsEdit:     'certs:edit',
  SelfRead:      'self:read',
  ScannersView:  'scanners:view',
  ScannersEdit:  'scanners:edit',
  UsersView:     'users:view',
  UsersEdit:     'users:edit',
  GroupsView:    'groups:view',
  GroupsEdit:    'groups:edit',
  SettingsView:  'settings:view',
  SettingsEdit:  'settings:edit',
  TagsView:      'tags:view',
  TagsEdit:      'tags:edit',
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
    PERM.GroupsView,
    PERM.SettingsView,
    PERM.TagsView, PERM.TagsEdit,
    PERM.SelfRead,
  ],
  viewer: [
    PERM.EndpointsView,
    PERM.CertsView,
    PERM.GroupsView,
    PERM.TagsView,
    PERM.SelfRead,
  ],
}

export function hasPermission(role: string, perm: string): boolean {
  const perms = rolePermissions[role] ?? []
  return perms.includes('*') || perms.includes(perm)
}
