import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MoreVertical, Trash2, ChevronRight } from 'lucide-react'
import SearchInput from '@/components/SearchInput'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listAllAPIKeys, revokeAPIKey, type AdminAPIKey } from '@/api/apiKeys'
import { plural } from '@/lib/utils'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const ROW_GRID = 'grid-cols-[1.5fr_1fr_8rem_7rem_7rem_2.5rem]'

export default function APIKeysPage() {
  const [search, setSearch]           = useState('')
  const [revokeTarget, setRevokeTarget] = useState<AdminAPIKey | null>(null)
  const [revoking, setRevoking]       = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const { data, isLoading, error: fetchError, refetch } = useQuery({
    queryKey: ['admin', 'api-keys'],
    queryFn: listAllAPIKeys,
    placeholderData: keepPreviousData,
  })
  const allKeys = data ?? []

  const filtered = search.trim()
    ? allKeys.filter(k =>
        k.name.toLowerCase().includes(search.toLowerCase()) ||
        k.username.toLowerCase().includes(search.toLowerCase()) ||
        k.prefix.toLowerCase().includes(search.toLowerCase()),
      )
    : allKeys

  async function handleRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    setRevokeError(null)
    try {
      await revokeAPIKey(revokeTarget.id)
      setRevokeTarget(null)
      refetch()
    } catch {
      setRevokeError('Failed to revoke key.')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">API Keys</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          All active API keys across all users.
        </p>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by name, user, or prefix…"
        className="max-w-sm"
      />

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}

      <div className="rounded-lg border">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            {filtered.length === 0
              ? 'No keys'
              : `${filtered.length} ${plural(filtered.length, 'key')}${search ? ' matching search' : ' across all users'}`}
          </p>
        </div>

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prefix</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Used</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            {search
              ? <span className="text-sm text-muted-foreground">No keys match your search.</span>
              : <StrixEmpty message="No API keys have been created yet." />}
          </div>
        ) : (
          <div className={`transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {filtered.map(k => (
              <div key={k.id} className={`grid ${ROW_GRID} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm font-semibold truncate block">{k.name}</span>
                </div>
                <div className="min-w-0 pt-0.5">
                  <Link
                    to="/settings/users"
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline truncate block"
                  >
                    {k.username}
                  </Link>
                </div>
                <div className="pt-0.5">
                  <span className="font-mono text-sm text-muted-foreground">{k.prefix}…</span>
                </div>
                <div className="pt-0.5">
                  <span className="text-sm text-muted-foreground">{fmtDate(k.createdAt)}</span>
                </div>
                <div className="pt-0.5">
                  <span className="text-sm text-muted-foreground">
                    {k.lastUsedAt ? fmtDate(k.lastUsedAt) : <span className="text-muted-foreground/50">Never</span>}
                  </span>
                </div>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setRevokeTarget(k)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!revokeTarget} onOpenChange={() => { setRevokeTarget(null); setRevokeError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              Revoke <strong>{revokeTarget?.name}</strong> belonging to{' '}
              <strong>{revokeTarget?.username}</strong>? It will be immediately invalidated.
            </DialogDescription>
          </DialogHeader>
          {revokeError && <p className="text-sm text-destructive">{revokeError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRevokeTarget(null); setRevokeError(null) }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
