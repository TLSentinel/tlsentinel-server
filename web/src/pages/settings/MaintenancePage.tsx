import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Archive, Bell, ScrollText, BellOff, ShieldCheck, Play } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import SchedulePicker from '@/components/SchedulePicker'
import { FIELD_LABEL } from '@/lib/utils'
import { Breadcrumb } from '@/components/Breadcrumb'
import {
  getScanHistoryRetention, setScanHistoryRetention,
  getAuditLogRetention, setAuditLogRetention,
  getScheduledJobs, updateScheduledJob,
  runPurgeScanHistory, runPurgeAuditLogs, runPurgeExpiryAlerts, runRefreshRootStores,
  type ScheduledJob,
} from '@/api/settings'

type Tone = 'emerald' | 'amber' | 'blue'

const TONE_CLASSES: Record<Tone, string> = {
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  amber:   'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  blue:    'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
}

// ── Reusable job schedule card ────────────────────────────────────────────────

function JobScheduleCard({
  job,
  icon,
  tone,
  title,
  description,
  onRun,
  children,
}: {
  job: ScheduledJob | null
  icon: React.ReactNode
  tone: Tone
  title: string
  description: string
  onRun?: () => Promise<string | undefined>
  children?: React.ReactNode
}) {
  const [cronExpr, setCronExpr]     = useState(job?.cronExpression ?? '0 * * * *')
  const [enabled, setEnabled]       = useState(job?.enabled ?? true)
  const [saving, setSaving]         = useState(false)
  const [running, setRunning]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [runResult, setRunResult]   = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    if (job) { setCronExpr(job.cronExpression); setEnabled(job.enabled) }
  }, [job])

  async function handleSave() {
    if (!job) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await updateScheduledJob(job.name, cronExpr, enabled)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to save schedule.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRun() {
    if (!onRun) return
    setRunning(true)
    setRunResult(null)
    setError(null)
    try {
      const msg = await onRun()
      if (msg) {
        setRunResult(msg)
        setTimeout(() => setRunResult(null), 6000)
      }
    } catch {
      setError('Run failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
          {icon}
        </div>
        <div className="space-y-1 min-w-0 flex-1">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <CardDescription className="leading-relaxed">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Enable toggle row */}
        <div className="flex items-center justify-between rounded-md border px-4 py-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enabled</Label>
            <p className="text-xs text-muted-foreground">
              {enabled ? 'This job runs automatically on its schedule.' : 'This job will not run automatically.'}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Schedule picker */}
        <div className="space-y-2">
          <Label className={FIELD_LABEL}>Schedule</Label>
          <SchedulePicker value={cronExpr} onChange={setCronExpr} />
        </div>

        {/* Retention / custom children */}
        {children}

        {/* Last run + errors */}
        <div className="space-y-1">
          {job?.lastRunAt && (
            <p className="text-xs text-muted-foreground">
              Last run: {new Date(job.lastRunAt).toLocaleString()}
              {job.lastRunStatus && ` — ${job.lastRunStatus}`}
            </p>
          )}
          {error     && <p className="text-sm text-destructive">{error}</p>}
          {success   && <p className="text-sm text-green-600">Schedule saved.</p>}
          {runResult && <p className="text-sm text-green-600">{runResult}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          {onRun ? (
            <Button variant="outline" onClick={handleRun} disabled={running} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              {running ? 'Running…' : 'Run Now'}
            </Button>
          ) : <span />}
          <Button onClick={handleSave} disabled={saving || !job}>
            {saving ? 'Saving…' : 'Save Schedule'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Retention sub-field (lives inside a JobScheduleCard) ──────────────────────

function RetentionField({
  id, label, hint,
  value, onChange,
  saving, error, success,
  onSave,
}: {
  id: string
  label: string
  hint: string
  value: number
  onChange: (n: number) => void
  saving: boolean
  error: string | null
  success: boolean
  onSave: () => void
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-4 space-y-3">
      <Label htmlFor={id} className={FIELD_LABEL}>{label}</Label>
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm text-muted-foreground">{hint}</span>
        <Input
          id={id}
          type="number"
          min={1}
          max={3650}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-24"
        />
        <span className="text-sm text-muted-foreground">days</span>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      {error   && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Saved.</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const [retentionDays, setRetentionDays]       = useState(90)
  const [savingRetention, setSavingRetention]   = useState(false)
  const [retentionError, setRetentionError]     = useState<string | null>(null)
  const [retentionSuccess, setRetentionSuccess] = useState(false)

  const [auditRetentionDays, setAuditRetentionDays]       = useState(365)
  const [savingAuditRetention, setSavingAuditRetention]   = useState(false)
  const [auditRetentionError, setAuditRetentionError]     = useState<string | null>(null)
  const [auditRetentionSuccess, setAuditRetentionSuccess] = useState(false)

  const { data: scanRetentionData } = useQuery({
    queryKey: ['scan-history-retention'],
    queryFn: getScanHistoryRetention,
  })
  const { data: auditRetentionData } = useQuery({
    queryKey: ['audit-log-retention'],
    queryFn: getAuditLogRetention,
  })
  const { data: scheduledJobsData } = useQuery({
    queryKey: ['scheduled-jobs'],
    queryFn: getScheduledJobs,
  })

  useEffect(() => {
    if (scanRetentionData) setRetentionDays(scanRetentionData.days)
  }, [scanRetentionData])

  useEffect(() => {
    if (auditRetentionData) setAuditRetentionDays(auditRetentionData.days)
  }, [auditRetentionData])

  const purgeJob          = scheduledJobsData?.find(j => j.name === 'purge_scan_history')   ?? null
  const alertsJob         = scheduledJobsData?.find(j => j.name === 'expiry_alerts')        ?? null
  const auditPurgeJob     = scheduledJobsData?.find(j => j.name === 'purge_audit_logs')     ?? null
  const expiryPurgeJob    = scheduledJobsData?.find(j => j.name === 'purge_expiry_alerts')  ?? null
  const rootStoresJob     = scheduledJobsData?.find(j => j.name === 'refresh_root_stores')  ?? null

  async function handleSaveRetention() {
    setSavingRetention(true)
    setRetentionError(null)
    setRetentionSuccess(false)
    try {
      const r = await setScanHistoryRetention(retentionDays)
      setRetentionDays(r.days)
      setRetentionSuccess(true)
      setTimeout(() => setRetentionSuccess(false), 3000)
    } catch {
      setRetentionError('Failed to save retention setting.')
    } finally {
      setSavingRetention(false)
    }
  }

  async function handleSaveAuditRetention() {
    setSavingAuditRetention(true)
    setAuditRetentionError(null)
    setAuditRetentionSuccess(false)
    try {
      const r = await setAuditLogRetention(auditRetentionDays)
      setAuditRetentionDays(r.days)
      setAuditRetentionSuccess(true)
      setTimeout(() => setAuditRetentionSuccess(false), 3000)
    } catch {
      setAuditRetentionError('Failed to save retention setting.')
    } finally {
      setSavingAuditRetention(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
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

      <JobScheduleCard
        job={alertsJob}
        tone="emerald"
        icon={<Bell className="h-5 w-5" />}
        title="Certificate Expiry Alerts"
        description="Send email alerts to subscribers when certificates approach their expiry thresholds."
      />

      <JobScheduleCard
        job={expiryPurgeJob}
        tone="amber"
        icon={<BellOff className="h-5 w-5" />}
        title="Purge Expiry Alert Records"
        description="Remove sent-alert tracking records for certificates that are no longer active on any endpoint. Clears the slate for replaced certificates so fresh alerts fire for new ones, while preserving records for active certs to prevent duplicate notifications."
        onRun={async () => {
          const r = await runPurgeExpiryAlerts()
          return r.deleted === 1 ? 'Removed 1 record.' : `Removed ${r.deleted} records.`
        }}
      />

      <JobScheduleCard
        job={purgeJob}
        tone="amber"
        icon={<Archive className="h-5 w-5" />}
        title="Purge Scan History"
        description="Remove scan history records older than the retention window. The most recent entry per endpoint is always kept regardless of age."
        onRun={async () => {
          const r = await runPurgeScanHistory()
          return r.deleted === 1 ? 'Removed 1 row.' : `Removed ${r.deleted} rows.`
        }}
      >
        <RetentionField
          id="retention-days"
          label="Retention"
          hint="Keep history for"
          value={retentionDays}
          onChange={setRetentionDays}
          saving={savingRetention}
          error={retentionError}
          success={retentionSuccess}
          onSave={handleSaveRetention}
        />
      </JobScheduleCard>

      <JobScheduleCard
        job={auditPurgeJob}
        tone="amber"
        icon={<ScrollText className="h-5 w-5" />}
        title="Purge Audit Logs"
        description="Remove audit log entries older than the retention window."
        onRun={async () => {
          const r = await runPurgeAuditLogs()
          return r.deleted === 1 ? 'Removed 1 entry.' : `Removed ${r.deleted} entries.`
        }}
      >
        <RetentionField
          id="audit-retention-days"
          label="Retention"
          hint="Keep logs for"
          value={auditRetentionDays}
          onChange={setAuditRetentionDays}
          saving={savingAuditRetention}
          error={auditRetentionError}
          success={auditRetentionSuccess}
          onSave={handleSaveAuditRetention}
        />
      </JobScheduleCard>

      <JobScheduleCard
        job={rootStoresJob}
        tone="blue"
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Refresh Root Stores"
        description="Pull the latest Apple, Chrome, Microsoft, and Mozilla root CA bundles from CCADB and update trust anchor membership. Runs weekly by default."
        onRun={async () => {
          await runRefreshRootStores()
          return 'Refresh complete.'
        }}
      />

    </div>
  )
}
