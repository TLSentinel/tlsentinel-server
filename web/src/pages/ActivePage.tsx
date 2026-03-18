import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listExpiry, type ExpiringCertItem } from '@/api/dashboard'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type CertStatus = 'expired' | 'critical' | 'warning' | 'ok'

function getStatus(daysRemaining: number): CertStatus {
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= 7) return 'critical'
  if (daysRemaining <= 30) return 'warning'
  return 'ok'
}

const STATUS_META: Record<CertStatus, { label: string; className: string }> = {
  expired:  { label: 'Expired',  className: 'bg-red-100 text-red-800 border border-red-200' },
  critical: { label: 'Critical', className: 'bg-orange-100 text-orange-800 border border-orange-200' },
  warning:  { label: 'Warning',  className: 'bg-amber-100 text-amber-800 border border-amber-200' },
  ok:       { label: 'OK',       className: 'bg-green-100 text-green-800 border border-green-200' },
}

function StatusBadge({ daysRemaining }: { daysRemaining: number }) {
  const status = getStatus(daysRemaining)
  const { label, className } = STATUS_META[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtDays(days: number): string {
  if (days < 0) return `${Math.abs(days)}d ago`
  if (days === 0) return 'Today'
  return `${days}d`
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

type FilterTab = 'all' | CertStatus

interface FilterCounts {
  all: number
  expired: number
  critical: number
  warning: number
  ok: number
}

function computeCounts(items: ExpiringCertItem[]): FilterCounts {
  const counts: FilterCounts = { all: items.length, expired: 0, critical: 0, warning: 0, ok: 0 }
  for (const item of items) {
    counts[getStatus(item.daysRemaining)]++
  }
  return counts
}

interface FilterBarProps {
  active: FilterTab
  counts: FilterCounts
  onChange: (tab: FilterTab) => void
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'expired',  label: 'Expired' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning',  label: 'Warning' },
  { key: 'ok',       label: 'OK' },
]

function FilterBar({ active, counts, onChange }: FilterBarProps) {
  return (
    <div className="flex gap-1 flex-wrap">
      {TABS.map(({ key, label }) => {
        const count = counts[key]
        const isActive = active === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={[
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
            ].join(' ')}
          >
            {label}
            <span
              className={[
                'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-semibold',
                isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-foreground',
              ].join(' ')}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivePage() {
  const [items, setItems] = useState<ExpiringCertItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listExpiry()
      setItems(data.items ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load active certificates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => computeCounts(items), [items])

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter(i => getStatus(i.daysRemaining) === filter)),
    [items, filter],
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Active</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Active certificates across all monitored hosts
        </p>
      </div>

      {/* Filter bar */}
      <FilterBar active={filter} counts={counts} onChange={setFilter} />

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Host</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Common Name</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-20 text-right">Days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!loading && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {filter === 'all'
                    ? 'No hosts with active certificates yet.'
                    : `No ${filter} certificates.`}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              visible.map((item) => (
                <TableRow key={`${item.hostId}-${item.fingerprint}`}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/hosts/${item.hostId}`}
                      className="hover:underline"
                    >
                      {item.hostName}
                    </Link>
                  </TableCell>

                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {item.dnsName}:{item.port}
                  </TableCell>

                  <TableCell>
                    <StatusBadge daysRemaining={item.daysRemaining} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {item.commonName}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(item.notAfter)}
                  </TableCell>

                  <TableCell className="text-right">
                    <span
                      className={[
                        'font-mono text-sm font-medium',
                        item.daysRemaining < 0
                          ? 'text-red-600'
                          : item.daysRemaining <= 7
                          ? 'text-orange-600'
                          : item.daysRemaining <= 30
                          ? 'text-amber-600'
                          : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {fmtDays(item.daysRemaining)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
