import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, Check, Tag, X, MoreVertical, ExternalLink } from 'lucide-react'
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
import { listActive } from '@/api/certificates'
import { listTagCategories } from '@/api/tags'
import type { CategoryWithTags, ExpiringCertItem } from '@/types/api'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fmtDate } from '@/lib/utils'
import { categoryColor } from '@/lib/tag-colors'

// ---------------------------------------------------------------------------
// Filter / sort options
// ---------------------------------------------------------------------------

type CertStatus  = 'expired' | 'critical' | 'warning' | 'ok'
type StatusFilter = '' | CertStatus
type SortOption  = '' | 'days_desc' | 'endpoint_name' | 'common_name'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '',         label: 'All' },
  { value: 'expired',  label: 'Expired' },
  { value: 'critical', label: 'Critical (≤7d)' },
  { value: 'warning',  label: 'Warning (≤30d)' },
  { value: 'ok',       label: 'OK' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: '',               label: 'Expiring soonest' },
  { value: 'days_desc',      label: 'Most time left' },
  { value: 'endpoint_name',  label: 'Endpoint name A→Z' },
  { value: 'common_name',    label: 'Common name A→Z' },
]

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const TYPE_STYLE: Record<string, string> = {
  host:   'bg-muted text-blue-500 dark:text-blue-400',
  saml:   'bg-muted text-purple-500 dark:text-purple-400',
  manual: 'bg-muted text-muted-foreground',
}

const TYPE_LABEL: Record<string, string> = {
  host:   'Host',
  saml:   'SAML',
  manual: 'Manual',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${TYPE_STYLE[type] ?? 'bg-muted text-muted-foreground'}`}>
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

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
        {days} DAYS
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
        {days} DAYS
      </span>
    )
  }
  return (
    <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-muted text-muted-foreground whitespace-nowrap">
      {days} DAYS
    </span>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid-cols-[2fr_5rem_1.5fr_1.5fr_8rem_7rem_2.5rem]'

interface ActiveRowProps {
  item: ExpiringCertItem
  tagFilter: string
  onTagClick: (id: string) => void
}

function ActiveRow({ item, tagFilter, onTagClick }: ActiveRowProps) {
  const navigate = useNavigate()
  return (
    <div className={`grid ${ROW_GRID} items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0`}>

      {/* Endpoint */}
      <div className="min-w-0">
        <Link
          to={`/endpoints/${item.endpointId}`}
          className="text-sm font-semibold hover:underline truncate block"
        >
          {item.endpointName}
        </Link>
        {item.tags && item.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.map(tag => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onTagClick(tagFilter === tag.id ? '' : tag.id)}
                title={`Filter by ${tag.categoryName}: ${tag.name}`}
                className={`inline-flex items-center gap-1 rounded border px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-75 ${categoryColor(tag.categoryId)} ${tagFilter === tag.id ? 'ring-1 ring-offset-1 ring-current' : ''}`}
              >
                <span className="opacity-60">{tag.categoryName}:</span>
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Type */}
      <div className="pt-0.5">
        <TypeBadge type={item.endpointType} />
      </div>

      {/* Common name */}
      <div className="min-w-0 pt-0.5">
        <Link
          to={`/certificates/${item.fingerprint}`}
          className="text-sm text-muted-foreground hover:underline truncate block"
        >
          {item.commonName}
        </Link>
      </div>

      {/* Issuer */}
      <div className="min-w-0 pt-0.5">
        <span className="text-sm text-muted-foreground truncate block">
          {item.issuerCn || '—'}
        </span>
      </div>

      {/* Expiry date */}
      <div className="pt-0.5">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {fmtDate(item.notAfter)}
        </span>
      </div>

      {/* Days left */}
      <div className="pt-0.5">
        <DaysLeftBadge notAfter={item.notAfter} />
      </div>

      {/* Actions */}
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/endpoints/${item.endpointId}`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              View Endpoint
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/certificates/${item.fingerprint}`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              View Certificate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function ActivePage() {
  const [page, setPage]                   = useState(1)
  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('')
  const [sortOption, setSortOption]       = useState<SortOption>('')
  const [tagFilter, setTagFilter]         = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetching, error: fetchError } = useQuery({
    queryKey: ['active', page, debouncedSearch, statusFilter, sortOption, tagFilter],
    queryFn:  () => listActive(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption, tagFilter),
    placeholderData: keepPreviousData,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['tag-categories'],
    queryFn:  listTagCategories,
  })

  const items: ExpiringCertItem[] = data?.items ?? []
  const totalCount  = data?.totalCount ?? 0
  const totalPages  = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const categories: CategoryWithTags[] = categoriesData ?? []
  const allTags     = categories.flatMap(cat => cat.tags.map(t => ({ ...t, categoryName: cat.name })))
  const activeTag   = allTags.find(t => t.id === tagFilter) ?? null

  function handleStatusChange(value: StatusFilter) { setStatusFilter(value); setPage(1) }
  function handleSortChange(value: SortOption)      { setSortOption(value);   setPage(1) }
  function handleTagChange(tagId: string)            { setTagFilter(tagId);    setPage(1) }

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, totalCount)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Active Certificates</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Active certificates across all monitored endpoints.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
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
          onSelect={v => handleStatusChange(v as StatusFilter)}
        />
        <FilterDropdown
          label="Sort"
          options={SORT_OPTIONS}
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
      </div>

      {/* Active tag chip */}
      {activeTag && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by tag:</span>
          <span className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
            <span className="text-primary/60">{activeTag.categoryName}:</span>
            {activeTag.name}
            <button onClick={() => handleTagChange('')} className="ml-0.5 rounded-full hover:text-primary" aria-label="Clear tag filter">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}

      {/* Table */}
      <div className="rounded-lg border">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? 'No certificates'
              : `Showing ${rangeStart}–${rangeEnd} of ${totalCount} certificates`}
          </p>
        </div>

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endpoint</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Common Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Issuer</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expiry Date</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Days Left</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            {debouncedSearch || statusFilter
              ? <span className="text-sm text-muted-foreground">No certificates match your filters.</span>
              : <StrixEmpty message="No endpoints with active certificates yet." />}
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {items.map(item => (
              <ActiveRow
                key={`${item.endpointId}-${item.fingerprint}`}
                item={item}
                tagFilter={tagFilter}
                onTagClick={handleTagChange}
              />
            ))}
          </div>
        )}
      </div>

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
