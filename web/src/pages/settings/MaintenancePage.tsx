import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Archive, Bell, ScrollText, BellOff, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import SchedulePicker from '@/components/SchedulePicker'
import {
  getScanHistoryRetention, setScanHistoryRetention,
  getAuditLogRetention, setAuditLogRetention,
  getScheduledJobs, updateScheduledJob,
  runPurgeScanHistory, runPurgeAuditLogs, runPurgeExpiryAlerts, runRefreshRootStores,
  type ScheduledJob,
} from '@/api/settings'

// ── Reusable job schedule card ────────────────────────────────────────────────

function JobScheduleCard({
  job,
  icon,
  title,
  description,
  onRun,
  children,
}: {
  job: ScheduledJob | null
  icon: React.ReactNode
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Schedule</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{enabled ? 'Enabled' : 'Disabled'}</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
          <SchedulePicker value={cronExpr} onChange={setCronExpr} />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {job?.lastRunAt && (
                <p className="text-xs text-muted-foreground">
                  Last run: {new Date(job.lastRunAt).toLocaleString()}
                  {job.lastRunStatus && ` — ${job.lastRunStatus}`}
                </p>
              )}
              {onRun && (
                <Button variant="ghost" size="sm" onClick={handleRun} disabled={running}
                  className="text-xs text-muted-foreground hover:text-foreground">
                  {running ? 'Running…' : 'Run Now'}
                </Button>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {error     && <p className="text-sm text-destructive">{error}</p>}
              {success   && <p className="text-sm text-green-600">Schedule saved.</p>}
              {runResult && <p className="text-sm text-green-600">{runResult}</p>}
              <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || !job}>
                {saving ? 'Saving…' : 'Save Schedule'}
              </Button>
            </div>
          </div>
        </div>

        {children && (
          <>
            <div className="border-t" />
            {children}
          </>
        )}
      </CardContent>
    </Card>
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
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Maintenance</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Database housekeeping tasks and their automated schedules.
        </p>
      </div>

      <JobScheduleCard
        job={alertsJob}
        icon={<Bell className="h-4 w-4 text-muted-foreground" />}
        title="Certificate Expiry Alerts"
        description="Send email alerts to subscribers when certificates approach their expiry thresholds."
      />

      <JobScheduleCard
        job={expiryPurgeJob}
        icon={<BellOff className="h-4 w-4 text-muted-foreground" />}
        title="Purge Expiry Alert Records"
        description="Remove sent-alert tracking records for certificates that are no longer active on any endpoint. Clears the slate for replaced certificates so fresh alerts fire for new ones, while preserving records for active certs to prevent duplicate notifications."
        onRun={async () => {
          const r = await runPurgeExpiryAlerts()
          return r.deleted === 1 ? 'Removed 1 record.' : `Removed ${r.deleted} records.`
        }}
      />

      <JobScheduleCard
        job={purgeJob}
        icon={<Archive className="h-4 w-4 text-muted-foreground" />}
        title="Purge Scan History"
        description="Remove scan history records older than the retention window. The most recent entry per endpoint is always kept regardless of age."
        onRun={async () => {
          const r = await runPurgeScanHistory()
          return r.deleted === 1 ? 'Removed 1 row.' : `Removed ${r.deleted} rows.`
        }}
      >
        {/* Retention setting lives inside the purge card */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Retention</Label>
          <div className="flex items-center gap-3">
            <Label htmlFor="retention-days" className="shrink-0 text-muted-foreground">Keep history for</Label>
            <Input
              id="retention-days"
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={e => setRetentionDays(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          {retentionError   && <p className="text-sm text-destructive">{retentionError}</p>}
          {retentionSuccess && <p className="text-sm text-green-600">Saved.</p>}
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleSaveRetention} disabled={savingRetention}>
              {savingRetention ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </JobScheduleCard>

      <JobScheduleCard
        job={auditPurgeJob}
        icon={<ScrollText className="h-4 w-4 text-muted-foreground" />}
        title="Purge Audit Logs"
        description="Remove audit log entries older than the retention window."
        onRun={async () => {
          const r = await runPurgeAuditLogs()
          return r.deleted === 1 ? 'Removed 1 entry.' : `Removed ${r.deleted} entries.`
        }}
      >
        <div className="space-y-3">
          <Label className="text-sm font-medium">Retention</Label>
          <div className="flex items-center gap-3">
            <Label htmlFor="audit-retention-days" className="shrink-0 text-muted-foreground">Keep logs for</Label>
            <Input
              id="audit-retention-days"
              type="number"
              min={1}
              max={3650}
              value={auditRetentionDays}
              onChange={e => setAuditRetentionDays(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          {auditRetentionError   && <p className="text-sm text-destructive">{auditRetentionError}</p>}
          {auditRetentionSuccess && <p className="text-sm text-green-600">Saved.</p>}
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleSaveAuditRetention} disabled={savingAuditRetention}>
              {savingAuditRetention ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </JobScheduleCard>

      <JobScheduleCard
        job={rootStoresJob}
        icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
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
