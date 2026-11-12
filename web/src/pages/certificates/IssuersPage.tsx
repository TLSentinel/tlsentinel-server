import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import StrixEmpty from '@/components/StrixEmpty'
import SearchInput from '@/components/SearchInput'
import { listIssuers } from '@/api/certificates'
import type { IssuerSummary } from '@/types/api'
import { fmtDate, plural } from '@/lib/utils'

const ROW_GRID = 'grid-cols-[2.25fr_1.5fr_7rem_7rem_7rem_9rem]'

// ---------------------------------------------------------------------------
// Certificate Authorities
//
// Every stored certificate that has signed at least one other stored
// certificate. The question this page exists to answer is the one that lands
// during a CA incident — "they just had an incident, what of mine is
// affected?" — so the table leads with subtree size and endpoint blast
// radius rather than certificate metadata.
//
// Sorted server-side by subtree size descending, which puts the CAs carrying
// the most of your estate at the top.
// ---------------------------------------------------------------------------

export default function IssuersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['certificate-issuers'],
    queryFn: () => listIssuers(),
  })

  // The CA list is small (one row per signing cert in the store), so filter
  // client-side rather than adding a server round-trip per keystroke.
  const items = useMemo(() => {
    const all = data?.items ?? []
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      i =>
        i.commonName.toLowerCase().includes(q) ||
        i.subjectOrg.toLowerCase().includes(q),
    )
  }, [data, debouncedSearch])

  const totalCAs = data?.items.length ?? 0
  const totalEndpoints = useMemo(
    () => (data?.items ?? []).reduce((acc, i) => acc + i.endpointCount, 0),
    [data],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Certificate Authorities</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every CA that has signed a certificate in your store, and how much of
          your estate hangs off each one.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search CA name or organization…"
          className="max-w-sm flex-1"
        />
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            {totalCAs} {plural(totalCAs, 'authority', 'authorities')} ·{' '}
            {totalEndpoints} {plural(totalEndpoints, 'endpoint')} covered
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card">
        {/* Column headers — hidden below md since the mobile cards are
            self-labelling. */}
        <div
          className={`hidden md:grid ${ROW_GRID} items-center gap-4 border-b border-border/40 bg-muted/40 px-5 py-2.5`}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Authority</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Organization</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Direct</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subtree</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Endpoints</span>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valid Until</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            {debouncedSearch ? (
              <span className="text-sm text-muted-foreground">No authorities match your search.</span>
            ) : (
              <StrixEmpty message="No issuing CAs yet — scan an endpoint to capture a chain." />
            )}
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {/* Mobile: stacked cards. */}
            <div className="space-y-2 p-3 md:hidden">
              {items.map(item => (
                <div key={item.fingerprint} className="space-y-2 rounded-md border border-border/60 bg-card p-3">
                  <IssuerName item={item} />
                  <dl className="space-y-0.5 text-sm">
                    <Row label="Organization">{item.subjectOrg || '—'}</Row>
                    <Row label="Issued">
                      {item.directIssued} direct
                      {item.totalIssued > item.directIssued && `, ${item.totalIssued} in subtree`}
                    </Row>
                    <Row label="Endpoints">{item.endpointCount}</Row>
                    <Row label="Valid until">{fmtDate(item.notAfter)}</Row>
                  </dl>
                  <IssuedLink fingerprint={item.fingerprint} total={item.totalIssued} />
                </div>
              ))}
            </div>

            {/* Desktop: 6-column grid. */}
            <div className="hidden md:block">
              {items.map(item => (
                <div
                  key={item.fingerprint}
                  className={`grid ${ROW_GRID} items-center gap-4 border-b border-border/40 px-5 py-4 last:border-0 hover:bg-muted/30`}
                >
                  <div className="min-w-0">
                    <IssuerName item={item} />
                    <IssuedLink fingerprint={item.fingerprint} total={item.totalIssued} />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm text-muted-foreground" title={item.subjectOrg}>
                      {item.subjectOrg || '—'}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums">{item.directIssued}</span>
                  <span className="text-sm tabular-nums">{item.totalIssued}</span>
                  <span className="text-sm tabular-nums">{item.endpointCount}</span>
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {fmtDate(item.notAfter)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// The name links to the CA's own detail page (chain, attributes, trust
// matrix); the separate "view issued" link below it goes to the filtered
// certificate list. Two destinations because during an incident you want the
// list, but when auditing a chain you want the cert.
function IssuerName({ item }: { item: IssuerSummary }) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        to={`/certificates/${item.fingerprint}`}
        className="block min-w-0 truncate text-sm font-semibold hover:underline"
        title={item.commonName}
      >
        {item.commonName || `${item.fingerprint.slice(0, 16)}…`}
      </Link>
      {item.isTrustAnchor && (
        <span title="Trust anchor in a known root program">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-tertiary" />
        </span>
      )}
    </div>
  )
}

function IssuedLink({ fingerprint, total }: { fingerprint: string; total: number }) {
  return (
    <Link
      to={`/certificates?ca_fingerprint=${fingerprint}`}
      className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      <Landmark className="h-3 w-3" />
      View {total} issued
    </Link>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
