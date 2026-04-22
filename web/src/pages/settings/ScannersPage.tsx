import { useState } from 'react'
import { Plus, Pencil, Trash2, Copy, Check, AlertTriangle, CheckCircle2, Clock, Calendar, CalendarDays, Radio, KeyRound, ScanSearch, MoreVertical, Star, RadioTower, RefreshCw } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import StrixEmpty from '@/components/StrixEmpty'
import SchedulePicker from '@/components/SchedulePicker'
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
import { listScanners, createScanner, updateScanner, setDefaultScanner, deleteScanner, regenerateScannerToken } from '@/api/scanners'
import { can } from '@/api/client'
import type { ScannerToken, ScannerTokenCreated } from '@/types/api'
import { ApiError } from '@/types/api'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Breadcrumb } from '@/components/Breadcrumb'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000)     return 'Just now'
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)} mins ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hours ago`
  return `${Math.floor(diff / 86_400_000)} days ago`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function pad2(n: number) { return String(n).padStart(2, '0') }

interface ScheduleDisplay {
  icon: React.ComponentType<{ className?: string }>
  label: string
}

function scheduleDisplay(expr: string): ScheduleDisplay {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return { icon: Clock, label: expr }
  const [min, hr, dom, , dow] = parts

  if (min === '0' && hr === '*' && dom === '*' && dow === '*') {
    return { icon: Clock, label: 'Hourly' }
  }

  const h = parseInt(hr)
  const m = parseInt(min)
  if (isNaN(h) || isNaN(m)) return { icon: Clock, label: expr }
  const time = `${pad2(h)}:${pad2(m)}`

  if (dom === '*' && dow === '*') {
    return { icon: Calendar, label: `Daily at ${time}` }
  }
  if (dom === '*' && dow !== '*') {
    const d = parseInt(dow)
    if (isNaN(d) || d < 0 || d > 6) return { icon: Calendar, label: expr }
    return { icon: Calendar, label: `Weekly · ${WEEKDAYS[d]} ${time}` }
  }
  if (dom !== '*' && dow === '*') {
    const d = parseInt(dom)
    if (isNaN(d)) return { icon: CalendarDays, label: expr }
    return { icon: CalendarDays, label: `Monthly · day ${d} ${time}` }
  }
  return { icon: Clock, label: expr }
}

function statusDot(lastUsedAt: string | null, now: number): string {
  if (!lastUsedAt) return 'bg-muted-foreground/40'
  const age = now - new Date(lastUsedAt).getTime()
  if (age < 3_600_000)  return 'bg-emerald-500'
  if (age < 86_400_000) return 'bg-amber-500'
  return 'bg-red-500'
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
  const [name, setName]             = useState('')
  const [cronExpr, setCronExpr]     = useState('0 2 * * *')
  const [threads, setThreads]       = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    if (threads < 1) { setError('Threads must be at least 1.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createScanner(name.trim())
      if (cronExpr !== '0 * * * *' || threads !== 5) {
        await updateScanner(created.id, name.trim(), cronExpr, threads)
      }
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create scanner.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <Radio className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">Create Scanner</DialogTitle>
            <DialogDescription>Provision a new execution node</DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="a-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scanner Name
            </Label>
            <Input
              id="a-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Edge-Node-San-Francisco"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Execution Schedule
            </Label>
            <SchedulePicker value={cronExpr} onChange={setCronExpr} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="a-threads" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Threads
            </Label>
            <div className="flex items-start gap-4">
              <Input
                id="a-threads"
                type="number"
                min={1}
                max={100}
                value={threads}
                onChange={e => setThreads(Number(e.target.value))}
                className="w-24 text-center font-semibold"
              />
              <p className="text-sm text-muted-foreground pt-2">
                Total execution threads. High counts may require additional hardware resources.
              </p>
            </div>
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
  /** Invoked when the user clicks "Regenerate Token" in the footer. The parent
   * is expected to close the edit dialog and open the regenerate confirm flow. */
  onRegenerate: (scanner: ScannerToken) => void
}

function EditScannerDialog({ scanner, onClose, onSaved, onRegenerate }: EditScannerDialogProps) {
  const [name, setName]               = useState(scanner?.name ?? '')
  const [cronExpr, setCronExpr]       = useState(scanner?.scanCronExpression ?? '0 * * * *')
  const [concurrency, setConcurrency] = useState(scanner?.scanConcurrency ?? 5)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!scanner) return
    if (!name.trim()) { setError('Name is required.'); return }
    if (concurrency < 1) { setError('Threads must be at least 1.'); return }
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <Radio className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">Edit Scanner</DialogTitle>
            <DialogDescription>Update execution node configuration</DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="e-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scanner Name
            </Label>
            <Input id="e-name" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Execution Schedule
            </Label>
            <SchedulePicker value={cronExpr} onChange={setCronExpr} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-concurrency" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Threads
            </Label>
            <div className="flex items-start gap-4">
              <Input
                id="e-concurrency"
                type="number"
                min={1}
                max={100}
                value={concurrency}
                onChange={e => setConcurrency(Number(e.target.value))}
                className="w-24 text-center font-semibold"
              />
              <p className="text-sm text-muted-foreground pt-2">
                Total execution threads. High counts may require additional hardware resources.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            {scanner && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto gap-1.5"
                onClick={() => onRegenerate(scanner)}
                disabled={submitting}
                title="Invalidate the current token and issue a new one"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate Token
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Regenerate token confirmation dialog
// ---------------------------------------------------------------------------

interface RegenerateDialogProps {
  scanner: ScannerToken | null
  onClose: () => void
  onRegenerated: (token: string) => void
}

function RegenerateDialog({ scanner, onClose, onRegenerated }: RegenerateDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleRegenerate() {
    if (!scanner) return
    setLoading(true)
    setError(null)
    try {
      const res = await regenerateScannerToken(scanner.id)
      onRegenerated(res.token)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to regenerate scanner token.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={scanner !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">Regenerate Scanner Token</DialogTitle>
            <DialogDescription>Issue a new bearer token</DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Generate a new bearer token for{' '}
            <span className="font-medium text-foreground">{scanner?.name}</span>?
            The current token is invalidated immediately — any running agent
            using the old value will fail auth on its next poll.
          </p>
          <p>
            Schedule, thread count, default flag, and endpoint assignments are
            preserved.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleRegenerate} disabled={loading}>
            {loading ? 'Regenerating…' : 'Regenerate Token'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Token reveal dialog
// ---------------------------------------------------------------------------

interface TokenRevealDialogProps {
  token: string | null
  /** Label shown in the amber pill — differs between "New" (create) and "Rotated" (regenerate). */
  badge?: string
  onClose: () => void
}

function TokenRevealDialog({ token, badge = 'New', onClose }: TokenRevealDialogProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={token !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-3xl border-amber-300/60 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
            <KeyRound className="h-5 w-5" />
            <DialogTitle className="text-sm font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              Scanner Token
            </DialogTitle>
          </div>
          <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
            {badge}
          </span>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex min-w-0 items-stretch gap-2">
            <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded-md border border-amber-300/80 bg-background px-3 py-2.5 font-mono text-sm leading-relaxed text-amber-950 dark:border-amber-900/60 dark:text-amber-100">
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
              This token is only shown once and cannot be retrieved later. Store it securely in your secrets manager.
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
// Stat card
// ---------------------------------------------------------------------------

type StatSignal = 'neutral' | 'green' | 'amber' | 'red'

const SIGNAL_BORDER: Record<StatSignal, string> = {
  neutral: 'border-l-foreground/20',
  green:   'border-l-green-500',
  amber:   'border-l-amber-500',
  red:     'border-l-red-500',
}

const SIGNAL_VALUE: Record<StatSignal, string> = {
  neutral: 'text-foreground',
  green:   'text-green-600',
  amber:   'text-amber-600',
  red:     'text-red-600',
}

function StatCard({ label, value, signal = 'neutral' }: { label: string; value: string | number; signal?: StatSignal }) {
  return (
    <div className={`rounded-lg border border-l-4 ${SIGNAL_BORDER[signal]} bg-card p-5 space-y-2`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${SIGNAL_VALUE[signal]}`}>{value}</p>
    </div>
  )
}

