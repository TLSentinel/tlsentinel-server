import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldAlert, ShieldX, KeyRound, Building2 } from 'lucide-react'
import { Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function protocolChartData(report: TLSPostureReport) {
  return [
    { protocol: 'SSL 3.0', count: report.protocols.ssl30, fill: 'var(--color-ssl30)' },
    { protocol: 'TLS 1.0', count: report.protocols.tls10, fill: 'var(--color-tls10)' },
    { protocol: 'TLS 1.1', count: report.protocols.tls11, fill: 'var(--color-tls11)' },
    { protocol: 'TLS 1.2', count: report.protocols.tls12, fill: 'var(--color-tls12)' },
    { protocol: 'TLS 1.3', count: report.protocols.tls13, fill: 'var(--color-tls13)' },
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
          <p className="font-medium mb-1">Protocol Acceptance</p>
          <p className="text-xs text-muted-foreground mb-4">Versions accepted across all scanned endpoints</p>
          {isLoading && <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && data && (
            <div className="space-y-4">
              {protocolChartData(data).reverse().map(({ protocol, count }) => {
                const pct = data.scannedEndpoints > 0
                  ? Math.round(count / data.scannedEndpoints * 100)
                  : 0
                return (
                  <div key={protocol} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono">{protocol}</span>
                      <span className="text-muted-foreground">{count} <span className="text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${PROTOCOL_BAR_CLASS[protocol]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* CA breakdown */}
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="font-medium mb-1">Certificate Authorities</p>
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

      {/* Cipher suite table */}
      {!isLoading && data && data.ciphers.length > 0 && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="px-5 py-4 border-b">
            <p className="font-medium">Cipher Suites</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Cipher suites accepted across all scanned endpoints</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cipher Suite</TableHead>
                <TableHead className="w-28 text-right">Endpoints</TableHead>
                <TableHead className="w-32">Severity</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr]:border-b-0">
              {[...data.ciphers]
                .sort((a, b) => {
                  const order = { critical: 0, warning: 1, ok: 2 }
                  const diff = (order[a.severity] ?? 2) - (order[b.severity] ?? 2)
                  return diff !== 0 ? diff : b.count - a.count
                })
                .map(c => (
                  <TableRow key={c.cipher}>
                    <TableCell className="font-mono text-sm">{c.cipher}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{c.count}</TableCell>
                    <TableCell><SeverityIndicator severity={c.severity} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.reason ?? <span className="italic">—</span>}</TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </div>
      )}

      {/* Endpoints needing attention */}
      {!isLoading && data && (
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium">Endpoints Needing Attention</p>
            <span className="ml-auto text-xs text-muted-foreground">
              {data.attention.length} {plural(data.attention.length, 'endpoint')}
            </span>
          </div>
          {data.attention.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No issues found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="w-28">Severity</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-b-0">
                {data.attention.map(item => (
                  <TableRow key={item.endpointId}>
                    <TableCell>
                      <Link to={`/endpoints/${item.endpointId}`} className="font-mono text-sm hover:underline">
                        {item.endpointName}
                      </Link>
                    </TableCell>
                    <TableCell><SeverityIndicator severity={item.severity} /></TableCell>
                    <TableCell>
                      <ul className="space-y-0.5">
                        {item.issues.map(issue => (
                          <li key={issue} className="text-sm">{issue}</li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}
