import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Landmark } from 'lucide-react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import StrixEmpty from '@/components/StrixEmpty'
import SearchInput from '@/components/SearchInput'
import { Button } from '@/components/ui/button'
import { listRootStores, listRootStoreAnchors } from '@/api/rootstores'
import { fmtDate, plural, cn } from '@/lib/utils'

const PAGE_SIZE = 20
const ROW_GRID = 'grid-cols-[2fr_2fr_1.25fr_11rem]'

// Preferred tab order; any unknown stores from the API fall in after these.
const STORE_ORDER = ['microsoft', 'apple', 'mozilla', 'chrome']

export default function RootStoresPage() {
  const [activeStore, setActiveStore] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const { data: stores, isLoading: storesLoading } = useQuery({
    queryKey: ['root-stores'],
    queryFn: listRootStores,
  })

  const orderedStores = useMemo(() => {
    if (!stores) return []
    const byId = new Map(stores.map(s => [s.id, s]))
    const ordered = STORE_ORDER.map(id => byId.get(id)).filter(Boolean) as typeof stores
    const rest = stores.filter(s => !STORE_ORDER.includes(s.id))
    return [...ordered, ...rest]
  }, [stores])

  useEffect(() => {
    if (!activeStore && orderedStores.length > 0) {
      setActiveStore(orderedStores[0].id)
    }
  }, [activeStore, orderedStores])

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['root-store-anchors', activeStore, page, debouncedSearch],
    queryFn: () => listRootStoreAnchors(activeStore!, page, PAGE_SIZE, debouncedSearch),
    enabled: activeStore !== null,
    placeholderData: keepPreviousData,
  })

  const currentStore = orderedStores.find(s => s.id === activeStore) ?? null
  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount)

  function selectStore(id: string) {
    setActiveStore(id)
    setPage(1)
    setSearch('')
    setDebouncedSearch('')
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Root Stores</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Trust anchors in each CCADB-tracked program.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {storesLoading
          ? <span className="text-sm text-muted-foreground">Loading programs…</span>
          : orderedStores.map(store => {
              const active = store.id === activeStore
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => selectStore(store.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  <Landmark className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="font-medium">{store.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {store.anchorCount}
                  </span>
                </button>
              )
            })}
      </div>

      {/* Store meta strip */}
      {currentStore && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="uppercase tracking-wide text-muted-foreground/60">Program</span>{' '}
            <span className="text-foreground">{currentStore.name}</span>
          </span>
          <span>
            <span className="uppercase tracking-wide text-muted-foreground/60">Anchors</span>{' '}
            <span className="tabular-nums text-foreground">{currentStore.anchorCount}</span>
          </span>
          <span>
            <span className="uppercase tracking-wide text-muted-foreground/60">Last refresh</span>{' '}
            <span className="text-foreground">
              {currentStore.updatedAt ? fmtDate(currentStore.updatedAt) : '—'}
            </span>
          </span>
          {currentStore.sourceUrl && (
            <a
              href={currentStore.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Source ↗
            </a>
          )}
        </div>
      )}

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search common name…"
          className="max-w-sm flex-1"
        />
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} items-center gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Common Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Organization</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Valid Until</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fingerprint</span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            {debouncedSearch
              ? <span className="text-sm text-muted-foreground">No anchors match your search.</span>
              : <StrixEmpty message="No anchors in this root store yet." />}
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {items.map(item => (
              <div
                key={item.fingerprint}
                className={`grid ${ROW_GRID} items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0 hover:bg-muted/30`}
              >
                <div className="min-w-0">
                  <Link
                    to={`/certificates/${item.fingerprint}`}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    {item.commonName || '—'}
                  </Link>
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-sm text-muted-foreground" title={item.subjectOrg}>
                    {item.subjectOrg || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {fmtDate(item.notAfter)}
                  </span>
                </div>
                <div className="min-w-0">
                  <Link
                    to={`/certificates/${item.fingerprint}`}
                    className="block truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                    title={item.fingerprint}
                  >
                    {item.fingerprint.slice(0, 16)}…
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: count + pagination */}
        <div className="flex items-center justify-between border-t border-border/40 px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? 'No anchors'
              : <>Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> {plural(totalCount, 'anchor')}</>}
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
    </div>
  )
}
