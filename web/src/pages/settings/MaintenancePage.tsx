import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Archive, Bell, ScrollText, BellOff, ShieldCheck, Play, Pencil,
  Power, PowerOff, Clock, MoreVertical, CheckCircle2, XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import SchedulePicker from '@/components/SchedulePicker'
import { FIELD_LABEL, fmtDateTime } from '@/lib/utils'
import { Breadcrumb } from '@/components/Breadcrumb'
import {
  getScanHistoryRetention, setScanHistoryRetention,
  getAuditLogRetention, setAuditLogRetention,
  getScheduledJobs, updateScheduledJob,
  runPurgeScanHistory, runPurgeAuditLogs, runPurgeExpiryAlerts, runRefreshRootStores,
  type ScheduledJob,
} from '@/api/settings'

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

type Tone = 'emerald' | 'amber' | 'blue'

const TONE_CLASSES: Record<Tone, string> = {
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  amber:   'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  blue:    'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
}

// ---------------------------------------------------------------------------
// Cron → human phrase. Handles the shapes SchedulePicker emits for its named
// frequencies (hourly/daily/weekly/monthly). Anything else — steps, ranges,
// lists — falls through to the raw expression so we don't mislabel it.
// ---------------------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Plain non-negative integer, no steps/ranges/lists.
const SIMPLE = /^\d+$/

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, mon, dow] = parts

  // Month is always '*' for our schedules; bail on anything fancier.
  if (mon !== '*') return expr
  // Every non-'*' field must be a plain integer.
  for (const p of [min, hour, dom, dow]) {
    if (p !== '*' && !SIMPLE.test(p)) return expr
  }

  // Hourly — minute fixed, everything else wild.
  if (hour === '*' && dom === '*' && dow === '*') {
    if (min === '*') return expr
    return min === '0' ? 'Hourly' : `Hourly at :${min.padStart(2, '0')}`
  }

  // Daily/weekly/monthly need a specific time-of-day.
  if (hour === '*' || min === '*') return expr
  const time = ` at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`

  if (dom === '*' && dow === '*') return `Daily${time}`
  if (dom === '*' && dow !== '*') {
    const n = parseInt(dow)
    const day = n >= 0 && n <= 6 ? DAYS[n] : dow
    return `Weekly (${day})${time}`
  }
  if (dom !== '*' && dow === '*') return `Monthly${time}`
  return expr
}

// ---------------------------------------------------------------------------
// Job definitions — one per row. Each entry declares a title, icon, tone, and
// optionally a "Run Now" runner and/or a retention field.
// ---------------------------------------------------------------------------

interface JobConfig {
  name: string
  icon: LucideIcon
  tone: Tone
  title: string
  description: string
  runner?: () => Promise<string | undefined>
  retention?: {
    get:      () => Promise<{ days: number }>
    set:      (days: number) => Promise<{ days: number }>
    queryKey: string[]
    label:    string
    hint:     string
  }
}

const JOBS: JobConfig[] = [
  {
    name: 'expiry_alerts',
    icon: Bell,
    tone: 'emerald',
    title: 'Certificate Expiry Alerts',
    description: 'Send email alerts to subscribers when certificates approach their expiry thresholds.',
  },
  {
    name: 'purge_expiry_alerts',
    icon: BellOff,
    tone: 'amber',
    title: 'Purge Expiry Alert Records',
    description: 'Remove sent-alert tracking records for certificates that are no longer active on any endpoint. Clears the slate for replaced certificates so fresh alerts fire for new ones.',
    runner: async () => {
      const r = await runPurgeExpiryAlerts()
      return r.deleted === 1 ? 'Removed 1 record.' : `Removed ${r.deleted} records.`
    },
  },
  {
    name: 'purge_scan_history',
    icon: Archive,
    tone: 'amber',
    title: 'Purge Scan History',
    description: 'Remove scan history records older than the retention window. The most recent entry per endpoint is always kept regardless of age.',
    runner: async () => {
      const r = await runPurgeScanHistory()
      return r.deleted === 1 ? 'Removed 1 row.' : `Removed ${r.deleted} rows.`
    },
    retention: {
      get: getScanHistoryRetention,
      set: setScanHistoryRetention,
      queryKey: ['scan-history-retention'],
      label: 'Retention',
      hint:  'Keep history for',
    },
  },
  {
    name: 'purge_audit_logs',
    icon: ScrollText,
    tone: 'amber',
    title: 'Purge Audit Logs',
    description: 'Remove audit log entries older than the retention window.',
    runner: async () => {
      const r = await runPurgeAuditLogs()
      return r.deleted === 1 ? 'Removed 1 entry.' : `Removed ${r.deleted} entries.`
    },
    retention: {
      get: getAuditLogRetention,
      set: setAuditLogRetention,
      queryKey: ['audit-log-retention'],
      label: 'Retention',
      hint:  'Keep logs for',
    },
  },
  {
    name: 'refresh_root_stores',
    icon: ShieldCheck,
    tone: 'blue',
    title: 'Refresh Root Stores',
    description: 'Pull the latest Apple, Chrome, Microsoft, and Mozilla root CA bundles from CCADB and update trust anchor membership.',
    runner: async () => {
      await runRefreshRootStores()
      return 'Refresh complete.'
    },
  },
]

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid-cols-[3fr_1.25fr_1.25fr_1.5fr_6rem_2.5rem]'