function ActiveStatCard({ active, total }: { active: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((active / total) * 100)
  const signal: StatSignal = total === 0 ? 'neutral' : active === 0 ? 'red' : active < total ? 'amber' : 'green'
  const iconColor =
    signal === 'green' ? 'text-green-600'
    : signal === 'amber' ? 'text-amber-600'
    : signal === 'red' ? 'text-red-600'
    : 'text-muted-foreground'
  const barColor =
    signal === 'green' ? 'bg-green-500'
    : signal === 'amber' ? 'bg-amber-500'
    : signal === 'red' ? 'bg-red-500'
    : 'bg-muted-foreground/30'
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <RadioTower className={`h-5 w-5 ${iconColor}`} />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Scanners</p>
      </div>
      <p className="text-4xl font-bold tracking-tight">
        {active} <span className="text-muted-foreground font-semibold">/ {total}</span>
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid-cols-[minmax(0,2fr)_9rem_minmax(0,1.5fr)_6rem_8rem_2.5rem]'

export default function ScannersPage() {
  const admin = can('scanners:edit')
  const [now] = useState(Date.now)

  const [addSeq, setAddSeq]             = useState(0)
  const [addOpen, setAddOpen]           = useState(false)
  const [revealToken, setRevealToken]   = useState<string | null>(null)
  const [revealBadge, setRevealBadge]   = useState<'New' | 'Rotated'>('New')
  const [editTarget, setEditTarget]     = useState<ScannerToken | null>(null)
  const [regenTarget, setRegenTarget]   = useState<ScannerToken | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScannerToken | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const { data: scannersData, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['scanners'],
    queryFn: listScanners,
    placeholderData: keepPreviousData,
  })
  const scanners: ScannerToken[] = scannersData ?? []

  // Stats
  const totalScanners = scanners.length
  const activeScanners = scanners.filter(s => s.lastUsedAt && now - new Date(s.lastUsedAt).getTime() < 3_600_000).length
  const totalThreads   = scanners.reduce((sum, s) => sum + s.scanConcurrency, 0)

  function handleCreated(created: ScannerTokenCreated) {
    refetch()
    setRevealBadge('New')
    setRevealToken(created.token)
  }

  function handleRegenerated(token: string) {
    setRevealBadge('Rotated')
    setRevealToken(token)
  }

  // Opens the regenerate confirm dialog. If triggered from inside the edit
  // modal, close the edit modal first so the two dialogs aren't stacked.
  function openRegenerate(scanner: ScannerToken) {
    setEditTarget(null)
    setRegenTarget(scanner)
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
      <Breadcrumb items={[
        { label: 'Settings', to: '/settings' },
        { label: 'Scanners' },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scanners</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Scanner agents and their configuration.
          </p>
        </div>
        {admin && (
          <Button onClick={() => { setAddSeq(s => s + 1); setAddOpen(true) }} className="h-12 px-4 text-base font-semibold">
            <Plus className="mr-1.5 h-4 w-4" />
            Add Scanner
          </Button>
        )}
      </div>

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}
      {mutationError && <p className="text-sm text-destructive">{mutationError}</p>}

      {!isLoading && totalScanners > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ActiveStatCard active={activeScanners} total={totalScanners} />
          <StatCard label="Total Threads" value={totalThreads} signal="neutral" />
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Default</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Threads</span>
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
            {scanners.map(scanner => {
              const sched = scheduleDisplay(scanner.scanCronExpression)
              const SchedIcon = sched.icon
              return (
                <div key={scanner.id} className={`grid ${ROW_GRID} items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>
                  {/* Name + icon */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-md bg-muted">
                      <ScanSearch className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-semibold truncate">{scanner.name}</span>
                  </div>

                  {/* Default */}
                  <div>
                    {scanner.isDefault ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : admin ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        onClick={() => handleSetDefault(scanner)}
                      >
                        Set Default
                      </Button>
                    ) : null}
                  </div>

                  {/* Schedule */}
                  <div className="min-w-0 flex items-center gap-2">
                    <SchedIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate">{sched.label}</span>
                  </div>

                  {/* Threads */}
                  <div>
                    <span className="text-sm font-semibold tabular-nums">{scanner.scanConcurrency}</span>
                  </div>

                  {/* Last used */}
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(scanner.lastUsedAt, now)}`} />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {scanner.lastUsedAt ? fmtRelative(scanner.lastUsedAt, now) : 'Never'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end">
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
                          <DropdownMenuItem onClick={() => openRegenerate(scanner)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Regenerate Token
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
              )
            })}
          </div>
        )}
      </div>

      <CreateDialog key={addSeq} open={addOpen} onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      <TokenRevealDialog token={revealToken} badge={revealBadge} onClose={() => setRevealToken(null)} />
      <EditScannerDialog
        key={editTarget?.id}
        scanner={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={refetch}
        onRegenerate={openRegenerate}
      />
      <RegenerateDialog
        scanner={regenTarget}
        onClose={() => setRegenTarget(null)}
        onRegenerated={handleRegenerated}
      />
      <DeleteDialog scanner={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refetch} />
    </div>
  )
}
