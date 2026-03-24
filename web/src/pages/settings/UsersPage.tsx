import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, KeyRound, ChevronLeft, ChevronRight, Search, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listUsers, createUser, updateUser, setUserEnabled, changePassword, deleteUser } from '@/api/users'
import { isAdmin, getIdentity } from '@/api/client'
import type { User } from '@/types/api'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Add / Edit dialog
// ---------------------------------------------------------------------------

interface UserDialogProps {
  /** null = create mode; non-null = edit mode (pre-fills from user). */
  user: User | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Keyed by the parent so it remounts (fresh state) on every open.
 * Initial state is derived from the `user` prop at mount time — no
 * useEffect reset needed.
 */
function UserDialog({ user, open, onClose, onSaved }: UserDialogProps) {
  const isEdit = user !== null

  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>(user?.role ?? 'viewer')
  const [provider, setProvider] = useState<'local' | 'oidc'>(user?.provider ?? 'local')
  const [notify, setNotify] = useState(user?.notify ?? false)
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Helper: convert empty string → null for optional fields.
  function nullable(s: string): string | null {
    return s.trim() || null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim()) {
      setError('Username is required.')
      return
    }
    if (!isEdit && provider === 'local' && !password) {
      setError('Password is required for local users.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (isEdit) {
        await updateUser(user.id, {
          username: username.trim(),
          role,
          provider,
          notify,
          firstName: nullable(firstName),
          lastName: nullable(lastName),
          email: nullable(email),
        })
      } else {
        await createUser({
          username: username.trim(),
          password: provider === 'local' ? password : undefined,
          role,
          provider,
          notify,
          firstName: nullable(firstName),
          lastName: nullable(lastName),
          email: nullable(email),
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to ${isEdit ? 'update' : 'create'} user.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit User' : 'Add User'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-username">
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              id="u-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="jane"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-firstname">First Name</Label>
              <Input
                id="u-firstname"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-lastname">Last Name</Label>
              <Input
                id="u-lastname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Provider</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={provider === 'local' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setProvider('local')}
              >
                Local
              </Button>
              <Button
                type="button"
                variant={provider === 'oidc' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setProvider('oidc')}
              >
                OIDC
              </Button>
            </div>
            {provider === 'oidc' && (
              <p className="text-xs text-muted-foreground">
                OIDC users authenticate via SSO. No password is stored.
                {isEdit && user?.provider === 'local' && (
                  <span className="ml-1 text-amber-600">Switching will clear the existing password.</span>
                )}
              </p>
            )}
          </div>

          {provider === 'local' && !isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="u-password">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="u-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={role === 'viewer' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRole('viewer')}
              >
                Viewer
              </Button>
              <Button
                type="button"
                variant={role === 'admin' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRole('admin')}
              >
                Admin
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="u-notify">Receive alert emails</Label>
              <p className="text-xs text-muted-foreground">
                {email.trim() ? 'Send expiry alerts to this user.' : 'Requires an email address.'}
              </p>
            </div>
            <Switch
              id="u-notify"
              checked={notify}
              onCheckedChange={setNotify}
              disabled={!email.trim()}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? isEdit
                  ? 'Saving…'
                  : 'Adding…'
                : isEdit
                  ? 'Save Changes'
                  : 'Add User'}
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
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!password) {
      setError('Password is required.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await changePassword(user.id, password)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Set a new password for{' '}
          <span className="font-medium text-foreground">{user?.username}</span>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp-password">
              New Password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">
              Confirm Password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Change Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  user: User | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ user, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      await deleteUser(user.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete user.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">{user?.username}</span>? This action
          cannot be undone.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type RoleFilter = '' | 'admin' | 'viewer'
type ProviderFilter = '' | 'local' | 'oidc'
type SortOption = '' | 'username' | 'name'

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: '', label: 'All roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
]

const PROVIDER_OPTIONS: { value: ProviderFilter; label: string }[] = [
  { value: '', label: 'All providers' },
  { value: 'local', label: 'Local' },
  { value: 'oidc', label: 'OIDC' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: '', label: 'Newest first' },
  { value: 'username', label: 'Username A→Z' },
  { value: 'name', label: 'Name A→Z' },
]

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function UsersPage() {
  const admin = isAdmin()
  const currentUserID = getIdentity()?.uid ?? ''

  const [users, setUsers] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('')
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('')
  const [sortOption, setSortOption] = useState<SortOption>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Incremented each time "Add User" is clicked so the dialog remounts fresh.
  const [addSeq, setAddSeq] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  // Debounce search input by 400 ms.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  // Reset to page 1 whenever any filter changes.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, roleFilter, providerFilter, sortOption])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listUsers(page, PAGE_SIZE, debouncedSearch, roleFilter, providerFilter, sortOption)
      setUsers(result.items ?? [])
      setTotalCount(result.totalCount)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, roleFilter, providerFilter, sortOption])

  useEffect(() => {
    load()
  }, [load])

  async function handleToggleEnabled(user: User) {
    try {
      const updated = await setUserEnabled(user.id, !user.enabled)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update user.')
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  function handleCloseDialog() {
    setAddOpen(false)
    setEditTarget(null)
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Users</span>
      </nav>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCount} user{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
        {admin && (
          <Button
            onClick={() => {
              setAddSeq((s) => s + 1)
              setAddOpen(true)
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add User
          </Button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search username or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              {ROLE_OPTIONS.find((o) => o.value === roleFilter)?.label ?? 'Role'}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ROLE_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className="gap-2"
                onSelect={() => setRoleFilter(opt.value)}
              >
                <Check className={`h-4 w-4 ${roleFilter === opt.value ? 'opacity-100' : 'opacity-0'}`} />
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              {PROVIDER_OPTIONS.find((o) => o.value === providerFilter)?.label ?? 'Provider'}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PROVIDER_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className="gap-2"
                onSelect={() => setProviderFilter(opt.value)}
              >
                <Check className={`h-4 w-4 ${providerFilter === opt.value ? 'opacity-100' : 'opacity-0'}`} />
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              {SORT_OPTIONS.find((o) => o.value === sortOption)?.label ?? 'Sort'}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SORT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className="gap-2"
                onSelect={() => setSortOption(opt.value)}
              >
                <Check className={`h-4 w-4 ${sortOption === opt.value ? 'opacity-100' : 'opacity-0'}`} />
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active filter context line */}
      <p className="text-sm text-muted-foreground">
        Showing{' '}
        <span className="font-semibold text-foreground">
          {roleFilter ? roleFilter : 'all'}
        </span>{' '}
        {providerFilter && (
          <><span className="font-semibold text-foreground">{providerFilter}</span>{' '}</>
        )}
        users
        {debouncedSearch && (
          <> matching <span className="font-semibold text-foreground">"{debouncedSearch}"</span></>
        )}
        {sortOption && (
          <> · sorted by <span className="font-semibold text-foreground">{SORT_OPTIONS.find((o) => o.value === sortOption)?.label}</span></>
        )}
      </p>

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Created</TableHead>
              {admin && <TableHead className="w-8">Enabled</TableHead>}
              {admin && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={admin ? 7 : 5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={admin ? 7 : 5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {debouncedSearch || roleFilter || providerFilter
                    ? 'No users match your filters.'
                    : <>No users yet. Click <strong>Add User</strong> to get started.</>}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className={!user.enabled ? 'opacity-50' : undefined}
                >
                  {/* User: full name (if set) + username */}
                  <TableCell>
                    {(user.firstName || user.lastName) && (
                      <p className="font-medium">
                        {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                      </p>
                    )}
                    <p className={user.firstName || user.lastName ? 'text-sm text-muted-foreground' : 'font-medium'}>
                      {user.username}
                    </p>
                  </TableCell>

                  {/* Email */}
                  <TableCell className="text-sm text-muted-foreground">
                    {user.email ?? <span className="text-muted-foreground/50">—</span>}
                  </TableCell>

                  {/* Role */}
                  <TableCell>
                    {user.role === 'admin' ? (
                      <Badge
                        variant="outline"
                        className="border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      >
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-gray-400 text-gray-600 dark:text-gray-400">Viewer</Badge>
                    )}
                  </TableCell>

                  {/* Provider */}
                  <TableCell>
                    {user.provider === 'oidc' ? (
                      <Badge variant="outline" className="border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        OIDC
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-gray-400 text-gray-600 dark:text-gray-400">
                        Local
                      </Badge>
                    )}
                  </TableCell>

                  {/* Created */}
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(user.createdAt)}
                  </TableCell>

                  {/* Enabled toggle — admin only */}
                  {admin && (
                    <TableCell>
                      <Switch
                        checked={user.enabled}
                        disabled={user.id === currentUserID}
                        onCheckedChange={() => handleToggleEnabled(user)}
                        aria-label={user.enabled ? `Disable ${user.username}` : `Enable ${user.username}`}
                      />
                    </TableCell>
                  )}

                  {/* Row actions — admin only */}
                  {admin && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          onClick={() => setEditTarget(user)}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit {user.username}</span>
                        </Button>
                        {user.provider === 'local' && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            onClick={() => setPasswordTarget(user)}
                          >
                            <KeyRound className="h-4 w-4" />
                            <span className="sr-only">Change password for {user.username}</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete {user.username}</span>
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {totalCount === 0
            ? 'No users'
            : `Page ${page} of ${totalPages} · ${totalCount} total`}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>

      {/*
        UserDialog is keyed so it remounts with fresh form state on every open:
        – Add mode: addSeq increments on each click, giving a unique key.
        – Edit mode: key is the user ID, so switching users also remounts.
      */}
      <UserDialog
        key={editTarget ? editTarget.id : `add-${addSeq}`}
        user={editTarget}
        open={addOpen || editTarget !== null}
        onClose={handleCloseDialog}
        onSaved={load}
      />

      {/* Keyed by user ID so it remounts (fresh password fields) for each user. */}
      <ChangePasswordDialog
        key={passwordTarget?.id}
        user={passwordTarget}
        onClose={() => setPasswordTarget(null)}
      />

      <DeleteDialog
        user={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={load}
      />
    </div>
  )
}
