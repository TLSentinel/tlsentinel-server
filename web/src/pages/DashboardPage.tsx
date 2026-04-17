import { useQuery } from '@tanstack/react-query'
import { Server, Shield, Clock, AlertCircle, XCircle, ShieldOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listEndpoints, listErrorEndpoints } from '@/api/endpoints'
import { listCertificates } from '@/api/certificates'
import { getExpiringCerts, type ExpiringCertItem } from '@/api/certificates'
import { getTLSPostureReport } from '@/api/reports'
import type { EndpointListItem } from '@/types/api'
import { fmtDate } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

type SignalColor = 'neutral' | 'green' | 'amber' | 'red'

const SIGNAL_BORDER: Record<SignalColor, string> = {
  neutral: 'border-l-foreground',
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
  label: React.ReactNode
  value: string | number
  sub?: string
  signal?: SignalColor
}

function StatCard({ icon, label, value, sub, signal = 'neutral' }: StatCardProps) {
  return (
    <div className={`rounded-lg border border-l-4 ${SIGNAL_BORDER[signal]} p-5 space-y-3`}>
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
  return (
    <span className="inline-block rounded px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
      {days} DAYS
    </span>
  )
}

function ExpiringRow({ item }: { item: ExpiringCertItem }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-6 px-5 py-4 border-b border-border/40 last:border-0">
      {/* Common name */}
      <div className="min-w-0">
        <Link
          to={`/certificates/${item.fingerprint}`}
          className="text-sm font-semibold hover:underline truncate block"
        >
          {item.commonName}
        </Link>
        <Link
          to={`/endpoints/${item.endpointId}`}
          className="text-xs text-muted-foreground hover:underline truncate block mt-0.5"
        >
          {item.endpointName}
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scan error panel row
// ---------------------------------------------------------------------------

function errorAge(since: string): string {
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
    <div className="grid grid-cols-[1fr_2fr_auto] items-center gap-6 px-5 py-4 border-b border-border/40 last:border-0">
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
      {/* Error age */}
      <div className="shrink-0">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          {endpoint.errorSince ? errorAge(endpoint.errorSince) : '?'}
        </span>
      </div>
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
}

function TLSBar({ label, count, total, color, labelColor }: TLSBarProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="space-y-1.5">
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
    </div>
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

        {/* Left: TLS Distribution */}
        <div className="rounded-lg border p-5 space-y-4 self-start">
          <h2 className="font-semibold">TLS Distribution</h2>
          {!tlsReport ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (() => {
            const total = tlsReport.scannedEndpoints
            const legacyPct = total > 0 ? Math.round((tlsReport.legacyEndpoints / total) * 100) : 0
            const tls11Pct = total > 0 ? Math.round((tlsReport.protocols.tls11 / total) * 100) : 0
            const tls10Pct = total > 0 ? Math.round((tlsReport.protocols.tls10 / total) * 100) : 0
            return (
              <div className="space-y-4">
                <TLSBar label="TLS 1.3" count={tlsReport.protocols.tls13} total={total} color="bg-green-500" />
                <TLSBar label="TLS 1.2" count={tlsReport.protocols.tls12} total={total} color="bg-blue-900" />
                <TLSBar
                  label="TLS 1.1 (Legacy)"
                  count={tlsReport.protocols.tls11}
                  total={total}
                  color="bg-orange-500"
                  labelColor={tls11Pct > 0 ? 'text-orange-600' : undefined}
                />
                <TLSBar
                  label="TLS 1.0 (Legacy)"
                  count={tlsReport.protocols.tls10}
                  total={total}
                  color="bg-red-500"
                  labelColor={tls10Pct > 0 ? 'text-red-600' : undefined}
                />
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

        {/* Right: Expiring soon + Scan errors stacked */}
        <div className="space-y-6 lg:col-span-3">
          {/* Expiring soon */}
          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-5 py-4">
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
              <div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-6 px-5 py-2.5 border-b border-border/40 bg-muted/40">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Common Name</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Issuer</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expiry Date</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Days Left</span>
                </div>
                {expiring.map((item) => (
                  <ExpiringRow key={`${item.endpointId}-${item.fingerprint}`} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Scan errors */}
          <div className="rounded-lg border">
            <div className="flex items-center border-b px-5 py-4">
              <h2 className="font-semibold">Scan Errors</h2>
            </div>
            {errorHosts === null ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : errorHosts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No scan errors. All endpoints are healthy.
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-[1fr_2fr_auto] gap-6 px-5 py-2.5 border-b border-border/40 bg-muted/40">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endpoint</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Error</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</span>
                </div>
                {errorHosts.map((h) => (
                  <ErrorRow key={h.id} endpoint={h} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
