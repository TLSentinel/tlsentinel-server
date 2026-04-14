import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import FilterDropdown from '@/components/FilterDropdown'
import TablePagination from '@/components/TablePagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listDiscoveryInbox, listDiscoveryNetworks } from '@/api/discovery'
import { plural } from '@/lib/utils'
import type { DiscoveryInboxItem } from '@/types/api'

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<string, string> = {
  new:       'bg-blue-500',
  promoted:  'bg-green-500',
  dismissed: 'bg-muted-foreground/40',
}

const STATUS_LABEL: Record<string, string> = {
  new:       'New',
  promoted:  'Promoted',
  dismissed: 'Dismissed',
}

function StatusIndicator({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[status] ?? 'bg-muted-foreground/40'}`} />
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function shortFingerprint(fp: string): string {
  return fp.replace(/:/g, '').slice(0, 16).toUpperCase()
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

type StatusFilter = '' | 'new' | 'promoted' | 'dismissed'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '',          label: 'All' },
  { value: 'new',       label: 'New' },
  { value: 'promoted',  label: 'Promoted' },
  { value: 'dismissed', label: 'Dismissed' },
]

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function DiscoveryInboxPage() {
  const [now] = useState(Date.now)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [networkFilter, setNetworkFilter] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['discovery-inbox', page, statusFilter, networkFilter],
    queryFn: () => listDiscoveryInbox(page, PAGE_SIZE, networkFilter, statusFilter),
    placeholderData: keepPreviousData,
  })

  const { data: networksData } = useQuery({
    queryKey: ['discovery-networks'],
    queryFn: () => listDiscoveryNetworks(1, 200),
  })

  const items: DiscoveryInboxItem[] = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const networkOptions = [
    { value: '', label: 'All networks' },
    ...(networksData?.items ?? []).map(n => ({ value: n.id, label: n.name })),
  ]

  function handleStatusChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleNetworkChange(value: string) {
    setNetworkFilter(value)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Discovery Inbox</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCount} {plural(totalCount, 'host')} discovered
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onSelect={(v) => handleStatusChange(v as StatusFilter)}
        />
        {networkOptions.length > 1 && (
          <FilterDropdown
            label="Network"
            options={networkOptions}
            value={networkFilter}
            onSelect={handleNetworkChange}
          />
        )}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IP</TableHead>
            <TableHead>Port</TableHead>
            <TableHead>rDNS</TableHead>
            <TableHead>Network</TableHead>
            <TableHead>Certificate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}

          {!isLoading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center">
                <StrixEmpty message="No discovered hosts yet." />
              </TableCell>
            </TableRow>
          )}

          {!isLoading && items.map(item => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-sm">{item.ip}</TableCell>
              <TableCell className="font-mono text-sm">{item.port}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.rdns ?? <span className="italic">—</span>}
              </TableCell>
              <TableCell className="text-sm">
                {item.networkName ?? <span className="text-muted-foreground italic">—</span>}
              </TableCell>
              <TableCell className="text-sm">
                {item.fingerprint ? (
                  <div className="flex flex-col gap-0.5">
                    {item.commonName && (
                      <span className="text-foreground">{item.commonName}</span>
                    )}
                    <Link
                      to={`/certificates/${item.fingerprint}`}
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      {shortFingerprint(item.fingerprint)}…
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ) : (
                  <span className="text-muted-foreground italic">—</span>
                )}
              </TableCell>
              <TableCell>
                <StatusIndicator status={item.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {fmtRelative(item.lastSeenAt, now)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalCount > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPrev={() => setPage(p => p - 1)}
          onNext={() => setPage(p => p + 1)}
          noun="host"
        />
      )}
    </div>
  )
}
