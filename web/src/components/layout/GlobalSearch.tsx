import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Server, FileBadge, Radar } from 'lucide-react'
import { universalSearch } from '@/api/search'
import type { SearchResults } from '@/types/api'
import { cn } from '@/lib/utils'

const MIN_CHARS = 2
const DEBOUNCE_MS = 250

type FlatItem =
  | { kind: 'endpoint'; id: string; title: string; subtitle: string; type: string; href: string }
  | { kind: 'certificate'; id: string; title: string; subtitle: string; href: string }
  | { kind: 'scanner'; id: string; title: string; subtitle: string; href: string }

function flatten(results: SearchResults | undefined): FlatItem[] {
  if (!results) return []
  // Defensive: an older server build could return null for an empty group.
  const endpoints = results.endpoints ?? []
  const certificates = results.certificates ?? []
  const scanners = results.scanners ?? []
  return [
    ...endpoints.map<FlatItem>(e => ({
      kind: 'endpoint',
      id: e.id,
      title: e.name,
      subtitle: e.subtitle,
      type: e.type,
      href: `/endpoints/${e.id}`,
    })),
    ...certificates.map<FlatItem>(c => ({
      kind: 'certificate',
      id: c.fingerprint,
      title: c.commonName || c.fingerprint.slice(0, 16) + '…',
      subtitle: c.fingerprint,
      href: `/certificates/${c.fingerprint}`,
    })),
    ...scanners.map<FlatItem>(s => ({
      kind: 'scanner',
      id: s.id,
      title: s.name,
      subtitle: 'Scanner',
      // No per-scanner detail page yet; /settings/scanners is the list.
      href: '/settings/scanners',
    })),
  ]
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce the query so we don't fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const enabled = debounced.length >= MIN_CHARS
  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => universalSearch(debounced),
    enabled,
    staleTime: 30_000,
  })

  const items = useMemo(() => flatten(data), [data])

  // Clamp the highlighted index when the result set shrinks.
  useEffect(() => {
    if (activeIdx >= items.length) setActiveIdx(0)
  }, [items.length, activeIdx])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Cmd/Ctrl+K to focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function pick(item: FlatItem) {
    setOpen(false)
    setQuery('')
    setDebounced('')
    navigate(item.href)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      if (items.length > 0) setActiveIdx((activeIdx + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length > 0) setActiveIdx((activeIdx - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      if (items[activeIdx]) {
        e.preventDefault()
        pick(items[activeIdx])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showDropdown = open && enabled

  return (
    <div ref={containerRef} className="relative flex-1 max-w-2xl">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search endpoints, certificates, or scanners…  (⌘K)"
        className="w-full rounded-lg bg-card py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls="global-search-results"
      />

      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        >
          {isFetching && items.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No matches</div>
          ) : (
            <SearchGroups items={items} activeIdx={activeIdx} onPick={pick} onHover={setActiveIdx} />
          )}
        </div>
      )}
    </div>
  )
}

function SearchGroups({
  items,
  activeIdx,
  onPick,
  onHover,
}: {
  items: FlatItem[]
  activeIdx: number
  onPick: (i: FlatItem) => void
  onHover: (i: number) => void
}) {
  // Group indices preserve the original flat-array index so keyboard nav stays consistent.
  const grouped: Record<FlatItem['kind'], Array<{ item: FlatItem; idx: number }>> = {
    endpoint: [],
    certificate: [],
    scanner: [],
  }
  items.forEach((item, idx) => grouped[item.kind].push({ item, idx }))

  return (
    <div className="max-h-[60vh] overflow-y-auto py-1">
      <Group label="Endpoints" rows={grouped.endpoint} activeIdx={activeIdx} onPick={onPick} onHover={onHover} />
      <Group label="Certificates" rows={grouped.certificate} activeIdx={activeIdx} onPick={onPick} onHover={onHover} />
      <Group label="Scanners" rows={grouped.scanner} activeIdx={activeIdx} onPick={onPick} onHover={onHover} />
    </div>
  )
}

function Group({
  label,
  rows,
  activeIdx,
  onPick,
  onHover,
}: {
  label: string
  rows: Array<{ item: FlatItem; idx: number }>
  activeIdx: number
  onPick: (i: FlatItem) => void
  onHover: (i: number) => void
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <ul>
        {rows.map(({ item, idx }) => (
          <li key={item.kind + ':' + item.id}>
            <button
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={e => { e.preventDefault(); onPick(item) }}
              onMouseEnter={() => onHover(idx)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
                idx === activeIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
            >
              <KindIcon kind={item.kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.title}</div>
                {item.subtitle && (
                  <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                )}
              </div>
              {item.kind === 'endpoint' && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.type}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function KindIcon({ kind }: { kind: FlatItem['kind'] }) {
  const className = 'h-4 w-4 shrink-0 text-muted-foreground'
  if (kind === 'endpoint') return <Server className={className} />
  if (kind === 'certificate') return <FileBadge className={className} />
  return <Radar className={className} />
}
