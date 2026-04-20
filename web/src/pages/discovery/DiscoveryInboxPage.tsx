import { useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { EyeOff, Trash2, Plus, MoreVertical, Lock, ShieldOff, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import FilterDropdown from '@/components/FilterDropdown'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000)      return 'Just now'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === 'new') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
        <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
        New
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
      Dismissed
    </span>
  )
}

function CertBadge({ fingerprint, notAfter }: { fingerprint: string | null; notAfter: string | null }) {
  if (!fingerprint) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ShieldOff className="h-3.5 w-3.5 shrink-0" />
        No Cert
      </span>
    )
  }
  if (!notAfter) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Unknown
      </span>
    )
  }
  const days = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Expired
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Expiring ({days}d)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
      <Lock className="h-3.5 w-3.5 shrink-0" />
      Valid ({days}d)
    </span>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

type SignalColor = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

const SIGNAL_BORDER: Record<SignalColor, string> = {
  neutral: 'border-l-foreground/20',
  blue:    'border-l-blue-500',
  green:   'border-l-green-500',
  amber:   'border-l-amber-500',
  red:     'border-l-red-500',
}

const SIGNAL_VALUE: Record<SignalColor, string> = {
  neutral: 'text-foreground',
  blue:    'text-blue-600',
  green:   'text-green-600',
  amber:   'text-amber-600',
  red:     'text-red-600',
}

function StatCard({ label, value, signal = 'neutral' }: {
  label: string
  value: string | number
  signal?: SignalColor
}) {
  return (
    <div className={`rounded-lg border border-l-4 ${SIGNAL_BORDER[signal]} p-5 space-y-2`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${SIGNAL_VALUE[signal]}`}>{value}</p>
    </div>
  )
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
// Inbox row
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid-cols-[6rem_1.5fr_3.5rem_1.5fr_1fr_8rem_5rem_2.5rem]'

interface InboxRowProps {
  item: DiscoveryInboxItem
  now: number
  canEdit: boolean
  dismissing: string | null
  onPromote: () => void
  onDismiss: () => void
  onDelete: () => void
}

function InboxRow({ item, now, canEdit, dismissing, onPromote, onDismiss, onDelete }: InboxRowProps) {
  return (
    <div className={`grid ${ROW_GRID} items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0 ${item.status === 'dismissed' ? 'opacity-50' : ''}`}>

      {/* Status */}
      <div>
        <StatusBadge status={item.status} />
      </div>

      {/* IP */}
      <div className="min-w-0">
        <span className="font-mono text-sm font-semibold">{item.ip}</span>
      </div>

      {/* Port */}
      <div>
        <span className="font-mono text-sm text-muted-foreground">{item.port}</span>
      </div>

      {/* RDNS / Hostname */}
      <div className="min-w-0">
        <span className="text-sm text-muted-foreground truncate block">
          {item.rdns ?? <span className="italic">—</span>}
        </span>
      </div>

      {/* Network */}
      <div className="min-w-0">
        {item.networkName ? (
          <span className="inline-block text-xs bg-muted px-2.5 py-1 rounded truncate max-w-full">
            {item.networkName}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground italic">—</span>
        )}
      </div>

      {/* Certificate */}
      <div>
        <CertBadge fingerprint={item.fingerprint} notAfter={item.notAfter} />
      </div>

      {/* Last seen */}
      <div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {fmtRelative(item.lastSeenAt, now)}
        </span>
      </div>

      {/* Actions */}
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.status !== 'dismissed' && (
              <>
                <DropdownMenuItem onClick={onPromote}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add as Endpoint
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDismiss} disabled={dismissing === item.id}>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Dismiss
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function DiscoveryInboxPage() {
  const canEdit  = can('discovery:edit')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [now] = useState(Date.now)

  const [showDismissed, setShowDismissed] = useState(false)
  const [page, setPage]                   = useState(1)
  const [networkFilter, setNetworkFilter] = useState('')
  const [deleteTarget, setDeleteTarget]   = useState<DiscoveryInboxItem | null>(null)
  const [dismissing, setDismissing]       = useState<string | null>(null)

  const queryKey = ['discovery-inbox', page, networkFilter, showDismissed]

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => listDiscoveryInbox(page, PAGE_SIZE, networkFilter, '', showDismissed),
    placeholderData: keepPreviousData,
  })

  // Global counts (unaffected by current filter/view) for stat cards.
  const { data: newCountData } = useQuery({
    queryKey: ['discovery-inbox-new-count'],
    queryFn:  () => listDiscoveryInbox(1, 1, '', '', false),
  })
  const { data: allCountData } = useQuery({
    queryKey: ['discovery-inbox-all-count'],
    queryFn:  () => listDiscoveryInbox(1, 1, '', '', true),
  })

  const { data: networksData } = useQuery({
    queryKey: ['discovery-networks'],
    queryFn:  () => listDiscoveryNetworks(1, 200),
  })

  const items      = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const newCount       = newCountData?.totalCount ?? null
  const allCount       = allCountData?.totalCount ?? null
  const dismissedCount = allCount !== null && newCount !== null ? allCount - newCount : null

  const networkOptions = [
    { value: '', label: 'All Networks' },
    ...(networksData?.items ?? []).map(n => ({ value: n.id, label: n.name })),
  ]

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['discovery-inbox'] })
    queryClient.invalidateQueries({ queryKey: ['discovery-inbox-new-count'] })
    queryClient.invalidateQueries({ queryKey: ['discovery-inbox-all-count'] })
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

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, totalCount)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Discovery Inbox</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Review newly identified assets across your monitored infrastructure.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <StatCard
          label="New Findings"
          value={newCount ?? '—'}
          signal="blue"
        />
        <StatCard
          label="Dismissed"
          value={dismissedCount ?? '—'}
          signal="neutral"
        />
      </div>

      {/* Filters */}
      {networkOptions.length > 1 && (
        <div className="flex items-center justify-end">
          <FilterDropdown
            label="Network"
            options={networkOptions}
            value={networkFilter}
            onSelect={v => { setNetworkFilter(v); setPage(1) }}
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Switch
              id="show-dismissed"
              checked={showDismissed}
              onCheckedChange={v => { setShowDismissed(v); setPage(1) }}
            />
            <Label htmlFor="show-dismissed" className="text-sm text-muted-foreground cursor-pointer">
              Show dismissed
            </Label>
          </div>
          <Button variant="ghost" size="icon" onClick={invalidate} className="h-8 w-8">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IP Address</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Port</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">RDNS / Hostname</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Network</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Certificate</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Seen</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            <StrixEmpty message="No discovered hosts yet." />
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {items.map(item => (
              <InboxRow
                key={item.id}
                item={item}
                now={now}
                canEdit={canEdit}
                dismissing={dismissing}
                onPromote={() => navigate(`/endpoints/new?from_inbox=${item.id}`)}
                onDismiss={() => handleDismiss(item)}
                onDelete={() => setDeleteTarget(item)}
              />
            ))}
          </div>
        )}

        {/* Footer: count + pagination inside the card */}
        <div className="flex items-center justify-between border-t border-border/40 px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? 'No discoveries'
              : <>Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> {plural(totalCount, 'discovery')}</>}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <span className="px-2 text-sm tabular-nums text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <DeleteDialog
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={invalidate}
      />
    </div>
  )
}
