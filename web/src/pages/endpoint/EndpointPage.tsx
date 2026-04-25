import { useState, useEffect, useMemo } from 'react'
import { Plus, Upload, Pencil, Trash2, Copy, MoreVertical, AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Check, Tag, X, ExternalLink, Server, Wifi, WifiOff } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import StrixEmpty from '@/components/StrixEmpty'
import SearchInput from '@/components/SearchInput'
import FilterDropdown from '@/components/FilterDropdown'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listEndpoints, listErrorEndpoints, deleteEndpoint } from '@/api/endpoints'
import { listTagCategories } from '@/api/tags'
import { can } from '@/api/client'
import type { EndpointListItem, CategoryWithTags } from '@/types/api'
import { ApiError } from '@/types/api'
import { plural } from '@/lib/utils'
import { categoryColor } from '@/lib/tag-colors'
import BulkImportDialog from '@/components/BulkImportDialog'
import BulkActionBar from '@/components/BulkActionBar'
import BulkDeleteEndpointsDialog from './BulkDeleteEndpointsDialog'
import BulkTagEndpointsDialog from './BulkTagEndpointsDialog'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Per-type configuration
//
// The list surface is shared across /host-endpoints, /saml-endpoints, and
// /manual-endpoints — callers pass `type` and a config drives per-type:
//   - page title + description
//   - stat-card set (manual has no scan errors)
//   - column set (manual has no address / last-scanned columns)
//   - search placeholder + sort options
//   - empty-state copy
//   - the /endpoints/new?type=… target for the Add button
//
// When per-type divergence outgrows this config, split into dedicated pages
// — see _notes/BACKLOG.md ("Split 'Endpoints' nav").
// ---------------------------------------------------------------------------

type EndpointType = 'host' | 'saml' | 'manual'
type HostStatus   = '' | 'enabled' | 'disabled'
type SortOption   = '' | 'name' | 'dns_name' | 'last_scanned'

interface TypeConfig {
  title:             string
  description:       string
  /** Title-cased singular noun, e.g. "Host Endpoint". Pluralized via `plural()` for counts. */
  noun:              string
  searchPlaceholder: string
  sortOptions:       { value: SortOption; label: string }[]
  showAddress:       boolean
  addressLabel:      string
  showLastScanned:   boolean
  showScanErrorsCard: boolean
  addButtonLabel:    string
  emptyMessage:      React.ReactNode
}

