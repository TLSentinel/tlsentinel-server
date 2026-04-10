import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listAllAPIKeys, revokeAPIKey, type AdminAPIKey } from '@/api/apiKeys'
import { plural } from '@/lib/utils'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function APIKeysPage() {
  const [search, setSearch] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<AdminAPIKey | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const { data, isLoading, error: fetchError, refetch } = useQuery({
    queryKey: ['admin', 'api-keys'],
    queryFn: listAllAPIKeys,
    placeholderData: keepPreviousData,
  })

  const allKeys = data ?? []

  // Client-side search across name, prefix, and username
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
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">API Keys</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {allKeys.length > 0
            ? `${allKeys.length} ${plural(allKeys.length, 'key')} across all users`
            : 'All active API keys across all users.'}
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search by name, user, or prefix…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Prefix</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {!isLoading && filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                {search ? 'No keys match your search.' : 'No API keys found.'}
              </TableCell>
            </TableRow>
          )}
          {filtered.map(k => (
            <TableRow key={k.id}>
              <TableCell className="font-medium">{k.name}</TableCell>
              <TableCell>
                <Link
                  to={`/settings/users`}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  {k.username}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">{k.prefix}…</TableCell>
              <TableCell className="text-sm text-muted-foreground">{fmtDate(k.createdAt)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {k.lastUsedAt ? fmtDate(k.lastUsedAt) : <span className="text-muted-foreground/50">Never</span>}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setRevokeTarget(k)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Revoke {k.name}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Confirm revoke dialog */}
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
