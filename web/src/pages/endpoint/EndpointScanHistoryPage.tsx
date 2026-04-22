import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { getEndpoint, getScanHistory } from '@/api/endpoints'
import type { EndpointScanHistoryItem } from '@/types/api'
import { Breadcrumb } from '@/components/Breadcrumb'
import TablePagination from '@/components/TablePagination'
import { fmtDateTime } from '@/lib/utils'

const PAGE_SIZE = 50
// Status icon · Time · TLS · Resolved IP · Fingerprint
const ROW_GRID = 'grid-cols-[1.5rem_11rem_5rem_10rem_1fr]'

/**
 * Full paginated scan history for a single endpoint. The detail page only
 * shows the most recent 10 rows to keep its sidebar card readable; this page
 * is the "show me everything" escape hatch with a full table layout and the
 * resolved IP included — useful for CDN/geo-LB targets where the IP rotates
 * across scans.
 */
export default function EndpointScanHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const endpointID = id ?? ''
  const [page, setPage] = useState(1)

  const { data: endpoint } = useQuery({
    queryKey: ['endpoint', endpointID],
    queryFn: () => getEndpoint(endpointID),
    enabled: !!endpointID,
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['endpoint', endpointID, 'history', page],
    queryFn: () => getScanHistory(endpointID, page, PAGE_SIZE),
    enabled: !!endpointID,
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Endpoints', to: '/endpoints' },
        { label: endpoint?.name ?? '…', to: endpointID ? `/endpoints/${endpointID}` : undefined },
        { label: 'Scan History' },
      ]} />

      <div>
        <h1 className="text-2xl font-semibold">Scan History</h1>
        {endpoint && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            Full audit trail for <span className="font-medium text-foreground">{endpoint.name}</span>.
            A row is written whenever the observed fingerprint, TLS version, resolved IP, or error
            state differs from the previous scan.
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Time</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">TLS</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolved IP</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fingerprint</span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No scan history yet.</div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {items.map((item) => <Row key={item.id} item={item} />)}
          </div>
        )}
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        noun="scan"
      />
    </div>
  )
}

function Row({ item }: { item: EndpointScanHistoryItem }) {
  const ok = !item.scanError
  return (
    <div className="border-b border-border/40 last:border-0">
      <div className={`grid ${ROW_GRID} items-center gap-4 px-5 py-3`}>
        {ok
          ? <CheckCircle2 className="h-4 w-4 text-tertiary" />
          : <XCircle      className="h-4 w-4 text-error" />}
        <span className="text-sm whitespace-nowrap">{fmtDateTime(item.scannedAt)}</span>
        <span className="text-xs text-muted-foreground">{item.tlsVersion ?? '—'}</span>
        <span className="text-xs font-mono text-muted-foreground truncate">{item.resolvedIp ?? '—'}</span>
        {item.fingerprint ? (
          <Link
            to={`/certificates/${item.fingerprint}`}
            className="min-w-0 truncate font-mono text-xs text-muted-foreground/80 hover:text-primary hover:underline"
            title={item.fingerprint}
          >
            {item.fingerprint}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      {item.scanError && (
        <div className="px-5 pb-3 -mt-1 pl-[calc(1.25rem+1.5rem+1rem)] text-xs text-destructive">
          {item.scanError}
        </div>
      )}
    </div>
  )
}
