import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Trash2, Copy, Check, MoreVertical } from 'lucide-react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import StrixEmpty from '@/components/StrixEmpty'
import { listAPIKeys, createAPIKey, deleteAPIKey, type APIKey } from '@/api/apiKeys'

const ROW_GRID = 'grid-cols-[1.5fr_8rem_7rem_7rem_2.5rem]'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AccountAPIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // One-time reveal dialog
  const [revealToken, setRevealToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<APIKey | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data: keysData, isLoading } = useQuery({
    queryKey: ['account', 'api-keys'],
    queryFn: listAPIKeys,
  })

  useEffect(() => {
    if (keysData) setKeys(keysData)
  }, [keysData])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createAPIKey(newName.trim())
      setKeys(prev => [created, ...prev])
      setNewName('')
      setRevealToken(created.token)
    } catch {
      setCreateError('Failed to create API key.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteAPIKey(deleteTarget.id)
      setKeys(prev => prev.filter(k => k.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      // keep dialog open on error
    } finally {
      setDeleting(false)
    }
  }

  function handleCopy() {
    if (!revealToken) return
    navigator.clipboard.writeText(revealToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/account" className="hover:text-foreground">Account</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">API Keys</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Long-lived keys for CLI and automation access. Each key carries your permissions — revoke individually if compromised.
          </p>
        </div>
      </div>

      {/* Create bar */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Key name — e.g. Home lab, GitLab CI"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="max-w-sm"
        />
        <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
          <Plus className="h-4 w-4 mr-1.5" />
          {creating ? 'Creating…' : 'Create Key'}
        </Button>
      </div>
      {createError && <p className="text-sm text-destructive">{createError}</p>}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prefix</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Used</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            <StrixEmpty message="No API keys yet. Create one above." />
          </div>
        ) : (
          <div>
            {keys.map(k => (
              <div key={k.id} className={`grid ${ROW_GRID} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                <div className="min-w-0 pt-0.5">
                  <span className="text-sm font-semibold truncate block">{k.name}</span>
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
                        onClick={() => setDeleteTarget(k)}
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

      {/* One-time reveal dialog */}
      <Dialog open={!!revealToken} onOpenChange={() => { setRevealToken(null); setCopied(false) }}>
        <DialogContent className="sm:max-w-3xl">
          <div className="flex items-center gap-4">
            <img
              src="/strix.png"
              alt="Strix the owl"
              className="w-16 shrink-0 opacity-80 select-none"
              draggable={false}
            />
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">API Key Created</DialogTitle>
              <DialogDescription>
                Copy your key now — it won't be shown again.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono whitespace-nowrap overflow-x-auto">
              {revealToken}
            </code>
            <Button variant="outline" size="icon" className="shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => { setRevealToken(null); setCopied(false) }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm revoke dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> will be immediately invalidated. Any tools using it will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
