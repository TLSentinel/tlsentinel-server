import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Archive } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  getScanHistoryRetention, setScanHistoryRetention,
  getScheduledJobs, updateScheduledJob,
  type ScheduledJob,
} from '@/api/settings'

// ── Schedule picker ───────────────────────────────────────────────────────────

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly'

interface Schedule {
  frequency: Frequency
  hour: number    // 0–23
  minute: number  // 0–59
  weekday: number // 0=Sun … 6=Sat (weekly only)
  day: number     // 1–28 (monthly only)
}

function cronToSchedule(expr: string): Schedule | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hr, dom, , dow] = parts

  if (min === '0' && hr === '*' && dom === '*' && dow === '*')
    return { frequency: 'hourly', hour: 0, minute: 0, weekday: 0, day: 1 }

  const h = parseInt(hr), m = parseInt(min)
  if (isNaN(h) || isNaN(m)) return null

  if (dom === '*' && dow === '*')
    return { frequency: 'daily', hour: h, minute: m, weekday: 0, day: 1 }

  if (dom === '*' && dow !== '*') {
    const d = parseInt(dow)
    if (isNaN(d)) return null
    return { frequency: 'weekly', hour: h, minute: m, weekday: d, day: 1 }
  }

  if (dom !== '*' && dow === '*') {
    const d = parseInt(dom)
    if (isNaN(d)) return null
    return { frequency: 'monthly', hour: h, minute: m, weekday: 0, day: d }
  }

  return null
}

function scheduleToCron(s: Schedule): string {
  switch (s.frequency) {
    case 'hourly':  return `0 * * * *`
    case 'daily':   return `${s.minute} ${s.hour} * * *`
    case 'weekly':  return `${s.minute} ${s.hour} * * ${s.weekday}`
    case 'monthly': return `${s.minute} ${s.hour} ${s.day} * *`
  }
}

const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 15, 30, 45]

function SchedulePicker({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
  const [sched, setSched] = useState<Schedule>(
    cronToSchedule(value) ?? { frequency: 'daily', hour: 2, minute: 0, weekday: 0, day: 1 }
  )

  useEffect(() => {
    const parsed = cronToSchedule(value)
    if (parsed) setSched(parsed)
  }, [value])

  function update(patch: Partial<Schedule>) {
    const next = { ...sched, ...patch }
    setSched(next)
    onChange(scheduleToCron(next))
  }

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={sched.frequency} onValueChange={v => update({ frequency: v as Frequency })}>
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="hourly">Hourly</SelectItem>
          <SelectItem value="daily">Daily</SelectItem>
          <SelectItem value="weekly">Weekly</SelectItem>
          <SelectItem value="monthly">Monthly</SelectItem>
        </SelectContent>
      </Select>

      {sched.frequency === 'weekly' && (
        <Select value={String(sched.weekday)} onValueChange={v => update({ weekday: parseInt(v) })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {sched.frequency === 'monthly' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">on day</span>
          <Input
            type="number" min={1} max={28}
            value={sched.day}
            onChange={e => update({ day: parseInt(e.target.value) || 1 })}
            className="w-16"
          />
        </div>
      )}

      {sched.frequency !== 'hourly' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">at</span>
          <Select value={String(sched.hour)} onValueChange={v => update({ hour: parseInt(v) })}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HOURS.map(h => <SelectItem key={h} value={String(h)}>{pad(h)}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">:</span>
          <Select value={String(sched.minute)} onValueChange={v => update({ minute: parseInt(v) })}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MINUTES.map(m => <SelectItem key={m} value={String(m)}>{pad(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <span className="font-mono text-xs text-muted-foreground">{scheduleToCron(sched)}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const [retentionDays, setRetentionDays] = useState(90)
  const [job, setJob]                     = useState<ScheduledJob | null>(null)
  const [cronExpr, setCronExpr]           = useState('0 2 * * *')
  const [enabled, setEnabled]             = useState(true)

  const [savingRetention, setSavingRetention] = useState(false)
  const [savingSchedule, setSavingSchedule]   = useState(false)
  const [running, setRunning]                 = useState(false)
  const [retentionError, setRetentionError]   = useState<string | null>(null)
  const [scheduleError, setScheduleError]     = useState<string | null>(null)
  const [retentionSuccess, setRetentionSuccess] = useState(false)
  const [scheduleSuccess, setScheduleSuccess]   = useState(false)

  useEffect(() => {
    getScanHistoryRetention().then(r => setRetentionDays(r.days)).catch(() => {})
    getScheduledJobs().then(jobs => {
      const j = jobs.find(j => j.name === 'purge_scan_history') ?? null
      if (j) { setJob(j); setCronExpr(j.cronExpression); setEnabled(j.enabled) }
    }).catch(() => {})
  }, [])

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

  async function handleSaveSchedule() {
    if (!job) return
    setSavingSchedule(true)
    setScheduleError(null)
    setScheduleSuccess(false)
    try {
      const updated = await updateScheduledJob(job.name, cronExpr, enabled)
      setJob(updated)
      setScheduleSuccess(true)
      setTimeout(() => setScheduleSuccess(false), 3000)
    } catch {
      setScheduleError('Failed to save schedule.')
    } finally {
      setSavingSchedule(false)
    }
  }

  function handleRun() {
    setRunning(true)
    setTimeout(() => setRunning(false), 1500) // placeholder until API exists
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            Purge Scan History
          </CardTitle>
          <CardDescription>
            Remove scan history records older than the retention window. The most recent
            entry per endpoint is always kept regardless of age.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Retention setting */}
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

          <div className="border-t" />

          {/* Schedule */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Automatic Schedule</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{enabled ? 'Enabled' : 'Disabled'}</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>
            <SchedulePicker value={cronExpr} onChange={setCronExpr} />
            {job?.lastRunAt && (
              <p className="text-xs text-muted-foreground">
                Last run: {new Date(job.lastRunAt).toLocaleString()}
                {job.lastRunStatus && ` — ${job.lastRunStatus}`}
              </p>
            )}
            {scheduleError   && <p className="text-sm text-destructive">{scheduleError}</p>}
            {scheduleSuccess && <p className="text-sm text-green-600">Schedule saved.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleSaveSchedule} disabled={savingSchedule || !job}>
                {savingSchedule ? 'Saving…' : 'Save Schedule'}
              </Button>
              <Button variant="destructive" onClick={handleRun} disabled={running}>
                {running ? 'Running…' : 'Run Now'}
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
