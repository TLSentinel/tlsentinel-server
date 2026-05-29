import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldAlert, ShieldX, KeyRound, Building2, Lock } from 'lucide-react'
import { Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { getTLSPostureReport } from '@/api/reports'
import type { TLSPostureReport, TLSIssuerCount } from '@/types/api'
import { plural } from '@/lib/utils'
import { Breadcrumb } from '@/components/Breadcrumb'

// ---------------------------------------------------------------------------
// Chart configs
// ---------------------------------------------------------------------------

const caConfig: ChartConfig = {
  issuer0: { label: '', color: 'var(--chart-1)' },
  issuer1: { label: '', color: 'var(--chart-2)' },
  issuer2: { label: '', color: 'var(--chart-3)' },
  issuer3: { label: '', color: 'var(--chart-4)' },
  issuer4: { label: '', color: 'var(--chart-5)' },
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// `slug` is the URL value the endpoint list expects (`?protocol=tls10`),
// matching the boolean column name on endpoint_tls_profiles. Kept alongside
// the display label so the click-through stays in lockstep with the bar.
function protocolChartData(report: TLSPostureReport) {
  return [
    { protocol: 'SSL 3.0', slug: 'ssl30', count: report.protocols.ssl30, fill: 'var(--color-ssl30)' },
    { protocol: 'TLS 1.0', slug: 'tls10', count: report.protocols.tls10, fill: 'var(--color-tls10)' },
    { protocol: 'TLS 1.1', slug: 'tls11', count: report.protocols.tls11, fill: 'var(--color-tls11)' },
    { protocol: 'TLS 1.2', slug: 'tls12', count: report.protocols.tls12, fill: 'var(--color-tls12)' },
    { protocol: 'TLS 1.3', slug: 'tls13', count: report.protocols.tls13, fill: 'var(--color-tls13)' },
  ]
}

const PROTOCOL_BAR_CLASS: Record<string, string> = {
  'TLS 1.3': 'bg-[var(--chart-1)]',
  'TLS 1.2': 'bg-[var(--chart-2)]',
  'TLS 1.1': 'bg-amber-500',
  'TLS 1.0': 'bg-destructive',
  'SSL 3.0': 'bg-destructive',
}

function issuerChartData(issuers: TLSIssuerCount[]) {
  return issuers.slice(0, 5).map((r, i) => ({
    issuer: r.issuer,
    count: r.count,
    fill: CHART_COLORS[i] ?? CHART_COLORS[0],
  }))
}

function buildIssuerConfig(issuers: TLSIssuerCount[]): ChartConfig {
  const cfg: ChartConfig = {}
  issuers.slice(0, 5).forEach((r, i) => {
    cfg[`issuer${i}`] = { label: r.issuer, color: CHART_COLORS[i] ?? CHART_COLORS[0] }
  })
  return cfg
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: number | string
  sub?: string
  icon: React.ElementType
  iconClass?: string
}

function StatCard({ label, value, sub, icon: Icon, iconClass }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm flex items-start gap-4">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${iconClass ?? 'bg-muted'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-sm font-medium">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Severity indicator
// ---------------------------------------------------------------------------

function SeverityIndicator({ severity }: { severity: string }) {
  if (severity === 'critical') return <span className="text-sm text-destructive">Critical</span>
  if (severity === 'warning')  return <span className="text-sm text-amber-600">Warning</span>
  return <span className="text-sm text-green-600">OK</span>
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TLSPosturePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-tls-posture'],
    queryFn: getTLSPostureReport,
  })

  const tls13Count     = data?.protocols.tls13 ?? 0
  const weakProtoCount = (data?.protocols.tls11 ?? 0) + (data?.protocols.tls10 ?? 0) + (data?.protocols.ssl30 ?? 0)
  const selfSignedCount = data?.issuers.find(i => i.issuer === 'Self-signed')?.count ?? 0
  const weakCipherCount = data?.weakCipherEndpoints ?? 0
  const total          = data?.totalEndpoints ?? 0

  const issuerConfig = data ? buildIssuerConfig(data.issuers) : caConfig

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Reports', to: '/reports' },
        { label: 'TLS Posture' },
      ]} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">TLS Posture</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {isLoading ? 'Loading…' : `Protocol versions, cipher suites, and certificate authorities across ${total} ${plural(total, 'endpoint')}.`}
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">Failed to load report data.</p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="TLS 1.3"
          value={tls13Count}
          sub={total > 0 ? `${Math.round(tls13Count / total * 100)}% of endpoints` : undefined}
          icon={ShieldCheck}
          iconClass="bg-green-500/10 border-green-500/20 text-green-600"
        />
        <StatCard
          label="Weak protocol"
          value={weakProtoCount}
          sub="Support SSL 3.0, TLS 1.0, or 1.1"
          icon={ShieldAlert}
          iconClass={weakProtoCount > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' : 'bg-muted'}
        />
        <StatCard
          label="Self-signed"
          value={selfSignedCount}
          sub="No trusted CA"
          icon={ShieldX}
          iconClass={selfSignedCount > 0 ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-muted'}
        />
        <StatCard
          label="Weak ciphers"
          value={weakCipherCount}
          sub="Negotiated on at least one scan"
          icon={KeyRound}
          iconClass={weakCipherCount > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' : 'bg-muted'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Protocol acceptance */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Protocol Acceptance</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Versions accepted across all scanned endpoints</p>
          {isLoading && <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && data && (
            <div className="space-y-4">
              {protocolChartData(data).reverse().map(({ protocol, slug, count }) => {
                const pct = data.scannedEndpoints > 0
                  ? Math.round(count / data.scannedEndpoints * 100)
                  : 0
                const body = (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{protocol}</span>
                      <span className="text-muted-foreground">{count} <span className="text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${PROTOCOL_BAR_CLASS[protocol]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                )
                // Disable the link when nothing matches — clicking would land
                // on an empty filtered list, which is more confusing than not
                // being clickable in the first place.
                if (count === 0) {
                  return <div key={protocol} className="space-y-1.5">{body}</div>
                }
                return (
                  <Link
                    key={protocol}
                    to={`/endpoints/host?protocol=${slug}`}
                    className="block space-y-1.5 rounded-md -mx-2 px-2 py-1 hover:bg-muted/40 transition-colors cursor-pointer"
                    aria-label={`View ${count} endpoints supporting ${protocol}`}
                  >
                    {body}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* CA breakdown */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Certificate Authorities</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Issuer distribution across current certificates</p>
          {!isLoading && data && (
            <ChartContainer config={issuerConfig} className="mx-auto aspect-square max-h-64">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="issuer" hideLabel />} />
                <Pie data={issuerChartData(data.issuers)} dataKey="count" nameKey="issuer" innerRadius={60} outerRadius={90} />
                <ChartLegend content={<ChartLegendContent nameKey="issuer" />} />
              </PieChart>
            </ChartContainer>
          )}
          {isLoading && <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}
        </div>
      </div>

      {/* Cipher suite table — dashboard-style grid (no top border, columns
          aligned with the section title at px-5). Mobile drops the grid for
          stacked cards so long cipher names wrap rather than truncating. */}
      {!isLoading && data && data.ciphers.length > 0 && (() => {
        const sortedCiphers = [...data.ciphers].sort((a, b) => {
          const order = { critical: 0, warning: 1, ok: 2 }
          const diff = (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
          return diff !== 0 ? diff : b.count - a.count
        })
        return (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-5 py-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Cipher Suites</h2>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Cipher suites accepted across all scanned endpoints</p>
            </div>
            {/* Mobile: stacked cards. Cipher names are long enough that the
                desktop grid would truncate them on a 375-wide screen. */}
            <div className="space-y-2 px-4 pb-4 md:hidden">
              {sortedCiphers.map(c => (
                <div key={c.cipher} className="rounded-md border border-border/60 bg-card p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    {c.count > 0 ? (
                      <Link
                        to={`/endpoints/host?cipher=${encodeURIComponent(c.cipher)}`}
                        className="font-mono text-sm break-all flex-1 min-w-0 hover:underline hover:text-primary"
                        aria-label={`View ${c.count} ${plural(c.count, 'endpoint')} accepting ${c.cipher}`}
                      >
                        {c.cipher}
                      </Link>
                    ) : (
                      <span className="font-mono text-sm break-all flex-1 min-w-0">{c.cipher}</span>
                    )}
                    <SeverityIndicator severity={c.severity} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.count} {plural(c.count, 'endpoint')}
                    {c.reason ? ` — ${c.reason}` : ''}
                  </p>
                </div>
              ))}
            </div>
            {/* Desktop: 4-column grid aligned with the section title. */}
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_auto_auto_minmax(0,2fr)] items-center gap-x-6 px-5 pb-3">
              <div className="col-span-4 grid grid-cols-subgrid gap-x-6 py-2.5 border-b border-border/40">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cipher Suite</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap text-right">Endpoints</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Severity</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</span>
              </div>
              {sortedCiphers.map(c => (
                <div key={c.cipher} className="col-span-4 grid grid-cols-subgrid items-center gap-x-6 py-2 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    {c.count > 0 ? (
                      <Link
                        to={`/endpoints/host?cipher=${encodeURIComponent(c.cipher)}`}
                        className="font-mono text-sm hover:underline hover:text-primary truncate block"
                        aria-label={`View ${c.count} ${plural(c.count, 'endpoint')} accepting ${c.cipher}`}
                      >
                        {c.cipher}
                      </Link>
                    ) : (
                      <span className="font-mono text-sm truncate block">{c.cipher}</span>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-sm text-muted-foreground tabular-nums">{c.count}</div>
                  <div className="shrink-0"><SeverityIndicator severity={c.severity} /></div>
                  <div className="min-w-0 text-sm text-muted-foreground truncate">
                    {c.reason ?? <span className="italic">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Endpoints needing attention — dashboard-style grid, same conventions
          as the cipher table above. */}
      {!isLoading && data && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Endpoints Needing Attention</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {data.attention.length} {plural(data.attention.length, 'endpoint')}
            </span>
          </div>
          {data.attention.length === 0 ? (
            <p className="px-5 pb-8 text-center text-sm text-muted-foreground">No issues found.</p>
          ) : (
            <>
              {/* Mobile: stacked cards so the issues list wraps rather than
                  forcing horizontal scroll on a phone. */}
              <div className="space-y-2 px-4 pb-4 md:hidden">
                {data.attention.map(item => (
                  <div key={item.endpointId} className="rounded-md border border-border/60 bg-card p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/endpoints/${item.endpointId}`}
                        className="text-sm font-semibold hover:underline break-all flex-1 min-w-0"
                      >
                        {item.endpointName}
                      </Link>
                      <SeverityIndicator severity={item.severity} />
                    </div>
                    <ul className="space-y-0.5">
                      {item.issues.map(issue => (
                        <li key={issue} className="text-sm text-muted-foreground">{issue}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {/* Desktop: 3-column grid aligned with the section title. */}
              <div className="hidden md:grid grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)] items-start gap-x-6 px-5 pb-3">
                <div className="col-span-3 grid grid-cols-subgrid gap-x-6 py-2.5 border-b border-border/40">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endpoint</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Severity</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Issues</span>
                </div>
                {data.attention.map(item => (
                  <div key={item.endpointId} className="col-span-3 grid grid-cols-subgrid items-start gap-x-6 py-2 border-b border-border/40 last:border-0">
                    <div className="min-w-0 pt-0.5">
                      <Link to={`/endpoints/${item.endpointId}`} className="text-sm font-semibold hover:underline truncate block">
                        {item.endpointName}
                      </Link>
                    </div>
                    <div className="shrink-0 pt-0.5">
                      <SeverityIndicator severity={item.severity} />
                    </div>
                    <div className="min-w-0">
                      <ul className="space-y-0.5">
                        {item.issues.map(issue => (
                          <li key={issue} className="text-sm">{issue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
