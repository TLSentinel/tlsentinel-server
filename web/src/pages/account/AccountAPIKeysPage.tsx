import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Copy, Check, MoreVertical, KeyRound, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Breadcrumb } from '@/components/Breadcrumb'

const ROW_GRID = 'grid-cols-[1.5fr_8rem_7rem_7rem_2.5rem]'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AccountAPIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  // One-time reveal dialog
  const [revealToken, setRevealToken] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Account', to: '/account' },
        { label: 'API Keys' },
      ]} />

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Long-lived keys for CLI and automation access. Each key carries your permissions — revoke individually if compromised.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-12 px-4 text-base font-semibold">
          <Plus className="mr-1.5 h-4 w-4" />
          Create Key
        </Button>
      </div>

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

      <CreateKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(key) => {
          setKeys(prev => [key, ...prev])
          setRevealToken(key.token)
          setCreateOpen(false)
        }}
      />

      <TokenRevealDialog token={revealToken} onClose={() => setRevealToken(null)} />

      {/* Confirm revoke dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex-row items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-lg font-semibold">Revoke API Key</DialogTitle>
              <DialogDescription>This action cannot be undone</DialogDescription>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</p>
              <p className="mt-0.5 text-sm font-semibold truncate">{deleteTarget?.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{deleteTarget?.prefix}…</p>
            </div>
            <p className="text-sm text-muted-foreground">
              This key will be immediately invalidated. Any CLI or automation using it will stop working.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Revoking…' : 'Revoke Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (key: APIKey & { token: string }) => void
}) {
  const [name, setName]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    if (open) { setName(''); setError(null); setSubmitting(false) }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createAPIKey(name.trim())
      onCreated(created)
    } catch {
      setError('Failed to create API key.')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">Create API Key</DialogTitle>
            <DialogDescription>Issue a new key for CLI or automation access</DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="key-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Key Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="key-name"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Home lab, GitLab CI"
              required
            />
            <p className="text-xs text-muted-foreground">
              A human-readable label — helps you identify the key later.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// One-time token reveal dialog
// ---------------------------------------------------------------------------

function TokenRevealDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={!!token} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-3xl border-amber-300/60 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
            <KeyRound className="h-5 w-5" />
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              API Key
            </DialogTitle>
          </div>
          <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
            New
          </span>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex min-w-0 items-stretch gap-2">
            <code className="flex-1 min-w-0 break-all rounded-md border border-amber-300/80 bg-background px-3 py-2.5 font-mono text-sm leading-relaxed text-amber-950 dark:border-amber-900/60 dark:text-amber-100">
              {token}
            </code>
            <Button
              type="button"
              onClick={handleCopy}
              className="shrink-0 gap-1.5 bg-none bg-amber-900 text-amber-50 hover:bg-amber-800 hover:brightness-100 dark:bg-amber-800 dark:hover:bg-amber-700"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm italic">
              This key is only shown once and cannot be retrieved later. Store it securely in your secrets manager.
            </p>
          </div>
        </div>
        <DialogFooter className="border-amber-300/60 bg-amber-100/60 dark:border-amber-900/50 dark:bg-amber-950/60">
          <Button
            onClick={onClose}
            className="bg-none bg-amber-900 text-amber-50 hover:bg-amber-800 hover:brightness-100 dark:bg-amber-800 dark:hover:bg-amber-700"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
