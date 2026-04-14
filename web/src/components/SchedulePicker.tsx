import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly'

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
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS    = Array.from({ length: 24 }, (_, i) => i)
const MINUTES  = [0, 15, 30, 45]

export default function SchedulePicker({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
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
    </div>
  )
}