// Scheduler writes freeform strings into last_run_status — "success" for auto
// runs, "removed N rows (manual run)" etc. for manual ones. Treat anything
// containing "fail" or "error" as a failure; otherwise it's a success.
function lastRunFailed(status: string): boolean {
  return /fail|error/i.test(status)
}

interface JobRowProps {
  cfg:      JobConfig
  job:      ScheduledJob | null
  onEdit:   () => void
  onToggle: () => void
  onRun:    () => void
  toggling: boolean
  running:  boolean
}

function JobRow({ cfg, job, onEdit, onToggle, onRun, toggling, running }: JobRowProps) {
  const Icon = cfg.icon
  const enabled = job?.enabled ?? false
  const status  = job?.lastRunStatus ?? null
  const failed  = status !== null && lastRunFailed(status)

  return (
    <div className={`grid ${ROW_GRID} items-center gap-5 px-5 py-4 border-b border-border/40 last:border-0`}>

      {/* Job */}
      <div className="flex items-start gap-3 min-w-0">
        <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-md ${TONE_CLASSES[cfg.tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{cfg.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{cfg.description}</p>
        </div>
      </div>

      {/* Schedule */}
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground truncate">
          {job ? describeCron(job.cronExpression) : '—'}
        </span>
      </div>

      {/* Last run */}
      <div className="min-w-0">
        {job?.lastRunAt
          ? <span className="text-sm text-muted-foreground">{fmtDateTime(job.lastRunAt)}</span>
          : <span className="text-sm italic text-muted-foreground/50">Never</span>}
      </div>

      {/* Last status */}
      <div className="flex items-center gap-2 min-w-0">
        {status === null ? (
          <span className="text-sm italic text-muted-foreground/50">—</span>
        ) : failed ? (
          <>
            <XCircle className="shrink-0 h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            <span className="text-sm text-muted-foreground truncate" title={status}>{status}</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="shrink-0 h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            <span className="text-sm text-muted-foreground truncate" title={status}>{status}</span>
          </>
        )}
      </div>

      {/* Status */}
      <div>
        {enabled ? (
          <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase tracking-wide">
            Enabled
          </span>
        ) : (
          <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-muted text-muted-foreground uppercase tracking-wide">
            Disabled
          </span>
        )}
      </div>

      {/* Kebab */}
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!job}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            {cfg.runner && (
              <DropdownMenuItem onClick={onRun} disabled={running}>
                <Play className="mr-2 h-4 w-4" />
                {running ? 'Running…' : 'Run Now'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onToggle} disabled={toggling}>
              {enabled ? (
                <><PowerOff className="mr-2 h-4 w-4" />Disable</>
              ) : (
                <><Power className="mr-2 h-4 w-4" />Enable</>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit dialog — schedule + (optional) retention + Run Now
// ---------------------------------------------------------------------------

interface JobEditDialogProps {
  cfg:   JobConfig | null
  job:   ScheduledJob | null
  open:  boolean
  onClose: () => void
}

function JobEditDialog({ cfg, job, open, onClose }: JobEditDialogProps) {
  const qc = useQueryClient()
  const [cron, setCron]             = useState('0 * * * *')
  const [enabled, setEnabled]       = useState(true)
  const [retention, setRetention]   = useState(90)
  const [saving, setSaving]         = useState(false)
  const [running, setRunning]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [runResult, setRunResult]   = useState<string | null>(null)

  // Retention is a separate API per job; only fetched when the dialog is open
  // for a job that actually has one.
  const { data: retentionData } = useQuery({
    queryKey: cfg?.retention?.queryKey ?? ['no-retention'],
    queryFn:  () => cfg!.retention!.get(),
    enabled:  open && !!cfg?.retention,
  })

  useEffect(() => {
    if (open && job) {
      setCron(job.cronExpression)
      setEnabled(job.enabled)
      setError(null)
      setRunResult(null)
    }
  }, [open, job])

  useEffect(() => {
    if (retentionData) setRetention(retentionData.days)
  }, [retentionData])

  async function handleSave() {
    if (!cfg || !job) return
    setSaving(true); setError(null)
    try {
      const ops: Promise<unknown>[] = []
      if (cron !== job.cronExpression || enabled !== job.enabled) {
        ops.push(updateScheduledJob(cfg.name, cron, enabled))
      }
      if (cfg.retention && retentionData && retention !== retentionData.days) {
        ops.push(cfg.retention.set(retention))
      }
      await Promise.all(ops)
      qc.invalidateQueries({ queryKey: ['scheduled-jobs'] })
      if (cfg.retention) qc.invalidateQueries({ queryKey: cfg.retention.queryKey })
      onClose()
    } catch {
      setError('Failed to save schedule.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRun() {
    if (!cfg?.runner) return
    setRunning(true); setError(null); setRunResult(null)
    try {
      const msg = await cfg.runner()
      if (msg) setRunResult(msg)
      qc.invalidateQueries({ queryKey: ['scheduled-jobs'] })
    } catch {
      setError('Run failed.')
    } finally {
      setRunning(false)
    }
  }

  if (!cfg) return null
  const Icon = cfg.icon

  return (
    <Dialog open={open} onOpenChange={v => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[cfg.tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">{cfg.title}</DialogTitle>
            <DialogDescription>{cfg.description}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Enabled toggle */}
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Enabled</Label>
              <p className="text-xs text-muted-foreground">
                {enabled ? 'Runs automatically on its schedule.' : 'Will not run automatically.'}
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label className={FIELD_LABEL}>Schedule</Label>
            <SchedulePicker value={cron} onChange={setCron} />
          </div>

          {/* Retention (optional) */}
          {cfg.retention && retentionData && (
            <div className="space-y-2">
              <Label htmlFor="maint-retention" className={FIELD_LABEL}>{cfg.retention.label}</Label>
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-sm text-muted-foreground">{cfg.retention.hint}</span>
                <Input
                  id="maint-retention"
                  type="number" min={1} max={3650}
                  value={retention}
                  onChange={e => setRetention(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
          )}

          {/* Last run */}
          {job?.lastRunAt && (
            <p className="text-xs text-muted-foreground">
              Last run: {new Date(job.lastRunAt).toLocaleString()}
              {job.lastRunStatus && ` — ${job.lastRunStatus}`}
            </p>
          )}

          {error     && <p className="text-sm text-destructive">{error}</p>}
          {runResult && <p className="text-sm text-green-600">{runResult}</p>}
        </div>

        <DialogFooter>
          {cfg.runner && (
            <Button variant="outline" onClick={handleRun} disabled={running || saving} className="mr-auto gap-1.5">
              <Play className="h-3.5 w-3.5" />
              {running ? 'Running…' : 'Run Now'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !job}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MaintenancePage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<JobConfig | null>(null)

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['scheduled-jobs'],
    queryFn:  getScheduledJobs,
  })

  const toggleMutation = useMutation({
    mutationFn: (job: ScheduledJob) =>
      updateScheduledJob(job.name, job.cronExpression, !job.enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })

  // Run-now dispatched from the kebab. Variables stays populated for the full
  // lifecycle of the mutation so we can highlight the active row while pending.
  const runMutation = useMutation({
    mutationFn: (cfg: JobConfig) => cfg.runner!(),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['scheduled-jobs'] }),
  })

  // editing is a config; we resolve it to a live job on each render so the
  // dialog always sees the freshest enabled/schedule state.
  const editingJob = editing ? (jobs?.find(j => j.name === editing.name) ?? null) : null

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Settings', to: '/settings' },
        { label: 'Maintenance' },
      ]} />

      <div>
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Database housekeeping tasks and their automated schedules.
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Column headers */}
          <div className={`grid ${ROW_GRID} gap-5 px-5 py-3 border-b border-border/40 bg-muted/40`}>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Run</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Status</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            <span />
          </div>

          {JOBS.map(cfg => {
            const job = jobs?.find(j => j.name === cfg.name) ?? null
            const isRunning = runMutation.isPending && runMutation.variables?.name === cfg.name
            return (
              <JobRow
                key={cfg.name}
                cfg={cfg}
                job={job}
                onEdit={() => setEditing(cfg)}
                onToggle={() => job && toggleMutation.mutate(job)}
                onRun={() => runMutation.mutate(cfg)}
                toggling={toggleMutation.isPending}
                running={isRunning}
              />
            )
          })}
        </div>
      )}

      <JobEditDialog
        cfg={editing}
        job={editingJob}
        open={!!editing}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