const STATUS_OPTIONS: { value: HostStatus; label: string }[] = [
  { value: '',         label: 'All' },
  { value: 'enabled',  label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const TYPE_CONFIGS: Record<EndpointType, TypeConfig> = {
  host: {
    title:             'Host Endpoints',
    description:       'Host:port TLS endpoints the scanner probes each cycle.',
    noun:              'Host Endpoint',
    searchPlaceholder: 'Search name or DNS…',
    sortOptions: [
      { value: '',             label: 'Newest first' },
      { value: 'name',         label: 'Name A→Z' },
      { value: 'dns_name',     label: 'DNS name A→Z' },
      { value: 'last_scanned', label: 'Last scanned' },
    ],
    showAddress:        true,
    addressLabel:       'Address',
    showLastScanned:    true,
    showScanErrorsCard: true,
    addButtonLabel:     'Add Host Endpoint',
    emptyMessage:       <>No host endpoints yet. Click <strong>Add Host Endpoint</strong> to get started.</>,
  },
  saml: {
    title:             'SAML Endpoints',
    description:       'SAML IdP/SP metadata URLs with document history and signing-cert tracking.',
    noun:              'SAML Endpoint',
    searchPlaceholder: 'Search name or URL…',
    sortOptions: [
      { value: '',             label: 'Newest first' },
      { value: 'name',         label: 'Name A→Z' },
      { value: 'last_scanned', label: 'Last scanned' },
    ],
    showAddress:        true,
    addressLabel:       'Metadata URL',
    showLastScanned:    true,
    showScanErrorsCard: true,
    addButtonLabel:     'Add SAML Endpoint',
    emptyMessage:       <>No SAML endpoints yet. Click <strong>Add SAML Endpoint</strong> to get started.</>,
  },
  manual: {
    title:             'Manual Endpoints',
    description:       'Uploaded certificates not tied to a live endpoint — no scanning, expiry tracking only.',
    noun:              'Manual Endpoint',
    searchPlaceholder: 'Search name…',
    sortOptions: [
      { value: '',     label: 'Newest first' },
      { value: 'name', label: 'Name A→Z' },
    ],
    showAddress:        false,
    addressLabel:       '',
    showLastScanned:    false,
    showScanErrorsCard: false,
    addButtonLabel:     'Add Manual Endpoint',
    emptyMessage:       <>No manual endpoints yet. Click <strong>Add Manual Endpoint</strong> to upload a certificate.</>,
  },
}

// Grid templates per type. Inlined as full literal strings so Tailwind's JIT
// scan picks them up (computed template strings would be stripped).
const ROW_GRID_BY_TYPE: Record<EndpointType, string> = {
  //      checkbox | name | address | status | expiry | last-scanned | actions
  host:   'grid-cols-[2.5rem_2fr_1.5fr_6rem_7rem_7rem_3rem]',
  saml:   'grid-cols-[2.5rem_2fr_2fr_6rem_7rem_7rem_3rem]',
  //      checkbox | name | status | expiry | actions
  manual: 'grid-cols-[2.5rem_2fr_6rem_7rem_3rem]',
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

type SignalColor = 'neutral' | 'green' | 'amber' | 'red'

const SIGNAL_BORDER: Record<SignalColor, string> = {
  neutral: 'border-l-foreground/20',
  green:   'border-l-green-500',
  amber:   'border-l-amber-500',
  red:     'border-l-red-500',
}

const SIGNAL_VALUE: Record<SignalColor, string> = {
  neutral: 'text-foreground',
  green:   'text-green-600',
  amber:   'text-amber-600',
  red:     'text-red-600',
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  signal?: SignalColor
  active?: boolean
  onClick?: () => void
}

function StatCard({ icon, label, value, signal = 'neutral', active, onClick }: StatCardProps) {
  const base = 'w-full text-left rounded-lg border border-l-4 p-5 space-y-3 transition-colors'
  const surface = active
    ? 'bg-primary border-primary text-primary-foreground shadow-sm'
    : `bg-card ${SIGNAL_BORDER[signal]} ${onClick ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'}`
  const accent = active ? 'text-primary-foreground' : SIGNAL_VALUE[signal]
  const labelColor = active ? 'text-primary-foreground/80' : 'text-muted-foreground'
  return (
    <button type="button" onClick={onClick} className={`${base} ${surface}`}>
      <div className="flex items-center gap-2">
        <span className={`shrink-0 ${accent}`}>{icon}</span>
        <span className={`text-sm font-medium ${labelColor}`}>{label}</span>
      </div>
      <p className={`text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Days-left badge (driven by earliestExpiry)
// ---------------------------------------------------------------------------

function DaysLeftBadge({ notAfter }: { notAfter: string }) {
  const days = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return (
      <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 whitespace-nowrap">
        EXPIRED
      </span>
    )
  }
  if (days <= 7) {
    return (
      <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 whitespace-nowrap">
        {days}d
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
        {days}d
      </span>
    )
  }
  return (
    <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-muted text-muted-foreground whitespace-nowrap">
      {days}d
    </span>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000)     return 'Just now'
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

// TagChips renders the per-row tag list. Extracted so the desktop row (under
// the endpoint name) and the mobile card (at the bottom) share the same chip
// style and click semantics.
function TagChips({ tags, tagFilter, onTagClick }: { tags: EndpointListItem['tags']; tagFilter: string; onTagClick: (id: string) => void }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(tag => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onTagClick(tagFilter === tag.id ? '' : tag.id)}
          title={`Filter by ${tag.categoryName}: ${tag.name}`}
          className={`inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-75 ${categoryColor(tag.categoryId)} ${tagFilter === tag.id ? 'ring-1 ring-offset-1 ring-current' : ''}`}
        >
          <span className="opacity-60">{tag.categoryName}:</span>
          {tag.name}
        </button>
      ))}
    </div>
  )
}

// EndpointActionsMenu is the row's three-dot menu — extracted so the desktop
// row and the mobile card render identical View/Edit/Clone/Delete entries
// (with admin gating preserved) without duplicating the JSX.
function EndpointActionsMenu({ endpoint, admin, onDelete }: { endpoint: EndpointListItem; admin: boolean; onDelete: (ep: EndpointListItem) => void }) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate(`/endpoints/${endpoint.id}`)}>
          <ExternalLink className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        {admin && (
          <DropdownMenuItem onClick={() => navigate(`/endpoints/${endpoint.id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate(`/endpoints/new?clone=${endpoint.id}`)}>
          <Copy className="mr-2 h-4 w-4" />
          Clone
        </DropdownMenuItem>
        {admin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(endpoint)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Row (desktop) + Card (mobile)
// ---------------------------------------------------------------------------

interface EndpointRowProps {
  endpoint:   EndpointListItem
  type:       EndpointType
  cfg:        TypeConfig
  now:        number
  admin:      boolean
  tagFilter:  string
  selected:   boolean
  onToggle:   (ep: EndpointListItem) => void
  onTagClick: (id: string) => void
  onDelete:   (ep: EndpointListItem) => void
}

function EndpointRow({ endpoint, type, cfg, now, admin, tagFilter, selected, onToggle, onTagClick, onDelete }: EndpointRowProps) {
  return (
    <div className={`grid ${ROW_GRID_BY_TYPE[type]} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 hover:bg-muted/30`}>

      {/* Checkbox */}
      <div className="flex items-center justify-center pt-0.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(endpoint)}
          aria-label={`Select ${endpoint.name}`}
          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
        />
      </div>

      {/* Name + tags */}
      <div className="min-w-0">
        <Link
          to={`/endpoints/${endpoint.id}`}
          className="text-sm font-semibold hover:underline truncate block pt-0.5"
        >
          {endpoint.name}
        </Link>
        {endpoint.tags && endpoint.tags.length > 0 && (
          <div className="mt-1.5">
            <TagChips tags={endpoint.tags} tagFilter={tagFilter} onTagClick={onTagClick} />
          </div>
        )}
      </div>

      {/* Address — host: dns:port, saml: url */}
      {cfg.showAddress && (
        <div className="min-w-0 pt-0.5">
          {type === 'host' ? (
            <span className="text-sm text-muted-foreground font-mono truncate block">
              {endpoint.dnsName}:{endpoint.port}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground truncate block" title={endpoint.url ?? ''}>
              {endpoint.url ?? '—'}
            </span>
          )}
        </div>
      )}

      {/* Status */}
      <div className="pt-0.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className={`h-2 w-2 rounded-full shrink-0 ${endpoint.enabled ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
          {endpoint.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {/* Next expiry */}
      <div className="pt-0.5">
        {endpoint.earliestExpiry
          ? <DaysLeftBadge notAfter={endpoint.earliestExpiry} />
          : <span className="text-sm text-muted-foreground">—</span>}
      </div>

      {/* Last scanned — host/saml only */}
      {cfg.showLastScanned && (
        <div className="pt-0.5">
          {endpoint.lastScannedAt ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {fmtRelative(endpoint.lastScannedAt, now)}
              {endpoint.lastScanError && (
                <span title={endpoint.lastScanError}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Never</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div>
        <EndpointActionsMenu endpoint={endpoint} admin={admin} onDelete={onDelete} />
      </div>
    </div>
  )
}

// EndpointCard is the mobile-only stacked layout. Below md, the per-type
// grids would crush the name column — drop the grid, render each row as a
// self-contained record with labelled metadata. Address + Last scanned rows
// are gated by the same `cfg.show*` flags as the desktop columns, so the
// manual type stays sparse instead of showing "—" for missing fields.
function EndpointCard({ endpoint, cfg, type, now, admin, tagFilter, selected, onToggle, onTagClick, onDelete }: EndpointRowProps) {
  return (
    <div className="rounded-md border border-border/60 bg-card p-3 space-y-2">
      {/* Top row: checkbox + name on the left; expiry badge + actions on
          the right. Tap the checkbox to bulk-select; tap the name to
          navigate. Same target sizes as Mail/Linear. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(endpoint)}
            aria-label={`Select ${endpoint.name}`}
            className="h-4 w-4 mt-1 shrink-0 rounded border-border accent-primary cursor-pointer"
          />
          <Link
            to={`/endpoints/${endpoint.id}`}
            className="text-sm font-semibold hover:underline break-all min-w-0"
          >
            {endpoint.name}
          </Link>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {endpoint.earliestExpiry && <DaysLeftBadge notAfter={endpoint.earliestExpiry} />}
          <EndpointActionsMenu endpoint={endpoint} admin={admin} onDelete={onDelete} />
        </div>
      </div>

      {/* Labelled metadata. Only host/saml render the address + last-scanned
          rows; manual ends after Status. */}
      <dl className="space-y-0.5 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Status:</dt>
          <dd className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${endpoint.enabled ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
            {endpoint.enabled ? 'Enabled' : 'Disabled'}
          </dd>
        </div>
        {cfg.showAddress && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground shrink-0">{cfg.addressLabel}:</dt>
            <dd className="min-w-0 break-all">
              {type === 'host'
                ? <span className="font-mono">{endpoint.dnsName}:{endpoint.port}</span>
                : (endpoint.url ?? '—')}
            </dd>
          </div>
        )}
        {cfg.showLastScanned && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground shrink-0">Last scanned:</dt>
            <dd className="flex items-center gap-1.5 min-w-0">
              {endpoint.lastScannedAt ? fmtRelative(endpoint.lastScannedAt, now) : 'Never'}
              {endpoint.lastScanError && (
                <span title={endpoint.lastScanError}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>

      {endpoint.tags && endpoint.tags.length > 0 && (
        <TagChips tags={endpoint.tags} tagFilter={tagFilter} onTagClick={onTagClick} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  endpoint: EndpointListItem | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ endpoint, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!endpoint) return
    setLoading(true)
    setError(null)
    try {
      await deleteEndpoint(endpoint.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete endpoint.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={endpoint !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Endpoint</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">{endpoint?.name}</span>
          {endpoint?.dnsName ? ` (${endpoint.dnsName})` : ''}? This action cannot be undone.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

interface EndpointPageProps {
  /**
   * Which endpoint subtype this list surface is for. Drives title, column
   * set, sort options, stat cards, Add-button target, and the type filter
   * passed to the listEndpoints API.
   */
  type: EndpointType
}

export default function EndpointPage({ type }: EndpointPageProps) {
  const cfg = TYPE_CONFIGS[type]
  const admin = can('endpoints:edit')
  const navigate = useNavigate()
  const [now] = useState(Date.now)

  const [page, setPage]                       = useState(1)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]       = useState<HostStatus>('')
  const [sortOption, setSortOption]           = useState<SortOption>('')
  const [tagFilter, setTagFilter]             = useState('')
  const [deleteTarget, setDeleteTarget]       = useState<EndpointListItem | null>(null)
  const [importOpen, setImportOpen]           = useState(false)
  // Selection is kept as a Map<id, EndpointListItem> so bulk dialogs have
  // names + tags + DNS names even for rows the user picked on a different
  // page. Set<string> would force a re-fetch or silently drop off-page
  // entries.
  const [selected, setSelected]               = useState<Map<string, EndpointListItem>>(new Map())
  const [bulkDeleteOpen, setBulkDeleteOpen]   = useState(false)
  const [bulkTagOpen, setBulkTagOpen]         = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  // Reset UI state when switching between typed nav items — otherwise
  // filters/selection/page bleed across types.
  useEffect(() => {
    setPage(1)
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('')
    setSortOption('')
    setTagFilter('')
    setSelected(new Map())
  }, [type])

  const { data, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['endpoints', type, page, debouncedSearch, statusFilter, sortOption, tagFilter],
    queryFn: () => listEndpoints(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption, tagFilter, type),
    placeholderData: keepPreviousData,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['tag-categories'],
    queryFn:  listTagCategories,
  })

  const { data: totalData }    = useQuery({ queryKey: ['endpoints-count', type, 'all'],      queryFn: () => listEndpoints(1, 1, '', '', '', '', type) })
  const { data: enabledData }  = useQuery({ queryKey: ['endpoints-count', type, 'enabled'],  queryFn: () => listEndpoints(1, 1, '', 'enabled', '', '', type) })
  const { data: disabledData } = useQuery({ queryKey: ['endpoints-count', type, 'disabled'], queryFn: () => listEndpoints(1, 1, '', 'disabled', '', '', type) })
  const { data: errorData }    = useQuery({
    queryKey: ['endpoints-count', type, 'errors'],
    queryFn:  () => listErrorEndpoints(1, 1, type),
    enabled:  cfg.showScanErrorsCard,
  })

  const totalAll      = totalData?.totalCount   ?? null
  const totalEnabled  = enabledData?.totalCount ?? null
  const totalDisabled = disabledData?.totalCount ?? null
  const totalErrors   = errorData?.totalCount   ?? null

  const endpoints: EndpointListItem[] = data?.items ?? []
  const totalCount  = data?.totalCount ?? 0
  const totalPages  = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart  = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd    = Math.min(page * PAGE_SIZE, totalCount)

  const categories: CategoryWithTags[] = categoriesData ?? []
  const allTags   = categories.flatMap(cat => cat.tags.map(t => ({ ...t, categoryName: cat.name })))
  const activeTag = allTags.find(t => t.id === tagFilter) ?? null

  function handleStatusChange(value: HostStatus) { setStatusFilter(value); setPage(1) }
  function handleSortChange(value: SortOption)    { setSortOption(value);   setPage(1) }
  function handleTagChange(tagId: string)          { setTagFilter(tagId);    setPage(1) }

  const pageIds = useMemo(() => endpoints.map(e => e.id), [endpoints])
  const allPageSelected  = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const somePageSelected = !allPageSelected && pageIds.some(id => selected.has(id))

  function toggleOne(ep: EndpointListItem) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(ep.id)) next.delete(ep.id); else next.set(ep.id, ep)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Map(prev)
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const ep of endpoints) next.set(ep.id, ep)
      }
      return next
    })
  }

  function clearSelection() {
    setSelected(new Map())
  }

  // Refresh already-selected rows with the latest payload when they reappear
  // on the current page — keeps tag chips / DNS name in sync if another tab
  // mutated them. Cheap: only touches entries that are both selected AND in
  // the current page.
  useEffect(() => {
    if (selected.size === 0 || endpoints.length === 0) return
    setSelected(prev => {
      let changed = false
      const next = new Map(prev)
      for (const ep of endpoints) {
        if (next.has(ep.id) && next.get(ep.id) !== ep) {
          next.set(ep.id, ep)
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints])

  const selectedList = useMemo(() => Array.from(selected.values()), [selected])

  // Number of stat cards shown — controls the grid. Manual hides Scan Errors,
  // so it lays out in 3 columns instead of 4.
  const statCardCount = cfg.showScanErrorsCard ? 4 : 3
  const statGridClass = statCardCount === 4
    ? 'grid grid-cols-2 gap-4 sm:grid-cols-4'
    : 'grid grid-cols-1 gap-4 sm:grid-cols-3'

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{cfg.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {cfg.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {admin && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="h-12 px-4 text-base font-semibold">
                <Upload className="mr-1.5 h-4 w-4" />
                Import
              </Button>
              <Button onClick={() => navigate(`/endpoints/new?type=${type}`)} className="h-12 px-4 text-base font-semibold">
                <Plus className="mr-1.5 h-4 w-4" />
                {cfg.addButtonLabel}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className={statGridClass}>
        <StatCard
          icon={<Server className="h-4 w-4" />}
          label="Total"
          value={totalAll ?? '—'}
          signal="neutral"
          active={statusFilter === '' && !tagFilter}
          onClick={() => handleStatusChange('')}
        />
        <StatCard
          icon={<Wifi className="h-4 w-4" />}
          label="Enabled"
          value={totalEnabled ?? '—'}
          signal="neutral"
          active={statusFilter === 'enabled'}
          onClick={() => handleStatusChange('enabled')}
        />
        <StatCard
          icon={<WifiOff className="h-4 w-4" />}
          label="Disabled"
          value={totalDisabled ?? '—'}
          signal={totalDisabled === null ? 'neutral' : totalDisabled === 0 ? 'neutral' : 'amber'}
          active={statusFilter === 'disabled'}
          onClick={() => handleStatusChange('disabled')}
        />
        {cfg.showScanErrorsCard && (
          <StatCard
            icon={<AlertCircle className="h-4 w-4" />}
            label="Scan Errors"
            value={totalErrors ?? '—'}
            signal={totalErrors === null ? 'neutral' : totalErrors === 0 ? 'green' : 'red'}
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={cfg.searchPlaceholder}
          className="max-w-sm flex-1"
        />
        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onSelect={v => handleStatusChange(v as HostStatus)}
        />
        <FilterDropdown
          label="Sort"
          options={cfg.sortOptions}
          value={sortOption}
          onSelect={v => handleSortChange(v as SortOption)}
        />
        {allTags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={`gap-1.5 ${tagFilter ? 'border-primary text-primary' : ''}`}>
                <Tag className="h-4 w-4" />
                Tag
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem onSelect={() => handleTagChange('')} className="gap-2">
                <Check className={`h-4 w-4 ${!tagFilter ? 'opacity-100' : 'opacity-0'}`} />
                All tags
              </DropdownMenuItem>
              {categories.map(cat => (
                <div key={cat.id}>
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {cat.name}
                  </p>
                  {cat.tags.map(tag => (
                    <DropdownMenuItem key={tag.id} onSelect={() => handleTagChange(tag.id)} className="gap-2">
                      <Check className={`h-4 w-4 ${tagFilter === tag.id ? 'opacity-100' : 'opacity-0'}`} />
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Bulk action bar — trailing edge of the filter row, hidden when
            nothing is selected. Admin-only actions (tags, delete). */}
        {admin && (
          <div className="ml-auto">
            <BulkActionBar
              count={selected.size}
              onClear={clearSelection}
              actions={[
                { label: 'Update Tags', onClick: () => setBulkTagOpen(true) },
                { label: 'Delete',      onClick: () => setBulkDeleteOpen(true), variant: 'destructive' },
              ]}
            />
          </div>
        )}
      </div>

      {/* Active tag chip */}
      {activeTag && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by tag:</span>
          <span className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
            <span className="text-primary/60">{activeTag.categoryName}:</span>
            {activeTag.name}
            <button onClick={() => handleTagChange('')} className="ml-0.5 rounded hover:text-primary" aria-label="Clear tag filter">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">

        {/* Column headers — hidden below md since the mobile card layout is
            self-labelling. */}
        <div className={`hidden md:grid ${ROW_GRID_BY_TYPE[type]} items-center gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={allPageSelected}
              ref={el => { if (el) el.indeterminate = somePageSelected }}
              onChange={toggleAll}
              disabled={endpoints.length === 0}
              aria-label="Select all on page"
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          {cfg.showAddress && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{cfg.addressLabel}</span>
          )}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next Expiry</span>
          {cfg.showLastScanned && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Scanned</span>
          )}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Actions</span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : endpoints.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            {debouncedSearch || statusFilter || tagFilter
              ? <span className="text-sm text-muted-foreground">No endpoints match your filters.</span>
              : <StrixEmpty message={cfg.emptyMessage} />}
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {/* Mobile: stacked cards. Bulk-select checkbox lives top-left
                of each card so tapping ≠ navigation. */}
            <div className="space-y-2 p-3 md:hidden">
              {endpoints.map(endpoint => (
                <EndpointCard
                  key={endpoint.id}
                  endpoint={endpoint}
                  type={type}
                  cfg={cfg}
                  now={now}
                  admin={admin}
                  tagFilter={tagFilter}
                  selected={selected.has(endpoint.id)}
                  onToggle={toggleOne}
                  onTagClick={handleTagChange}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
            {/* Desktop: per-type grid */}
            <div className="hidden md:block">
              {endpoints.map(endpoint => (
                <EndpointRow
                  key={endpoint.id}
                  endpoint={endpoint}
                  type={type}
                  cfg={cfg}
                  now={now}
                  admin={admin}
                  tagFilter={tagFilter}
                  selected={selected.has(endpoint.id)}
                  onToggle={toggleOne}
                  onTagClick={handleTagChange}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer: count + pagination. Stacks below sm so neither half is
            forced to wrap on narrow screens. */}
        <div className="flex flex-col gap-3 border-t border-border/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? `No ${cfg.noun}s`
              : <>Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> {plural(totalCount, cfg.noun)}</>}
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
        endpoint={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={refetch}
      />

      <BulkImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={refetch}
      />

      <BulkDeleteEndpointsDialog
        open={bulkDeleteOpen}
        endpoints={selectedList}
        onClose={() => setBulkDeleteOpen(false)}
        onDone={() => {
          clearSelection()
          refetch()
        }}
      />

      <BulkTagEndpointsDialog
        open={bulkTagOpen}
        endpoints={selectedList}
        categories={categories}
        onClose={() => setBulkTagOpen(false)}
        onDone={() => {
          clearSelection()
          refetch()
        }}
      />
    </div>
  )
}
