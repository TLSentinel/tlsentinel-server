import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getEndpoint, getScanHistory } from '@/api/endpoints'
import { Breadcrumb } from '@/components/Breadcrumb'
import TablePagination from '@/components/TablePagination'
import { ScanHistoryRow } from './detail/shared'

const PAGE_SIZE = 50

/**
 * Full paginated scan history for a single endpoint. The detail page only
 * shows the most recent 10 rows to avoid wall-of-text issues on endpoints
 * behind CDN/geo-LB (where every scan resolves a different IP and therefore
 * logs a new history row per scanResultChanged). This page is the escape
 * hatch for "show me everything."
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

  const { data, isLoading } = useQuery({
    queryKey: ['endpoint', endpointID, 'history', page],
    queryFn: () => getScanHistory(endpointID, page, PAGE_SIZE),
    enabled: !!endpointID,
    placeholderData: keepPreviousData,
  })

  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <Breadcrumb items={[
        { label: 'Endpoints', to: '/endpoints' },
        { label: endpoint?.name ?? '…', to: endpointID ? `/endpoints/${endpointID}` : undefined },
        { label: 'Scan History' },
      ]} />

      <div>
        <h1 className="text-3xl font-bold">Scan History</h1>
        {endpoint && (
          <p className="mt-1 text-sm text-muted-foreground">
            Full audit trail for <span className="font-medium text-foreground">{endpoint.name}</span>.
            A row is written whenever the observed fingerprint, TLS version, resolved IP, or error
            state changes from the previous scan.
          </p>
        )}
      </div>

      <div className="rounded-xl bg-card border border-border p-6">
        {isLoading ? (
          <p className="text-sm italic text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No scan history yet.</p>
        ) : (
          <div>
            {items.map((item) => <ScanHistoryRow key={item.id} item={item} />)}
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
