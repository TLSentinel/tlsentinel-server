import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Check, Tag, X } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import SearchInput from '@/components/SearchInput'
import FilterDropdown from '@/components/FilterDropdown'
import TablePagination from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listActive } from '@/api/certificates'
import { listTagCategories } from '@/api/tags'
import type { CategoryWithTags } from '@/types/api'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

const TYPE_LABEL: Record<string, string> = {
  host:   'Host',
  saml:   'SAML',
  manual: 'Manual',
}
function EndpointTypeLabel({ type }: { type: string }) {
  return <span className="text-sm text-muted-foreground">{TYPE_LABEL[type] ?? type}</span>
}
import { fmtDate } from '@/lib/utils'
import { fmtDays } from '@/lib/utils'
import { categoryColor } from '@/lib/tag-colors'
import { ExpiryStatus } from '@/components/CertCard'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type CertStatus = 'expired' | 'critical' | 'warning' | 'ok'
type StatusFilter = '' | CertStatus
type SortOption = '' | 'days_desc' | 'endpoint_name' | 'common_name'


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
  { value: 'endpoint_name', label: 'Endpoint name A→Z' },
  { value: 'common_name', label: 'Common name A→Z' },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function ActivePage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [sortOption, setSortOption] = useState<SortOption>('')
  const [tagFilter, setTagFilter] = useState('')

  // Debounce search — reset to page 1 when query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetching, error: fetchError } = useQuery({
    queryKey: ['active', page, debouncedSearch, statusFilter, sortOption, tagFilter],
    queryFn: () => listActive(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption, tagFilter),
    placeholderData: keepPreviousData,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: listTagCategories,
  })

  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const categories: CategoryWithTags[] = categoriesData ?? []

  function handleStatusChange(value: StatusFilter) {
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
  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortOption)?.label ?? 'Expiring soonest'

  const allTags = categories.flatMap(cat => cat.tags.map(t => ({ ...t, categoryName: cat.name })))
  const activeTag = allTags.find(t => t.id === tagFilter) ?? null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Active</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Active certificates across all monitored endpoints
        </p>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search endpoint or cert name…"
          className="max-w-sm flex-1"
        />

        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onSelect={(value) => handleStatusChange(value as StatusFilter)}
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
            <TableHead>Endpoint</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead>Common Name</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="w-20 text-right">Days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}

          {!isLoading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center">
                {debouncedSearch || statusFilter
                  ? <span className="text-sm text-muted-foreground">No certificates match your filters.</span>
                  : <StrixEmpty message="No endpoints with active certificates yet." />}
              </TableCell>
            </TableRow>
          )}

          {!isLoading && items.map((item) => (
            <TableRow key={`${item.endpointId}-${item.fingerprint}`}>
              <TableCell className="font-medium">
                <Link to={`/endpoints/${item.endpointId}`} className="hover:underline">
                  {item.endpointName}
                </Link>
                {item.tags && item.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.tags.map(tag => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleTagChange(tagFilter === tag.id ? '' : tag.id)}
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

              <TableCell>
                <EndpointTypeLabel type={item.endpointType} />
              </TableCell>

              <TableCell>
                <ExpiryStatus notAfter={item.notAfter} />
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

      {/* Pagination */}
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
        noun="certificate"
      />
    </div>
  )
}
