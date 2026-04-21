import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CalendarX2, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listActive } from '@/api/certificates'
import type { ExpiringCertItem } from '@/api/certificates'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, fmtDate } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Calendar view — was /calendar. Month grid + day-detail sidebar for the same
// expiring-certs dataset the list view shows. MonitorPage owns the page
// heading and view toggle; this component renders the month navigator,
// calendar grid, and selected-day sidebar.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toDateKey(iso: string): string {
  return iso.slice(0, 10)
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function urgencyChip(days: number): string {
  if (days < 0)   return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-400/40'
  if (days <= 30) return 'bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-400/40'
  return 'bg-green-400/15 text-green-700 dark:text-green-400 border-green-400/40'
}

function urgencyDot(days: number): string {
  if (days < 0)   return 'bg-red-500'
  if (days <= 30) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function daysLabel(days: number): string {
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  return `${days}d remaining`
}

function groupByDate(items: ExpiringCertItem[]): Map<string, ExpiringCertItem[]> {
  const map = new Map<string, ExpiringCertItem[]>()
  for (const cert of items) {
    const key = toDateKey(cert.notAfter)
    const arr = map.get(key) ?? []
    arr.push(cert)
    map.set(key, arr)
  }
  return map
}

function buildGrid(year: number, month: number): (string | null)[][] {
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${WEEKDAY_LONG[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3

export default function MonitorCalendarView() {
  const today = new Date()
  const [year, setYear]                 = useState(today.getFullYear())
  const [month, setMonth]               = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string>(todayKey())

  const { data, isLoading } = useQuery({
    queryKey: ['active-calendar'],
    queryFn: () => listActive(1, 10000, '', '', ''),
    staleTime: 5 * 60 * 1000,
  })

  const byDate = useMemo(() => groupByDate(data?.items ?? []), [data])
  const grid   = useMemo(() => buildGrid(year, month), [year, month])
  const today_ = todayKey()

  // When navigating months, pin selection to the first day in that month with
  // expiries; fall back to the 1st so the sidebar still has something to show.
  useEffect(() => {
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
    if (selectedDate.startsWith(monthPrefix)) return
    const flat = grid.flat().filter((d): d is string => d !== null)
    const firstWithCerts = flat.find(d => (byDate.get(d)?.length ?? 0) > 0)
    setSelectedDate(firstWithCerts ?? flat[0] ?? todayKey())
  }, [year, month, grid, byDate, selectedDate])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const selectedCerts = (byDate.get(selectedDate) ?? [])
    .slice()
    .sort((a, b) => a.daysRemaining - b.daysRemaining)

  return (
    <div className="grid gap-x-4 gap-y-3 lg:grid-cols-[1fr_20rem]">
      {/* Row 1 col 1: month navigator */}
      <div className="flex items-center justify-end">
        <div className="grid grid-cols-[auto_auto_auto] items-center gap-1 rounded-md bg-muted/40 px-1 py-1">
          <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10rem] text-center text-base font-semibold">
            {MONTH_NAMES[month]} {year}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {/* Row 1 col 2: blank */}
      <div className="hidden lg:block" />

      {/* Row 2 col 1: calendar */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {DOW.map(d => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {isLoading ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {grid.flat().map((dateStr, idx) => {
              if (!dateStr) {
                return (
                  <div
                    key={idx}
                    className="min-h-[100px] border-b border-r last:border-r-0 bg-muted/20"
                  />
                )
              }

              const endpoints = (byDate.get(dateStr) ?? [])
                .slice()
                .sort((a, b) => a.daysRemaining - b.daysRemaining)
              const isToday    = dateStr === today_
              const isSelected = dateStr === selectedDate
              const day        = Number(dateStr.slice(8))
              const visible    = endpoints.slice(0, MAX_VISIBLE)
              const overflow   = endpoints.length - MAX_VISIBLE

              return (
                <button
                  type="button"
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={cn(
                    'min-h-[100px] border-b border-r p-1.5 flex flex-col gap-1 text-left transition-colors',
                    isSelected
                      ? 'bg-primary/5 ring-1 ring-inset ring-primary/40'
                      : 'hover:bg-muted/40',
                  )}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-end">
                    <span className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      isToday && 'bg-primary text-primary-foreground',
                      !isToday && 'text-muted-foreground',
                    )}>
                      {day}
                    </span>
                  </div>

                  {/* Endpoint chips */}
                  {visible.map((cert, i) => (
                    <Tooltip key={`${cert.endpointId}-${cert.fingerprint}-${i}`}>
                      <TooltipTrigger asChild>
                        <Link
                          to={`/endpoints/${cert.endpointId}`}
                          onClick={e => e.stopPropagation()}
                          className={cn(
                            'truncate rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight transition-opacity hover:opacity-75',
                            urgencyChip(cert.daysRemaining),
                          )}
                        >
                          {cert.endpointName}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="min-w-48 p-3">
                        <div className="flex flex-col gap-1.5">
                          <p className="font-semibold">{cert.endpointName}</p>
                          <p className="text-xs text-muted-foreground">{cert.commonName}</p>
                          <p className="text-xs text-muted-foreground">{fmtDate(cert.notAfter)}</p>
                          <p className="text-xs text-muted-foreground">{daysLabel(cert.daysRemaining)}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}

                  {overflow > 0 && (
                    <span className="text-left text-[11px] text-muted-foreground">
                      +{overflow} more
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Row 2 col 2: day detail sidebar */}
      <aside className="rounded-lg border bg-card overflow-hidden self-start">
        <div className="px-5 py-4 border-b bg-muted/40">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {selectedDate === today_ ? 'Today' : 'Selected date'}
          </p>
          <p className="mt-0.5 text-sm font-semibold">{formatLongDate(selectedDate)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedCerts.length === 0
              ? 'No certificates expire on this date.'
              : `${selectedCerts.length} certificate${selectedCerts.length === 1 ? '' : 's'} expiring`}
          </p>
        </div>

        {selectedCerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <CalendarX2 className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Pick a highlighted day to see details.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {selectedCerts.map((cert, i) => (
              <li key={`${cert.endpointId}-${cert.fingerprint}-${i}`}>
                <Link
                  to={`/endpoints/${cert.endpointId}`}
                  className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', urgencyDot(cert.daysRemaining))} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{cert.endpointName}</p>
                    <p className="truncate text-xs text-muted-foreground">{cert.commonName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{daysLabel(cert.daysRemaining)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
