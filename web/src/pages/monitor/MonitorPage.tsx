import { useSearchParams } from 'react-router-dom'
import { List, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import MonitorListView from './MonitorListView'
import MonitorCalendarView from './MonitorCalendarView'

// ---------------------------------------------------------------------------
// Monitor — the daily-driver view of active certificates. Same dataset rendered
// two ways: a filterable list (was /active) and a monthly calendar (was
// /calendar). The view is URL-backed via `?view=list|calendar` so a link can
// land the user directly in either shape.
//
// Each view owns its own local state (filters, selected day, etc.). Switching
// unmounts the other view — simpler than shared state and the lost filter
// state isn't worth preserving across a deliberate toggle.
// ---------------------------------------------------------------------------

type View = 'list' | 'calendar'

const VIEWS: { value: View; label: string; icon: typeof List }[] = [
  { value: 'list',     label: 'List',     icon: List },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
]

function isView(v: string | null): v is View {
  return v === 'list' || v === 'calendar'
}

export default function MonitorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('view')
  const view: View = isView(raw) ? raw : 'list'

  function setView(next: View) {
    // Drop the param entirely when it matches the default — keeps the URL
    // clean for the common case where someone just clicks "Monitor" in the nav.
    const params = new URLSearchParams(searchParams)
    if (next === 'list') params.delete('view')
    else                 params.set('view', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="space-y-6">
      {/* Title + view toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Monitor</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Active certificates across every endpoint — filter, sort, or view expirations by date.
          </p>
        </div>

        {/* Segmented control */}
        <div role="tablist" aria-label="View" className="inline-flex rounded-md border bg-card p-0.5">
          {VIEWS.map(v => {
            const Icon = v.icon
            const selected = view === v.value
            return (
              <button
                key={v.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setView(v.value)}
                className={cn(
                  'inline-flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active view */}
      {view === 'list' ? <MonitorListView /> : <MonitorCalendarView />}
    </div>
  )
}
