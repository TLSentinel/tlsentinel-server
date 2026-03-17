import { useEffect, useState } from 'react'
import { Server, Shield, Clock, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { listHosts, listErrorHosts } from '@/api/hosts'
import { listCertificates } from '@/api/certificates'
import { getExpiringCerts, type ExpiringCertItem } from '@/api/dashboard'
import type { HostListItem } from '@/types/api'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  soon?: boolean
}

function StatCard({ icon, label, value, sub, soon }: StatCardProps) {
  return (
    <div className={`rounded-lg border p-5 space-y-3 ${soon ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {soon && (
          <Badge variant="secondary" className="text-[10px]">
            Coming soon
          </Badge>
        )}
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Urgency helpers
// ---------------------------------------------------------------------------

function urgencyBadge(days: number) {
  if (days < 0)   return <Badge variant="destructive">Expired</Badge>
  if (days <= 7)  return <Badge variant="destructive">{days}d</Badge>
  if (days <= 14) return <Badge variant="outline" className="border-orange-500 text-orange-500">{days}d</Badge>
  return <Badge variant="outline" className="border-yellow-500 text-yellow-500">{days}d</Badge>
}

// ---------------------------------------------------------------------------
// Expiring Soon panel row
// ---------------------------------------------------------------------------

function ExpiringRow({ item }: { item: ExpiringCertItem }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0">
      <div className="min-w-0">
        <Link
          to={`/hosts/${item.hostId}`}
          className="text-sm font-medium hover:underline truncate block"
        >
          {item.hostName}
        </Link>
        <Link
          to={`/certificates/${item.fingerprint}`}
          className="text-xs text-muted-foreground hover:underline truncate block"
        >
          {item.commonName}
        </Link>
      </div>
      <div className="ml-4 shrink-0">
        {urgencyBadge(item.daysRemaining)}
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

function ErrorRow({ host }: { host: HostListItem }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0">
      <div className="min-w-0">
        <Link
          to={`/hosts/${host.id}`}
          className="text-sm font-medium hover:underline truncate block"
        >
          {host.name}
        </Link>
        <p className="text-xs text-muted-foreground truncate">{host.lastScanError}</p>
      </div>
      <div className="ml-4 shrink-0">
        <Badge variant="destructive">
          {host.errorSince ? errorAge(host.errorSince) : '?'}
        </Badge>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [hostCount, setHostCount] = useState<number | null>(null)
  const [certCount, setCertCount] = useState<number | null>(null)
  const [expiring, setExpiring] = useState<ExpiringCertItem[] | null>(null)
  const [errorHosts, setErrorHosts] = useState<HostListItem[] | null>(null)
  const [errorCount, setErrorCount] = useState<number | null>(null)

  useEffect(() => {
    listHosts(1, 1)
      .then((r) => setHostCount(r.totalCount))
      .catch(() => setHostCount(0))
  }, [])

  useEffect(() => {
    listErrorHosts(1, 10)
      .then((r) => { setErrorHosts(r.items); setErrorCount(r.totalCount) })
      .catch(() => { setErrorHosts([]); setErrorCount(0) })
  }, [])

  useEffect(() => {
    listCertificates(1, 1)
      .then((r) => setCertCount(r.totalCount))
      .catch(() => setCertCount(0))
  }, [])

  useEffect(() => {
    getExpiringCerts(30)
      .then((r) => setExpiring(r.items))
      .catch(() => setExpiring([]))
  }, [])

  const expiringCount = expiring?.length ?? null

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Server className="h-4 w-4" />}
          label="Hosts Monitored"
          value={hostCount ?? '—'}
          sub="Total configured hosts"
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Certificates Tracked"
          value={certCount ?? '—'}
          sub="Unique certificates ingested"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Expiring Within 30 Days"
          value={expiringCount ?? '—'}
          sub="Active certs expiring soon"
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Hosts with Scan Errors"
          value={errorCount ?? '—'}
          sub="Currently failing hosts"
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
                <ExpiringRow key={`${item.hostId}-${item.fingerprint}`} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Scan errors */}
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Scan Errors</h2>
            {errorCount !== null && errorCount > 0 && (
              <span className="text-xs text-muted-foreground">{errorCount} host{errorCount !== 1 ? 's' : ''} failing</span>
            )}
          </div>
          {errorHosts === null ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : errorHosts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No scan errors. All hosts are healthy.
            </div>
          ) : (
            <div>
              {errorHosts.map((h) => (
                <ErrorRow key={h.id} host={h} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
