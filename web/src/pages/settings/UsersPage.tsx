import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, KeyRound, ChevronRight, ChevronLeft, MoreVertical, UserPlus, UserCog, Power, PowerOff } from 'lucide-react'
import SearchInput from '@/components/SearchInput'
import FilterDropdown from '@/components/FilterDropdown'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listUsers, createUser, updateUser, setUserEnabled, changePassword, deleteUser } from '@/api/users'
import { can, getIdentity } from '@/api/client'
import type { User } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDate, plural } from '@/lib/utils'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Breadcrumb } from '@/components/Breadcrumb'

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const ROLE_STYLE: Record<string, string> = {
  admin:    'bg-muted text-red-500 dark:text-red-400',
  operator: 'bg-muted text-blue-500 dark:text-blue-400',
  viewer:   'bg-muted text-muted-foreground',
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', operator: 'Operator', viewer: 'Viewer',
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${ROLE_STYLE[role] ?? 'bg-muted text-muted-foreground'}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

function ProviderBadge({ provider }: { provider: string }) {
  const style = provider === 'oidc'
    ? 'bg-muted text-purple-500 dark:text-purple-400'
    : 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${style}`}>
      {provider === 'oidc' ? 'OIDC' : 'Local'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Add / Edit dialog
// ---------------------------------------------------------------------------

interface UserDialogProps {
  user: User | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

function UserDialog({ user, open, onClose, onSaved }: UserDialogProps) {
  const isEdit = user !== null
  const [username, setUsername]   = useState(user?.username ?? '')
  const [password, setPassword]   = useState('')
  const [role, setRole]           = useState<'admin' | 'operator' | 'viewer'>(user?.role ?? 'viewer')
  const [provider, setProvider]   = useState<'local' | 'oidc'>(user?.provider ?? 'local')
  const [notify, setNotify]       = useState(user?.notify ?? false)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName]   = useState(user?.lastName ?? '')
  const [email, setEmail]         = useState(user?.email ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function nullable(s: string): string | null { return s.trim() || null }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) { setError('Username is required.'); return }
    if (!isEdit && provider === 'local' && !password) { setError('Password is required for local users.'); return }
    setSubmitting(true); setError(null)
    try {
      if (isEdit) {
        await updateUser(user.id, { username: username.trim(), role, provider, notify, firstName: nullable(firstName), lastName: nullable(lastName), email: nullable(email) })
      } else {
        await createUser({ username: username.trim(), password: provider === 'local' ? password : undefined, role, provider, notify, firstName: nullable(firstName), lastName: nullable(lastName), email: nullable(email) })
      }
      onSaved(); onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEdit ? 'update' : 'create'} user.`)
    } finally { setSubmitting(false) }
  }

  const Icon = isEdit ? UserCog : UserPlus

  function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-foreground hover:bg-muted',
        ].join(' ')}
      >
        {children}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">{isEdit ? 'Edit User' : 'Add User'}</DialogTitle>
            <DialogDescription>{isEdit ? 'Update account details and access' : 'Provision a new user account'}</DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="u-username" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Username <span className="text-destructive">*</span>
            </Label>
            <Input id="u-username" value={username} onChange={e => setUsername(e.target.value)} placeholder="jane" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="u-firstname" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                First Name
              </Label>
              <Input id="u-firstname" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-lastname" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Last Name
              </Label>
              <Input id="u-lastname" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="u-email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </Label>
            <Input id="u-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Authentication Provider
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <SegBtn active={provider === 'local'} onClick={() => setProvider('local')}>Local</SegBtn>
              <SegBtn active={provider === 'oidc'} onClick={() => setProvider('oidc')}>OIDC</SegBtn>
            </div>
            {provider === 'oidc' && (
              <p className="text-xs text-muted-foreground">
                OIDC users authenticate via SSO. No password is stored.
                {isEdit && user?.provider === 'local' && <span className="ml-1 text-amber-600">Switching will clear the existing password.</span>}
              </p>
            )}
          </div>

          {provider === 'local' && !isEdit && (
            <div className="space-y-2">
              <Label htmlFor="u-password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input id="u-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Role
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <SegBtn active={role === 'viewer'} onClick={() => setRole('viewer')}>Viewer</SegBtn>
              <SegBtn active={role === 'operator'} onClick={() => setRole('operator')}>Operator</SegBtn>
              <SegBtn active={role === 'admin'} onClick={() => setRole('admin')}>Admin</SegBtn>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="u-notify" className="text-sm font-medium">Receive alert emails</Label>
              <p className="text-xs text-muted-foreground">{email.trim() ? 'Send expiry alerts to this user.' : 'Requires an email address.'}</p>
            </div>
            <Switch id="u-notify" checked={notify} onCheckedChange={setNotify} disabled={!email.trim()} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add User')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Change password dialog
// ---------------------------------------------------------------------------

interface ChangePasswordDialogProps {
  user: User | null
  onClose: () => void
}

function ChangePasswordDialog({ user, onClose }: ChangePasswordDialogProps) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!password) { setError('Password is required.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true); setError(null)
    try { await changePassword(user.id, password); onClose() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Failed to change password.') }
    finally { setSubmitting(false) }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for <span className="font-medium text-foreground">{user?.username}</span>
            </DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="cp-password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              New Password <span className="text-destructive">*</span>
            </Label>
            <Input id="cp-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Confirm Password <span className="text-destructive">*</span>
            </Label>
            <Input id="cp-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Change Password'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  user: User | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ user, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleDelete() {
    if (!user) return
    setLoading(true); setError(null)
    try { await deleteUser(user.id); onDeleted(); onClose() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Failed to delete user.') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete User</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete <span className="font-medium text-foreground">{user?.username}</span>? This action cannot be undone.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>{loading ? 'Deleting…' : 'Delete'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type RoleFilter     = '' | 'admin' | 'operator' | 'viewer'
type ProviderFilter = '' | 'local' | 'oidc'
type SortOption     = '' | 'username' | 'name'

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: '',         label: 'All roles' },
  { value: 'admin',    label: 'Admin' },
  { value: 'operator', label: 'Operator' },
  { value: 'viewer',   label: 'Viewer' },
]

const PROVIDER_OPTIONS: { value: ProviderFilter; label: string }[] = [
  { value: '',      label: 'All providers' },
  { value: 'local', label: 'Local' },
  { value: 'oidc',  label: 'OIDC' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: '',         label: 'Newest first' },
  { value: 'username', label: 'Username A→Z' },
  { value: 'name',     label: 'Name A→Z' },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function UsersPage() {
  const admin         = can('users:edit')
  const currentUserID = getIdentity()?.uid ?? ''

  const [page, setPage]                           = useState(1)
  const [search, setSearch]                       = useState('')
  const [debouncedSearch, setDebouncedSearch]     = useState('')
  const [roleFilter, setRoleFilter]               = useState<RoleFilter>('')
  const [providerFilter, setProviderFilter]       = useState<ProviderFilter>('')
  const [sortOption, setSortOption]               = useState<SortOption>('')
  const [mutationError, setMutationError]         = useState<string | null>(null)
  const [addSeq, setAddSeq]                       = useState(0)
  const [addOpen, setAddOpen]                     = useState(false)
  const [editTarget, setEditTarget]               = useState<User | null>(null)
  const [passwordTarget, setPasswordTarget]       = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget]           = useState<User | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, roleFilter, providerFilter, sortOption])

  const { data, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['users', page, debouncedSearch, roleFilter, providerFilter, sortOption],
    queryFn: () => listUsers(page, PAGE_SIZE, debouncedSearch, roleFilter, providerFilter, sortOption),
    placeholderData: keepPreviousData,
  })

  const users      = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, totalCount)

  async function handleToggleEnabled(user: User) {
    try { await setUserEnabled(user.id, !user.enabled); refetch() }
    catch (err) { setMutationError(err instanceof ApiError ? err.message : 'Failed to update user.') }
  }

  function handleCloseDialog() { setAddOpen(false); setEditTarget(null) }

  // Grid varies by admin role: admin has Enabled + Actions columns
  const ROW_GRID = admin
    ? 'grid-cols-[2fr_1.5fr_6rem_6rem_7rem_4rem_2.5rem]'
    : 'grid-cols-[2fr_1.5fr_6rem_6rem_7rem]'

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Settings', to: '/settings' },
        { label: 'Users' },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage user accounts and access.
          </p>
        </div>
        {admin && (
          <Button onClick={() => { setAddSeq(s => s + 1); setAddOpen(true) }} className="h-12 px-4 text-base font-semibold">
            <Plus className="mr-1.5 h-4 w-4" />
            Add User
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search username or name…" className="max-w-sm flex-1" />
        <FilterDropdown label="Role" options={ROLE_OPTIONS} value={roleFilter} onSelect={v => setRoleFilter(v as RoleFilter)} />
        <FilterDropdown label="Provider" options={PROVIDER_OPTIONS} value={providerFilter} onSelect={v => setProviderFilter(v as ProviderFilter)} />
        <FilterDropdown label="Sort" options={SORT_OPTIONS} value={sortOption} onSelect={v => setSortOption(v as SortOption)} />
      </div>

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}
      {mutationError && <p className="text-sm text-destructive">{mutationError}</p>}

      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provider</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</span>
          {admin && <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>}
          {admin && <span />}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : users.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            {debouncedSearch || roleFilter || providerFilter
              ? <span className="text-sm text-muted-foreground">No users match your filters.</span>
              : <StrixEmpty message={<>No users yet. Click <strong>Add User</strong> to get started.</>} />}
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {users.map(user => (
              <div
                key={user.id}
                className={`grid ${ROW_GRID} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 ${!user.enabled ? 'opacity-50' : ''}`}
              >
                {/* User */}
                <div className="min-w-0">
                  {(user.firstName || user.lastName) && (
                    <p className="text-sm font-semibold truncate">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                    </p>
                  )}
                  <p className={`truncate ${user.firstName || user.lastName ? 'text-xs text-muted-foreground' : 'text-sm font-semibold'}`}>
                    {user.username}
                  </p>
                </div>

                {/* Email */}
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm text-muted-foreground truncate block">
                    {user.email ?? <span className="text-muted-foreground/50">—</span>}
                  </span>
                </div>

                {/* Role */}
                <div className="pt-0.5">
                  <RoleBadge role={user.role} />
                </div>

                {/* Provider */}
                <div className="pt-0.5">
                  <ProviderBadge provider={user.provider} />
                </div>

                {/* Created */}
                <div className="pt-0.5">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(user.createdAt)}</span>
                </div>

                {/* Status pill */}
                {admin && (
                  <div className="pt-0.5">
                    {user.enabled ? (
                      <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase tracking-wide">
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-muted text-muted-foreground uppercase tracking-wide">
                        Disabled
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                {admin && (
                  <div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(user)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleToggleEnabled(user)}
                          disabled={user.id === currentUserID}
                        >
                          {user.enabled ? (
                            <><PowerOff className="mr-2 h-4 w-4" />Disable</>
                          ) : (
                            <><Power className="mr-2 h-4 w-4" />Enable</>
                          )}
                        </DropdownMenuItem>
                        {user.provider === 'local' && (
                          <DropdownMenuItem onClick={() => setPasswordTarget(user)}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            Change Password
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer: count + pagination inside the card */}
        <div className="flex items-center justify-between border-t border-border/40 px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? 'No users'
              : <>Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> {plural(totalCount, 'user')}</>}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <span className="px-2 text-sm tabular-nums text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <UserDialog
        key={editTarget ? editTarget.id : `add-${addSeq}`}
        user={editTarget}
        open={addOpen || editTarget !== null}
        onClose={handleCloseDialog}
        onSaved={refetch}
      />
      <ChangePasswordDialog key={passwordTarget?.id} user={passwordTarget} onClose={() => setPasswordTarget(null)} />
      <DeleteDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refetch} />
    </div>
  )
}
