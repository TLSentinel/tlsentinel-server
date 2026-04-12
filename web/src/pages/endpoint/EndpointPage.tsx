import { useState, useEffect } from 'react'
import { Plus, Upload, Pencil, Trash2, Copy, MoreHorizontal, AlertCircle, ChevronDown, Check, Tag, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import StrixEmpty from '@/components/StrixEmpty'
import SearchInput from '@/components/SearchInput'
import FilterDropdown from '@/components/FilterDropdown'
import TablePagination from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
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
import { listTagCategories } from '@/api/tags'
import { can } from '@/api/client'
import type { EndpointListItem, CategoryWithTags } from '@/types/api'
import { ApiError } from '@/types/api'
import { plural } from '@/lib/utils'
import { categoryColor } from '@/lib/tag-colors'
import BulkImportDialog from '@/components/BulkImportDialog'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Type label
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  host:   'Host',
  saml:   'SAML',
  manual: 'Manual',
}

function TypeLabel({ type }: { type: string }) {
  return <span className="text-sm text-muted-foreground">{TYPE_LABEL[type] ?? type}</span>
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
  const admin = can('endpoints:edit')
  const navigate = useNavigate()

  // Captured once at mount — avoids calling the impure Date.now() during render.
  const [now] = useState(Date.now)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<HostStatus>('')
  const [sortOption, setSortOption] = useState<SortOption>('')
  const [tagFilter, setTagFilter] = useState('')          // active tag_id

  const [deleteTarget, setDeleteTarget] = useState<EndpointListItem | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  // Debounce search — reset to page 1 when query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['endpoints', page, debouncedSearch, statusFilter, sortOption, tagFilter],
    queryFn: () => listEndpoints(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption, tagFilter),
    placeholderData: keepPreviousData,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: listTagCategories,
  })

  const endpoints = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const categories: CategoryWithTags[] = categoriesData ?? []

  function handleStatusChange(value: HostStatus) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleSortChange(value: SortOption) {
    setSortOption(value)
    setPage(1)
  }

  function handleTagChange(tagId: string) {
    setTagFilter(tagId)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const activeStatusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label ?? 'All'
  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortOption)?.label ?? 'Newest first'

  // Flat list of all tags with category name for the filter dropdown.
  const allTags = categories.flatMap(cat => cat.tags.map(t => ({ ...t, categoryName: cat.name })))
  const activeTag = allTags.find(t => t.id === tagFilter) ?? null

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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              Import
            </Button>
            <Button onClick={() => navigate('/endpoints/new')}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Endpoint
            </Button>
          </div>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name or DNS…"
          className="max-w-sm flex-1"
        />

        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onSelect={(value) => handleStatusChange(value as HostStatus)}
        />

        <FilterDropdown
          label="Sort"
          options={SORT_OPTIONS}
          value={sortOption}
          onSelect={(value) => handleSortChange(value as SortOption)}
        />

        {allTags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`gap-1.5 ${tagFilter ? 'border-primary text-primary' : ''}`}
              >
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
                    <DropdownMenuItem
                      key={tag.id}
                      onSelect={() => handleTagChange(tag.id)}
                      className="gap-2"
                    >
                      <Check className={`h-4 w-4 ${tagFilter === tag.id ? 'opacity-100' : 'opacity-0'}`} />
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Active tag chip */}
      {activeTag && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by tag:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
            <span className="text-primary/60">{activeTag.categoryName}:</span>
            {activeTag.name}
            <button
              onClick={() => handleTagChange('')}
              className="ml-0.5 rounded-full hover:text-primary"
              aria-label="Clear tag filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

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
      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Scanner</TableHead>
            <TableHead>Last Scanned</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {isLoading && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                Loading…
              </TableCell>
            </TableRow>
          )}

          {!isLoading && endpoints.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center">
                {debouncedSearch || statusFilter
                  ? <span className="text-sm text-muted-foreground">No endpoints match your filters.</span>
                  : <StrixEmpty message={<>No endpoints yet. Click <strong>Add Endpoint</strong> to get started.</>} />}
              </TableCell>
            </TableRow>
          )}

          {!isLoading &&
            endpoints.map((endpoint) => (
              <TableRow key={endpoint.id}>
                {/* Name — links to detail page */}
                <TableCell className="font-medium">
                  <Link to={`/endpoints/${endpoint.id}`} className="hover:underline">
                    {endpoint.name}
                  </Link>
                  {endpoint.tags && endpoint.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {endpoint.tags.map(tag => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={(e) => { e.preventDefault(); handleTagChange(tagFilter === tag.id ? '' : tag.id) }}
                          title={`Filter by ${tag.categoryName}: ${tag.name}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-75 ${categoryColor(tag.categoryId)} ${tagFilter === tag.id ? 'ring-1 ring-offset-1 ring-current' : ''}`}
                        >
                          <span className="opacity-60">{tag.categoryName}:</span>
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </TableCell>

                {/* Type */}
                <TableCell>
                  <TypeLabel type={endpoint.type} />
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
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${endpoint.enabled ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                    {endpoint.enabled ? 'Enabled' : 'Disabled'}
                  </span>
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

                {/* Row actions — admin only */}
                <TableCell>
                  <div className="flex items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions for {endpoint.name}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {admin && (
                          <DropdownMenuItem asChild>
                            <Link to={`/endpoints/${endpoint.id}/edit`} className="flex items-center gap-2">
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                          <Link to={`/endpoints/new?clone=${endpoint.id}`} className="flex items-center gap-2">
                            <Copy className="h-4 w-4" />
                            Clone
                          </Link>
                        </DropdownMenuItem>
                        {admin && (
                          <DropdownMenuItem
                            className="flex items-center gap-2 text-destructive focus:text-destructive"
                            onSelect={() => setDeleteTarget(endpoint)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
        noun="endpoint"
      />

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
    </div>
  )
}
