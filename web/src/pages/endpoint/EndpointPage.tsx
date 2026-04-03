import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, AlertCircle, Search, ChevronDown, Check } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listEndpoints, deleteEndpoint } from '@/api/endpoints'
import { isAdmin } from '@/api/client'
import type { EndpointListItem } from '@/types/api'
import { ApiError } from '@/types/api'
import { plural } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

const TYPE_META: Record<string, { label: string; className: string }> = {
  host:   { label: 'Host',   className: 'border-blue-500 bg-blue-50 text-blue-700' },
  saml:   { label: 'SAML',   className: 'border-violet-500 bg-violet-50 text-violet-700' },
  manual: { label: 'Manual', className: 'border-gray-400 bg-gray-50 text-gray-500' },
}

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type, className: 'border-border text-muted-foreground' }
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
}

// ---------------------------------------------------------------------------
// Filter / sort options
// ---------------------------------------------------------------------------

type HostStatus = '' | 'enabled' | 'disabled'
type SortOption = '' | 'name' | 'dns_name' | 'last_scanned'

const STATUS_OPTIONS: { value: HostStatus; label: string }[] = [
  { value: '',         label: 'All' },
  { value: 'enabled',  label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: '',             label: 'Newest first' },
  { value: 'name',         label: 'Name A→Z' },
  { value: 'dns_name',     label: 'DNS name A→Z' },
  { value: 'last_scanned', label: 'Last scanned' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pure relative-time formatter. Accepts a pre-captured `now` to stay pure. */
function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
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
          <span className="font-medium text-foreground">{endpoint?.name}</span> (
          {endpoint?.dnsName})? This action cannot be undone.
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
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function HostsPage() {
  const admin = isAdmin()
  const navigate = useNavigate()

  // Captured once at mount — avoids calling the impure Date.now() during render.
  const [now] = useState(Date.now)

  const [endpoints, setEndpoints] = useState<EndpointListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<HostStatus>('')
  const [sortOption, setSortOption] = useState<SortOption>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<EndpointListItem | null>(null)

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
      const result = await listEndpoints(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption)
      setEndpoints(result.items ?? [])
      setTotalCount(result.totalCount)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load endpoints.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, sortOption])

  useEffect(() => {
    load()
  }, [load])

  function handleStatusChange(value: HostStatus) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleSortChange(value: SortOption) {
    setSortOption(value)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const activeStatusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label ?? 'All'
  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortOption)?.label ?? 'Newest first'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Endpoints</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCount} {plural(totalCount, 'endpoint')} monitored
          </p>
        </div>
        {admin && (
          <Button onClick={() => navigate('/endpoints/new')}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Endpoint
          </Button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name or DNS…"
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scanner</TableHead>
              <TableHead>Last Scanned</TableHead>
              <TableHead>Certificate</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!loading && endpoints.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  {debouncedSearch || statusFilter
                    ? <span className="text-sm text-muted-foreground">No endpoints match your filters.</span>
                    : <StrixEmpty message={<>No endpoints yet. Click <strong>Add Endpoint</strong> to get started.</>} />}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  {/* Name — links to detail page */}
                  <TableCell className="font-medium">
                    <Link to={`/endpoints/${endpoint.id}`} className="hover:underline">
                      {endpoint.name}
                    </Link>
                  </TableCell>

                  {/* Type */}
                  <TableCell>
                    <TypeBadge type={endpoint.type} />
                  </TableCell>

                  {/* Address — rendered differently per type */}
                  <TableCell className="text-sm text-muted-foreground">
                    {endpoint.type === 'host' ? (
                      <span className="font-mono">{endpoint.dnsName}:{endpoint.port}</span>
                    ) : endpoint.type === 'saml' ? (
                      <span className="truncate max-w-xs block" title={endpoint.url ?? ''}>
                        {endpoint.url ?? '—'}
                      </span>
                    ) : (
                      <span className="italic">Manual</span>
                    )}
                  </TableCell>

                  {/* Enabled / Disabled */}
                  <TableCell>
                    {endpoint.enabled ? (
                      <Badge
                        variant="outline"
                        className="border-blue-500 bg-blue-50 text-blue-700"
                      >
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Disabled
                      </Badge>
                    )}
                  </TableCell>

                  {/* Scanner assignment */}
                  <TableCell className="text-sm">
                    {endpoint.scannerName ? (
                      endpoint.scannerName
                    ) : (
                      <span className="text-muted-foreground">Default</span>
                    )}
                  </TableCell>

                  {/* Last scanned + error indicator */}
                  <TableCell className="text-sm">
                    {endpoint.lastScannedAt ? (
                      <span className="flex items-center gap-1.5">
                        {fmtRelative(endpoint.lastScannedAt, now)}
                        {endpoint.lastScanError && (
                          <span title={endpoint.lastScanError}>
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </TableCell>

                  {/* Active certificate link */}
                  <TableCell className="font-mono text-xs">
                    {endpoint.activeFingerprint ? (
                      <Link
                        to={`/certificates/${endpoint.activeFingerprint}`}
                        className="text-primary hover:underline"
                      >
                        {endpoint.activeFingerprint.slice(0, 16)}…
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Row actions — admin only */}
                  <TableCell>
                    {admin && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          asChild
                        >
                          <Link to={`/endpoints/${endpoint.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit {endpoint.name}</span>
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(endpoint)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete {endpoint.name}</span>
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {totalCount === 0
            ? 'No endpoints'
            : `Page ${page} of ${totalPages} · ${totalCount} total`}
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

      <DeleteDialog
        endpoint={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={load}
      />
    </div>
  )
}
