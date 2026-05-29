import { useQuery } from '@tanstack/react-query'
import { Server, Shield, Clock, AlertCircle, XCircle, ShieldOff, MoreVertical, ExternalLink, Landmark, Lock } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { listEndpoints, listErrorEndpoints } from '@/api/endpoints'
import { listCertificates } from '@/api/certificates'
import { getExpiringCerts, type ExpiringCertItem } from '@/api/certificates'
import { getTLSPostureReport } from '@/api/reports'
import { listRootStores } from '@/api/rootstores'
import type { EndpointListItem } from '@/types/api'
import { fmtDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

type SignalColor = 'neutral' | 'green' | 'amber' | 'red'

const SIGNAL_BORDER: Record<SignalColor, string> = {
  neutral: 'border-l-primary',
  green:   'border-l-tertiary',
  amber:   'border-l-warning',
  red:     'border-l-error',
}

const SIGNAL_VALUE: Record<SignalColor, string> = {
  neutral: 'text-foreground',
  green:   'text-tertiary',
  amber:   'text-warning',
  red:     'text-error',
}

interface StatCardProps {
  icon: React.ReactNode
  label: React.ReactNode
  value: string | number
  sub?: string
  signal?: SignalColor
}

function StatCard({ icon, label, value, sub, signal = 'neutral' }: StatCardProps) {
  return (
    <div className={`rounded-lg border border-l-4 ${SIGNAL_BORDER[signal]} bg-card p-5 space-y-3`}>
      <div className="flex items-start gap-2 min-h-[2.5rem]">
        <span className={`shrink-0 mt-0.5 ${SIGNAL_VALUE[signal]}`}>{icon}</span>
        <span className="text-sm font-medium text-muted-foreground leading-snug">{label}</span>
      </div>
      <p className={`text-3xl font-bold tracking-tight ${SIGNAL_VALUE[signal]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expiring Soon table
// ---------------------------------------------------------------------------

function DaysLeftBadge({ notAfter }: { notAfter: string }) {
  const days = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return (
      <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-error-container text-on-error-container whitespace-nowrap">
        EXPIRED
      </span>
    )
  }
  if (days <= 7) {
    return (
      <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-error-container text-on-error-container whitespace-nowrap">
        {days} DAYS
      </span>
    )
  }
  return (
    <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-warning-container text-on-warning-container whitespace-nowrap">
      {days} DAYS
    </span>
  )
}

// ExpiringActionsMenu is the row's three-dot menu — extracted so the same
// menu renders inside both the desktop grid row and the mobile card without
// duplicating the items.
function ExpiringActionsMenu({ item }: { item: ExpiringCertItem }) {
  const navigate = useNavigate()
  return (
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
  )
}

function ExpiringRow({ item }: { item: ExpiringCertItem }) {
  return (
    <div className="col-span-5 grid grid-cols-subgrid items-center gap-x-6 py-1.5 border-b border-border/40 last:border-0">
      {/* Common name */}
      <div className="min-w-0">
        <Link
          to={`/certificates/${item.fingerprint}`}
          className="text-sm font-semibold hover:underline truncate block"
        >
          {item.commonName}
        </Link>
      </div>
      {/* Issuer */}
      <div className="min-w-0">
        <span className="text-sm text-muted-foreground truncate block">
          {item.issuerCn || '—'}
        </span>
      </div>
      {/* Expiry date */}
      <div className="shrink-0">
        <span className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(item.notAfter)}</span>
      </div>
      {/* Days left badge */}
      <div className="shrink-0">
        <DaysLeftBadge notAfter={item.notAfter} />
      </div>
      {/* Actions */}
      <div className="shrink-0">
        <ExpiringActionsMenu item={item} />
      </div>
    </div>
  )
}

// ExpiringCard is the mobile-only stacked layout. The desktop grid would
// truncate the CN/issuer to "C..." / "U..." at narrow widths (see
// screenshot in the mobile-dashboard-tables PR), so below md we drop the
// table entirely and render each row as a card with the same data laid
// out vertically — CN + status badge + actions on top, labelled metadata
// underneath, full text wrapping rather than ellipsizing.
function ExpiringCard({ item }: { item: ExpiringCertItem }) {
  return (
    <div className="rounded-md border border-border/60 bg-card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/certificates/${item.fingerprint}`}
          className="text-sm font-semibold hover:underline break-all flex-1 min-w-0"
        >
          {item.commonName}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <DaysLeftBadge notAfter={item.notAfter} />
          <ExpiringActionsMenu item={item} />
        </div>
      </div>
      <dl className="space-y-0.5 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Issuer:</dt>
          <dd className="text-foreground break-words min-w-0">{item.issuerCn || '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Expires:</dt>
          <dd className="text-foreground">{fmtDate(item.notAfter)}</dd>
        </div>
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scan error panel row
// ---------------------------------------------------------------------------

function relAge(since: string): string {
  const ms = Date.now() - new Date(since).getTime()
  const mins  = Math.floor(ms / 60_000)
  const hours = Math.floor(ms / 3_600_000)
  const days  = Math.floor(ms / 86_400_000)
  if (days  >= 1) return `${days}d`
  if (hours >= 1) return `${hours}h`
  return `${mins}m`
}

function ErrorRow({ endpoint }: { endpoint: EndpointListItem }) {
  return (
    <div className="col-span-4 grid grid-cols-subgrid items-center gap-x-6 py-2 border-b border-border/40 last:border-0">
      {/* Endpoint name */}
      <div className="min-w-0">
        <Link
          to={`/endpoints/${endpoint.id}`}
          className="text-sm font-semibold hover:underline truncate block"
        >
          {endpoint.name}
        </Link>
      </div>
      {/* Error message */}
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground truncate">{endpoint.lastScanError}</p>
      </div>
      {/* Last attempt */}
      <div className="shrink-0">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {endpoint.lastScannedAt ? `${relAge(endpoint.lastScannedAt)} ago` : '—'}
        </span>
      </div>
      {/* Error age */}
      <div className="shrink-0">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-error">
          <XCircle className="h-4 w-4 shrink-0" />
          {endpoint.errorSince ? relAge(endpoint.errorSince) : '?'}
        </span>
      </div>
    </div>
  )
}

// ErrorCard mirrors ExpiringCard's pattern for the Scan Errors panel: stack
// the four columns into labelled rows below md so the error message wraps
// instead of truncating to "Conn..." on a 375-wide screen.
function ErrorCard({ endpoint }: { endpoint: EndpointListItem }) {
  return (
    <div className="rounded-md border border-border/60 bg-card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/endpoints/${endpoint.id}`}
          className="text-sm font-semibold hover:underline break-all flex-1 min-w-0"
        >
          {endpoint.name}
        </Link>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-error shrink-0">
          <XCircle className="h-4 w-4 shrink-0" />
          {endpoint.errorSince ? relAge(endpoint.errorSince) : '?'}
        </span>
      </div>
      <p className="text-sm text-muted-foreground break-words">
        {endpoint.lastScanError || '—'}
      </p>
      <p className="text-xs text-muted-foreground">
        Last attempt: {endpoint.lastScannedAt ? `${relAge(endpoint.lastScannedAt)} ago` : '—'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TLS Distribution panel
// ---------------------------------------------------------------------------

interface TLSBarProps {
  label: string
  count: number
  total: number
  color: string
  labelColor?: string
  /**
   * Protocol slug for the TLS Posture drill-down link
   * (`/endpoints/host?protocol=<slug>`). When provided and count > 0, the
   * row renders as a link; when count === 0 it renders inert (clicking
   * would land on an empty filtered list, more confusing than not being
   * clickable).
   */
  protocolSlug?: 'ssl30' | 'tls10' | 'tls11' | 'tls12' | 'tls13'
}

function TLSBar({ label, count, total, color, labelColor, protocolSlug }: TLSBarProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const body = (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${labelColor ?? 'text-foreground'}`}>{label}</span>
        <span className={`font-semibold ${labelColor ?? 'text-foreground'}`}>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </>
  )
  if (!protocolSlug || count === 0) {
    return <div className="space-y-1.5">{body}</div>
  }
  return (
    <Link
      to={`/endpoints/host?protocol=${protocolSlug}`}
      className="block space-y-1.5 rounded-md -mx-2 px-2 py-1 hover:bg-muted/40 transition-colors"
      aria-label={`View ${count} endpoints supporting ${label}`}
    >
      {body}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: endpointData } = useQuery({
    queryKey: ['dashboard', 'endpoint-count'],
    queryFn: () => listEndpoints(1, 1),
  })

  const { data: errorData } = useQuery({
    queryKey: ['dashboard', 'errors'],
    queryFn: () => listErrorEndpoints(1, 10),
  })

  const { data: certData } = useQuery({
    queryKey: ['dashboard', 'cert-count'],
    queryFn: () => listCertificates(1, 1),
  })

  const { data: expiringData } = useQuery({
    queryKey: ['dashboard', 'expiring'],
    queryFn: () => getExpiringCerts(30),
  })

  const { data: tlsReport } = useQuery({
    queryKey: ['dashboard', 'tls-posture'],
    queryFn: getTLSPostureReport,
  })

  const { data: rootStores } = useQuery({
    queryKey: ['dashboard', 'root-stores'],
    queryFn: listRootStores,
  })

  const hostCount    = endpointData?.totalCount ?? null
  const certCount    = certData?.totalCount ?? null
  const expiring     = expiringData?.items ?? null
  const errorHosts   = errorData?.items ?? null
  const errorCount   = errorData?.totalCount ?? null
  const now = Date.now()
  const expiredCount = expiring
    ? new Set(expiring.filter(i => new Date(i.notAfter).getTime() < now).map(i => i.fingerprint)).size
    : null
  const expiringCount = expiring
    ? new Set(expiring.filter(i => new Date(i.notAfter).getTime() >= now).map(i => i.fingerprint)).size
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Overview of your monitored infrastructure.
        </p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={<Server className="h-4 w-4" />}
          label="Endpoints Monitored"
          value={hostCount ?? '—'}
          sub="Total configured endpoints"
          signal="neutral"
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Certificates Tracked"
          value={certCount ?? '—'}
          sub="Unique certificates ingested"
          signal="neutral"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label={<>Expiring Soon<br />(&#x3C;=30D)</>}
          value={expiringCount ?? '—'}
          sub="Active certs expiring soon"
          signal={expiringCount === null ? 'neutral' : expiringCount === 0 ? 'green' : 'amber'}
        />
        <StatCard
          icon={<ShieldOff className="h-4 w-4" />}
          label="Expired"
          value={expiredCount ?? '—'}
          sub={expiredCount === 0 ? 'No expired certificates' : 'Requires immediate action'}
          signal={expiredCount === null ? 'neutral' : expiredCount === 0 ? 'green' : 'red'}
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Scan Errors"
          value={errorCount ?? '—'}
          sub="Currently failing endpoints"
          signal={errorCount === null ? 'neutral' : errorCount === 0 ? 'green' : 'red'}
        />
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">

        {/* Left: TLS Distribution + Trust Program */}
        <div className="space-y-6 self-start">
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">TLS Distribution</h2>
          </div>
          {!tlsReport ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (() => {
            const total = tlsReport.scannedEndpoints
            const legacyPct = total > 0 ? Math.round((tlsReport.legacyEndpoints / total) * 100) : 0
            const tls11Pct = total > 0 ? Math.round((tlsReport.protocols.tls11 / total) * 100) : 0
            const tls10Pct = total > 0 ? Math.round((tlsReport.protocols.tls10 / total) * 100) : 0
            const ssl30Pct = total > 0 ? Math.round((tlsReport.protocols.ssl30 / total) * 100) : 0
            return (
              <div className="space-y-4">
                <TLSBar label="TLS 1.3" count={tlsReport.protocols.tls13} total={total} color="bg-green-500" protocolSlug="tls13" />
                <TLSBar label="TLS 1.2" count={tlsReport.protocols.tls12} total={total} color="bg-blue-900" protocolSlug="tls12" />
                <TLSBar
                  label="TLS 1.1"
                  count={tlsReport.protocols.tls11}
                  total={total}
                  color="bg-orange-500"
                  labelColor={tls11Pct > 0 ? 'text-orange-600' : undefined}
                  protocolSlug="tls11"
                />
                <TLSBar
                  label="TLS 1.0"
                  count={tlsReport.protocols.tls10}
                  total={total}
                  color="bg-red-500"
                  labelColor={tls10Pct > 0 ? 'text-red-600' : undefined}
                  protocolSlug="tls10"
                />
                {tlsReport.protocols.ssl30 > 0 && (
                  <TLSBar
                    label="SSL 3.0 (Broken)"
                    count={tlsReport.protocols.ssl30}
                    total={total}
                    color="bg-red-700"
                    labelColor={ssl30Pct > 0 ? 'text-red-700' : undefined}
                    protocolSlug="ssl30"
                  />
                )}
                {legacyPct > 0 && (
                  <div className="rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Security Alert:</span>{' '}
                    {legacyPct}% of endpoints still utilize deprecated TLS protocols. Plan migration soon.
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Trust Program */}
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Trust Program</h2>
          </div>
          {!rootStores ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rootStores.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No programs yet.</div>
          ) : (
            <div className="space-y-1">
              {rootStores.map(store => (
                <Link
                  key={store.id}
                  to={`/root-stores?store=${store.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">{store.name}</span>
                  <span className="font-semibold tabular-nums">{store.anchorCount.toLocaleString()}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Right: Expiring soon + Scan errors stacked */}
        <div className="space-y-6 lg:col-span-3">
          {/* Expiring soon */}
          <div className="rounded-lg border bg-card overflow-hidden">
            {/* Header stacks below sm: so the title and "View All" link
                don't collide when the panel is full-width on a phone. */}
            <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-semibold">Certificates Expiring Soon</h2>
              <Link to="/certificates" className="text-sm font-medium text-primary hover:underline">
                View All Certificates
              </Link>
            </div>
            {expiring === null ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : expiring.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No certificates expiring within 30 days.
              </div>
            ) : (
              <>
                {/* Mobile: stacked cards. The desktop grid would truncate
                    CN/issuer to "C..." / "U..." at narrow widths, so below
                    md we drop the table layout entirely. */}
                <div className="space-y-2 px-4 pb-4 md:hidden">
                  {expiring.map((item) => (
                    <ExpiringCard key={`${item.endpointId}-${item.fingerprint}`} item={item} />
                  ))}
                </div>
                {/* Desktop: 5-column grid */}
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_2.5rem] items-center gap-x-6 px-5">
                  {/* Column headers */}
                  <div className="col-span-5 grid grid-cols-subgrid gap-x-6 py-2.5 border-b border-border/40">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Common Name</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Issuer</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Expiry Date</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Days Left</span>
                    <span />
                  </div>
                  {expiring.map((item) => (
                    <ExpiringRow key={`${item.endpointId}-${item.fingerprint}`} item={item} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Scan errors */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center px-5 py-4">
              <h2 className="font-semibold">Scan Errors</h2>
            </div>
            {errorHosts === null ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : errorHosts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No scan errors. All endpoints are healthy.
              </div>
            ) : (
              <>
                {/* Mobile: stacked cards */}
                <div className="space-y-2 px-4 pb-4 md:hidden">
                  {errorHosts.map((h) => (
                    <ErrorCard key={h.id} endpoint={h} />
                  ))}
                </div>
                {/* Desktop: 4-column grid */}
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto_auto] items-center gap-x-6 px-5">
                  <div className="col-span-4 grid grid-cols-subgrid gap-x-6 py-2.5 border-b border-border/40">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endpoint</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Error</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Last Attempt</span>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</span>
                  </div>
                  {errorHosts.map((h) => (
                    <ErrorRow key={h.id} endpoint={h} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
