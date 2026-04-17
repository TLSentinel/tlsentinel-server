import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Copy, Check, AlertTriangle, Star, ChevronRight, MoreVertical } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import SchedulePicker from '@/components/SchedulePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listScanners, createScanner, updateScanner, setDefaultScanner, deleteScanner } from '@/api/scanners'
import { can } from '@/api/client'
import type { ScannerToken, ScannerTokenCreated } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDate, plural } from '@/lib/utils'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000)     return 'Just now'
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (created: ScannerTokenCreated) => void
}

function CreateDialog({ open, onClose, onCreated }: CreateDialogProps) {
  const [name, setName]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createScanner(name.trim())
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create scanner token.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Scanner</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-name">Name <span className="text-destructive">*</span></Label>
            <Input id="a-name" value={name} onChange={e => setName(e.target.value)} placeholder="prod-scanner-01" required />
            <p className="text-xs text-muted-foreground">A descriptive label to identify this scanner agent.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create Scanner'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

interface EditScannerDialogProps {
  scanner: ScannerToken | null
  onClose: () => void
  onSaved: () => void
}

function EditScannerDialog({ scanner, onClose, onSaved }: EditScannerDialogProps) {
  const [name, setName]               = useState(scanner?.name ?? '')
  const [cronExpr, setCronExpr]       = useState(scanner?.scanCronExpression ?? '0 * * * *')
  const [concurrency, setConcurrency] = useState(scanner?.scanConcurrency ?? 5)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!scanner) return
    if (!name.trim()) { setError('Name is required.'); return }
    if (concurrency < 1) { setError('Concurrency must be at least 1.'); return }
    setSubmitting(true)
    setError(null)
    try {
      await updateScanner(scanner.id, name.trim(), cronExpr, concurrency)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update scanner.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={scanner !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Scanner</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Name <span className="text-destructive">*</span></Label>
            <Input id="e-name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Scan schedule</Label>
            <SchedulePicker value={cronExpr} onChange={setCronExpr} />
            <p className="text-xs text-muted-foreground">How often the scanner checks each host.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-concurrency">Concurrency</Label>
            <Input id="e-concurrency" type="number" min={1} max={100} value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Maximum simultaneous host scans. Default: 5.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Token reveal dialog
// ---------------------------------------------------------------------------

interface TokenRevealDialogProps {
  created: ScannerTokenCreated | null
  onClose: () => void
}

function TokenRevealDialog({ created, onClose }: TokenRevealDialogProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Scanner Token Created</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">Copy this token now — it will <strong>not</strong> be shown again.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Bearer Token</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                {created?.token}
              </code>
              <Button type="button" variant="outline" size="icon-sm" onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">Copy token</span>
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Provide this token in the{' '}
            <code className="rounded bg-muted px-1 font-mono">Authorization: Bearer &lt;token&gt;</code>{' '}
            header when configuring your scanner.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  scanner: ScannerToken | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ scanner, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleDelete() {
    if (!scanner) return
    setLoading(true)
    setError(null)
    try {
      await deleteScanner(scanner.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke scanner token.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={scanner !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Revoke Scanner</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to revoke{' '}
          <span className="font-medium text-foreground">{scanner?.name}</span>? Any scanner
          using this token will immediately lose access.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid-cols-[2fr_1.5fr_6rem_7rem_7rem_2.5rem]'

export default function ScannersPage() {
  const admin = can('scanners:edit')
  const [now] = useState(Date.now)

  const [addSeq, setAddSeq]             = useState(0)
  const [addOpen, setAddOpen]           = useState(false)
  const [revealToken, setRevealToken]   = useState<ScannerTokenCreated | null>(null)
  const [editTarget, setEditTarget]     = useState<ScannerToken | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScannerToken | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const { data: scannersData, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['scanners'],
    queryFn: listScanners,
    placeholderData: keepPreviousData,
  })
  const scanners: ScannerToken[] = scannersData ?? []

  function handleCreated(created: ScannerTokenCreated) {
    refetch()
    setRevealToken(created)
  }

  async function handleSetDefault(scanner: ScannerToken) {
    try {
      await setDefaultScanner(scanner.id)
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : 'Failed to set default scanner.')
    } finally {
      refetch()
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Scanners</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scanners</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Scanner agents and their configuration.
          </p>
        </div>
        {admin && (
          <Button onClick={() => { setAddSeq(s => s + 1); setAddOpen(true) }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Scanner
          </Button>
        )}
      </div>

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}
      {mutationError && <p className="text-sm text-destructive">{mutationError}</p>}

      <div className="rounded-lg border">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            {scanners.length === 0 ? 'No scanners' : `${scanners.length} ${plural(scanners.length, 'scanner')} registered`}
          </p>
        </div>

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Concurrency</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Used</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : scanners.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            <StrixEmpty message={<>No scanners yet. Click <strong>Add Scanner</strong> to get started.</>} />
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {scanners.map(scanner => (
              <div key={scanner.id} className={`grid ${ROW_GRID} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                {/* Name + default badge */}
                <div className="min-w-0 pt-0.5 flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{scanner.name}</span>
                  {scanner.isDefault && (
                    <span className="inline-flex items-center gap-1 shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase bg-muted text-amber-500 dark:text-amber-400">
                      <Star className="h-3 w-3 fill-current" />
                      Default
                    </span>
                  )}
                </div>

                {/* Schedule */}
                <div className="min-w-0 pt-0.5">
                  <span className="font-mono text-sm text-muted-foreground truncate block">{scanner.scanCronExpression}</span>
                </div>

                {/* Concurrency */}
                <div className="pt-0.5">
                  <span className="text-sm text-muted-foreground">{scanner.scanConcurrency}</span>
                </div>

                {/* Created */}
                <div className="pt-0.5">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(scanner.createdAt)}</span>
                </div>

                {/* Last used */}
                <div className="pt-0.5">
                  {scanner.lastUsedAt
                    ? <span className="text-sm text-muted-foreground">{fmtRelative(scanner.lastUsedAt, now)}</span>
                    : <span className="text-sm text-muted-foreground">Never</span>}
                </div>

                {/* Actions */}
                <div>
                  {admin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!scanner.isDefault && (
                          <DropdownMenuItem onClick={() => handleSetDefault(scanner)}>
                            <Star className="mr-2 h-4 w-4" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setEditTarget(scanner)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(scanner)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Revoke
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateDialog key={addSeq} open={addOpen} onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      <TokenRevealDialog created={revealToken} onClose={() => setRevealToken(null)} />
      <EditScannerDialog key={editTarget?.id} scanner={editTarget} onClose={() => setEditTarget(null)} onSaved={refetch} />
      <DeleteDialog scanner={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refetch} />
    </div>
  )
}
