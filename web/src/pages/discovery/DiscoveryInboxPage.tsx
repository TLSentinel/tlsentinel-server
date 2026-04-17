import { useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EyeOff, Trash2, Plus } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import FilterDropdown from '@/components/FilterDropdown'
import TablePagination from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  listDiscoveryInbox,
  listDiscoveryNetworks,
  dismissDiscoveryInboxItem,
  deleteDiscoveryInboxItem,
} from '@/api/discovery'
import { can } from '@/api/client'
import { plural } from '@/lib/utils'
import { ApiError } from '@/types/api'
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
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  item: DiscoveryInboxItem | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ item, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!item) return
    setLoading(true)
    setError(null)
    try {
      await deleteDiscoveryInboxItem(item.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Inbox Entry</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Delete <span className="font-medium text-foreground font-mono">{item?.ip}:{item?.port}</span>?
          It will reappear as new if the scanner discovers it again.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

type NetworkFilter = string

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DiscoveryInboxPage() {
  const canEdit = can('discovery:edit')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [now] = useState(Date.now)
  const [page, setPage] = useState(1)
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('')
  const [showDismissed, setShowDismissed] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryInboxItem | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)

  const queryKey = ['discovery-inbox', page, networkFilter, showDismissed]

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => listDiscoveryInbox(page, PAGE_SIZE, networkFilter, '', showDismissed),
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

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['discovery-inbox'] })
  }

  async function handleDismiss(item: DiscoveryInboxItem) {
    setDismissing(item.id)
    try {
      await dismissDiscoveryInboxItem(item.id)
      invalidate()
    } finally {
      setDismissing(null)
    }
  }

  const colSpan = canEdit ? 8 : 7

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
      <div className="flex items-center gap-3">
        {networkOptions.length > 1 && (
          <FilterDropdown
            label="Network"
            options={networkOptions}
            value={networkFilter}
            onSelect={v => { setNetworkFilter(v); setPage(1) }}
          />
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Switch
            id="show-dismissed"
            checked={showDismissed}
            onCheckedChange={v => { setShowDismissed(v); setPage(1) }}
          />
          <Label htmlFor="show-dismissed" className="text-sm text-muted-foreground cursor-pointer">
            Show dismissed
          </Label>
        </div>
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
            {canEdit && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}

          {!isLoading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-10 text-center">
                <StrixEmpty message="No discovered hosts yet." />
              </TableCell>
            </TableRow>
          )}

          {!isLoading && items.map(item => (
            <TableRow key={item.id} className={item.status === 'dismissed' ? 'opacity-50' : ''}>
              <TableCell className="font-mono text-sm">{item.ip}</TableCell>
              <TableCell className="font-mono text-sm">{item.port}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.rdns ?? <span className="italic">—</span>}
              </TableCell>
              <TableCell className="text-sm">
                {item.networkName ?? <span className="text-muted-foreground italic">—</span>}
              </TableCell>
              <TableCell className="text-sm">
                {item.commonName ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground">{item.commonName}</span>
                    {item.notAfter && (
                      <span className="text-xs text-muted-foreground">
                        Expires {new Date(item.notAfter).toLocaleDateString()}
                      </span>
                    )}
                    {item.fingerprint && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {shortFingerprint(item.fingerprint)}…
                      </span>
                    )}
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
              {canEdit && (
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {item.status !== 'dismissed' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Add as endpoint"
                          onClick={() => navigate(`/endpoints/new?from_inbox=${item.id}`)}
                        >
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Dismiss"
                          disabled={dismissing === item.id}
                          onClick={() => handleDismiss(item)}
                        >
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              )}
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

      <DeleteDialog
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={invalidate}
      />
    </div>
  )
}
