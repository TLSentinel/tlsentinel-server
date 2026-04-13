import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listActive } from '@/api/certificates'
import type { ExpiringCertItem } from '@/api/certificates'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, fmtDate } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['active-calendar'],
    queryFn: () => listActive(1, 10000, '', '', ''),
    staleTime: 5 * 60 * 1000,
  })

  const byDate = useMemo(() => groupByDate(data?.items ?? []), [data])
  const grid   = useMemo(() => buildGrid(year, month), [year, month])
  const today_ = todayKey()

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setExpanded({})
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setExpanded({})
  }

  function toggleExpand(dateStr: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpanded(prev => ({ ...prev, [dateStr]: !prev[dateStr] }))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Expiry Calendar</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Certificate expiry dates across all active endpoints.
        </p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-semibold">
          {MONTH_NAMES[month]} {year}
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b">
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
        <div className="grid grid-cols-7 border-l border-t">
          {grid.flat().map((dateStr, idx) => {
            if (!dateStr) {
              return (
                <div
                  key={idx}
                  className="min-h-[100px] border-b border-r bg-muted/20"
                />
              )
            }

            const endpoints = (byDate.get(dateStr) ?? [])
              .slice()
              .sort((a, b) => a.daysRemaining - b.daysRemaining)
            const isToday    = dateStr === today_
            const day        = Number(dateStr.slice(8))
            const isExpanded = expanded[dateStr] ?? false
            const visible    = isExpanded ? endpoints : endpoints.slice(0, MAX_VISIBLE)
            const overflow   = endpoints.length - MAX_VISIBLE

            return (
              <div
                key={dateStr}
                className="min-h-[100px] border-b border-r p-1.5 flex flex-col gap-1"
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
                {visible.map((cert, i) => {
                  const days = cert.daysRemaining
                  const daysLabel = days < 0
                    ? `Expired ${Math.abs(days)}d ago`
                    : days === 0
                      ? 'Expires today'
                      : `${days}d remaining`

                  return (
                    <Tooltip key={`${cert.endpointId}-${cert.fingerprint}-${i}`}>
                      <TooltipTrigger asChild>
                        <Link
                          to={`/endpoints/${cert.endpointId}`}
                          className={cn(
                            'truncate rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight transition-opacity hover:opacity-75',
                            urgencyChip(days),
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
                          <p className="text-xs text-muted-foreground">{daysLabel}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}

                {/* Overflow toggle */}
                {!isExpanded && overflow > 0 && (
                  <button
                    onClick={e => toggleExpand(dateStr, e)}
                    className="text-left text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    +{overflow} more
                  </button>
                )}
                {isExpanded && overflow > 0 && (
                  <button
                    onClick={e => toggleExpand(dateStr, e)}
                    className="text-left text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Show less
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
