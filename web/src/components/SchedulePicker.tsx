import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

interface Schedule {
  frequency: Frequency
  hour: number
  minute: number
  weekday: number
  day: number
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
    default:        return `0 * * * *`
  }
}

const FREQUENCIES: { key: Exclude<Frequency, never>; label: string }[] = [
  { key: 'hourly',  label: 'Hourly' },
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom',  label: 'Custom' },
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS    = Array.from({ length: 24 }, (_, i) => i)
const MINUTES  = [0, 15, 30, 45]

const DEFAULT_SCHED: Schedule = { frequency: 'daily', hour: 2, minute: 0, weekday: 0, day: 1 }

function initFromValue(value: string): { sched: Schedule; customExpr: string } {
  const parsed = cronToSchedule(value)
  if (parsed) return { sched: parsed, customExpr: value }
  return { sched: { ...DEFAULT_SCHED, frequency: 'custom' }, customExpr: value }
}

export default function SchedulePicker({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
  const init = initFromValue(value)
  const [sched, setSched] = useState<Schedule>(init.sched)
  const [customExpr, setCustomExpr] = useState(init.customExpr)

  useEffect(() => {
    if (sched.frequency === 'custom') return
    const { sched: s, customExpr: c } = initFromValue(value)
    setSched(s)
    setCustomExpr(c)
  }, [value])

  function update(patch: Partial<Schedule>) {
    const next = { ...sched, ...patch }
    setSched(next)
    if (next.frequency !== 'custom') {
      onChange(scheduleToCron(next))
    }
  }

  function handleFrequencyChange(freq: Frequency) {
    if (freq === 'custom') {
      const current = sched.frequency !== 'custom' ? scheduleToCron(sched) : customExpr
      setCustomExpr(current)
      setSched(s => ({ ...s, frequency: 'custom' }))
      onChange(current)
    } else {
      update({ frequency: freq })
    }
  }

  function handleCustomChange(expr: string) {
    setCustomExpr(expr)
    onChange(expr)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const previewCron = sched.frequency === 'custom' ? customExpr : scheduleToCron(sched)

  return (
    <div className="space-y-3">
      {/* Frequency segmented buttons */}
      <div className="grid grid-cols-5 gap-2">
        {FREQUENCIES.map(f => {
          const active = sched.frequency === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => handleFrequencyChange(f.key)}
              className={[
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Sub-controls */}
      {(sched.frequency === 'weekly' || sched.frequency === 'monthly' || sched.frequency === 'daily') && (
        <div className="flex flex-wrap items-center gap-2">
          {sched.frequency === 'weekly' && (
            <Select value={String(sched.weekday)} onValueChange={v => update({ weekday: parseInt(v) })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
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
        </div>
      )}

      {sched.frequency === 'custom' && (
        <Input
          value={customExpr}
          onChange={e => handleCustomChange(e.target.value)}
          placeholder="e.g. */30 9-17 * * 1-5"
          className="font-mono text-sm"
          spellCheck={false}
        />
      )}

      {/* Cron preview */}
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <code className="font-mono text-sm text-muted-foreground">{previewCron}</code>
      </div>
    </div>
  )
}
