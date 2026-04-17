import { useQuery } from '@tanstack/react-query'
import { Server, Shield, Clock, AlertCircle, XCircle, ShieldOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listEndpoints, listErrorEndpoints } from '@/api/endpoints'
import { listCertificates } from '@/api/certificates'
import { getExpiringCerts, type ExpiringCertItem } from '@/api/certificates'
import type { EndpointListItem } from '@/types/api'
import { plural } from '@/lib/utils'
import { ExpiryStatus } from '@/components/CertCard'

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
  label: string
  value: string | number
  sub?: string
  signal?: SignalColor
}

function StatCard({ icon, label, value, sub, signal = 'neutral' }: StatCardProps) {
  return (
    <div className={`rounded-lg border border-l-4 ${SIGNAL_BORDER[signal]} p-5 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={SIGNAL_VALUE[signal]}>{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-3xl font-bold tracking-tight ${SIGNAL_VALUE[signal]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expiring Soon panel row
// ---------------------------------------------------------------------------

function ExpiringRow({ item }: { item: ExpiringCertItem }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0">
      <div className="min-w-0">
        <Link
          to={`/endpoints/${item.endpointId}`}
          className="text-sm font-medium hover:underline truncate block"
        >
          {item.endpointName}
        </Link>
        <Link
          to={`/certificates/${item.fingerprint}`}
          className="text-xs text-muted-foreground hover:underline truncate block"
        >
          {item.commonName}
        </Link>
      </div>
      <div className="ml-4 shrink-0">
        <ExpiryStatus notAfter={item.notAfter} />
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
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0">
      <div className="min-w-0">
        <Link
          to={`/endpoints/${endpoint.id}`}
          className="text-sm font-medium hover:underline truncate block"
        >
          {endpoint.name}
        </Link>
        <p className="text-xs text-muted-foreground truncate">{endpoint.lastScanError}</p>
      </div>
      <div className="ml-4 shrink-0">
        <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          {endpoint.errorSince ? errorAge(endpoint.errorSince) : '?'}
        </span>
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
          label="Expiring Within 30 Days"
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
          label="Endpoints with Scan Errors"
          value={errorCount ?? '—'}
          sub="Currently failing endpoints"
          signal={errorCount === null ? 'neutral' : errorCount === 0 ? 'green' : 'red'}
        />
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expiring soon list */}
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Expiring Soon</h2>
            {expiringCount !== null && (
              <span className="text-xs text-muted-foreground">{expiringCount} within 30 days</span>
            )}
          </div>
          {expiring === null ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : expiring.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No certificates expiring within 30 days.
            </div>
          ) : (
            <div>
              {expiring.map((item) => (
                <ExpiringRow key={`${item.endpointId}-${item.fingerprint}`} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Scan errors */}
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Scan Errors</h2>
            {errorCount !== null && errorCount > 0 && (
              <span className="text-xs text-muted-foreground">{plural(errorCount, 'endpoint')} failing</span>
            )}
          </div>
          {errorHosts === null ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : errorHosts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No scan errors. All endpoints are healthy.
            </div>
          ) : (
            <div>
              {errorHosts.map((h) => (
                <ErrorRow key={h.id} endpoint={h} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
