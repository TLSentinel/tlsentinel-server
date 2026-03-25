import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Check, Search } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listActive, type ExpiringCertItem } from '@/api/certificates'
import { ApiError } from '@/types/api'
import { fmtDate } from '@/lib/utils'
import { fmtDays } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type CertStatus = 'expired' | 'critical' | 'warning' | 'ok'
type StatusFilter = '' | CertStatus
type SortOption = '' | 'days_desc' | 'host_name' | 'common_name'

function getStatus(daysRemaining: number): CertStatus {
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= 7) return 'critical'
  if (daysRemaining <= 30) return 'warning'
  return 'ok'
}

const STATUS_META: Record<CertStatus, { label: string; className: string }> = {
  expired:  { label: 'Expired',  className: 'bg-red-50    text-red-700    border border-red-500' },
  critical: { label: 'Critical', className: 'bg-orange-50 text-orange-700 border border-orange-500' },
  warning:  { label: 'Warning',  className: 'bg-amber-50  text-amber-700  border border-amber-500' },
  ok:       { label: 'OK',       className: 'bg-green-50  text-green-700  border border-green-500' },
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '',         label: 'All' },
  { value: 'expired',  label: 'Expired' },
  { value: 'critical', label: 'Critical (≤7d)' },
  { value: 'warning',  label: 'Warning (≤30d)' },
  { value: 'ok',       label: 'OK' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: '',            label: 'Expiring soonest' },
  { value: 'days_desc',   label: 'Most time left' },
  { value: 'host_name',   label: 'Host name A→Z' },
  { value: 'common_name', label: 'Common name A→Z' },
]

function StatusBadge({ daysRemaining }: { daysRemaining: number }) {
  const status = getStatus(daysRemaining)
  const { label, className } = STATUS_META[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function ActivePage() {
  const [items, setItems] = useState<ExpiringCertItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [sortOption, setSortOption] = useState<SortOption>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce search — reset to page 1 when query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listActive(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption)
      setItems(data.items ?? [])
      setTotalCount(data.totalCount)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load active certificates.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, sortOption])

  useEffect(() => {
    load()
  }, [load])

  function handleStatusChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleSortChange(value: SortOption) {
    setSortOption(value)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const activeStatusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label ?? 'All'
  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortOption)?.label ?? 'Expiring soonest'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Active</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Active certificates across all monitored hosts
        </p>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search host or cert name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              Status
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUS_OPTIONS.map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => handleStatusChange(value)}
                className="gap-2"
              >
                <Check className={`h-4 w-4 ${statusFilter === value ? 'opacity-100' : 'opacity-0'}`} />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              Sort
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SORT_OPTIONS.map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => handleSortChange(value)}
                className="gap-2"
              >
                <Check className={`h-4 w-4 ${sortOption === value ? 'opacity-100' : 'opacity-0'}`} />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active filter context line */}
      <p className="text-sm text-muted-foreground">
        Showing results for{' '}
        <span className="font-semibold text-foreground">{activeStatusLabel.toLowerCase()}</span>
        {debouncedSearch && (
          <> matching <span className="font-semibold text-foreground">"{debouncedSearch}"</span></>
        )}
        {' · '}sorted by{' '}
        <span className="font-semibold text-foreground">{activeSortLabel.toLowerCase()}</span>
      </p>

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

            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  {debouncedSearch || statusFilter
                    ? <span className="text-sm text-muted-foreground">No certificates match your filters.</span>
                    : <StrixEmpty message="No hosts with active certificates yet." />}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              items.map((item) => (
                <TableRow key={`${item.hostId}-${item.fingerprint}`}>
                  <TableCell className="font-medium">
                    <Link to={`/endpoints/${item.hostId}`} className="hover:underline">
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

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {totalCount === 0 ? 'No results' : `Page ${page} of ${totalPages} · ${totalCount} total`}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
