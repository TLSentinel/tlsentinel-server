import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ChevronRight, AlertCircle, AlertTriangle, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle, Pencil, RefreshCw, HelpCircle, FileEdit, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getEndpoint, getTLSProfile, getScanHistory, patchEndpoint } from '@/api/endpoints'
import { getEndpointTags } from '@/api/tags'
import type { Endpoint, EndpointCert, EndpointTLSProfile, TLSClassification, TLSFinding, TLSGrade, TLSSeverity, EndpointScanHistoryItem, TagWithCategory } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDateTime } from '@/lib/utils'
import { categoryColor } from '@/lib/tag-colors'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function Section({ title, titleClassName, className, bareTitle = false, action, children }: { title?: string; titleClassName?: string; className?: string; bareTitle?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl bg-card border border-border overflow-hidden ${className ?? ''}`}>
      {title && !bareTitle && (
        <div className="px-5 py-3 bg-muted flex items-center justify-between gap-3">
          <h2 className={`text-sm font-medium ${titleClassName ?? ''}`}>{title}</h2>
          {action}
        </div>
      )}
      <div className={bareTitle ? 'p-6' : 'p-5'}>
        {title && bareTitle && (
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 className={titleClassName ?? 'text-sm font-medium'}>{title}</h2>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Severity primitives
// ---------------------------------------------------------------------------


const SeverityIcon: Record<TLSSeverity, React.ReactNode> = {
  ok:       <ShieldCheck className="h-8 w-8 text-tertiary" />,
  warning:  <ShieldAlert className="h-8 w-8 text-warning"  />,
  critical: <ShieldX     className="h-8 w-8 text-error"    />,
}

// ---------------------------------------------------------------------------
// Finding row
// ---------------------------------------------------------------------------

const FINDING_ACCENT: Record<TLSSeverity, string> = {
  ok:       'border-l-tertiary',
  warning:  'border-l-warning',
  critical: 'border-l-error',
}

function FindingBadge({ severity, preferred }: { severity: TLSSeverity; preferred: boolean }) {
  if (preferred) {
    return (
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-tertiary-container text-on-tertiary-container">
        Preferred
      </span>
    )
  }
  if (severity === 'warning') {
    return (
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-warning-container text-on-warning-container">
        Weakness
      </span>
    )
  }
  if (severity === 'critical') {
    return (
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-error-container text-on-error-container">
        Critical
      </span>
    )
  }
  return null
}

function FindingRow({ finding, preferred = false }: { finding: TLSFinding; preferred?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-md border border-l-4 ${FINDING_ACCENT[finding.severity]} px-3 py-3`}>
      <div className="shrink-0">{SeverityIcon[finding.severity]}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{finding.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{finding.reason}</p>
      </div>
      <FindingBadge severity={finding.severity} preferred={preferred} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Type label
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  host:   'Host',
  saml:   'SAML',
  manual: 'Manual',
}

// ---------------------------------------------------------------------------
// Endpoint info section
// ---------------------------------------------------------------------------

function ConfigurationSection({
  endpoint,
  onToggleEnabled,
  onToggleScanning,
}: {
  endpoint: Endpoint
  onToggleEnabled: (enabled: boolean) => void
  onToggleScanning: (enabled: boolean) => void
}) {
  const isHost   = endpoint.type === 'host'
  const isSAML   = endpoint.type === 'saml'
  const isManual = endpoint.type === 'manual'
  const scanningOn = !endpoint.scanExempt

  return (
    <Section
      title="Configuration"
      titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      bareTitle
      action={
        <Link
          to={`/endpoints/${endpoint.id}/edit`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Edit configuration"
        >
          <FileEdit className="h-4 w-4" />
        </Link>
      }
    >
      <div className="space-y-4">
        <dl>

          {isHost && (
            <Row label="DNS Name">
              <span className="text-base font-semibold">{endpoint.dnsName}</span>
            </Row>
          )}

          {isSAML && (
            <Row label="Metadata URL">
              <span className="font-mono break-all">{endpoint.url ?? '—'}</span>
            </Row>
          )}

          {isManual && (
            <div className="py-3">
              <p className="text-sm text-muted-foreground italic">
                Manually tracked — certificate is linked directly, no scanning.
              </p>
            </div>
          )}

          {isHost && (
            <Row label="IP Address">
              <span className="text-base font-semibold">{endpoint.ipAddress ?? 'Auto'}</span>
            </Row>
          )}

          {isHost && (
            <Row label="Port">
              <span className="text-base font-semibold">{endpoint.port}</span>
            </Row>
          )}

          {!isManual && (
            <Row label="Scanner">
              <span className="text-base font-semibold">{endpoint.scannerName ?? 'Default'}</span>
            </Row>
          )}

          <Row label="Monitored">
            <Switch checked={endpoint.enabled} onCheckedChange={onToggleEnabled} />
          </Row>

          {!isManual && (
            <Row label="Scanning">
              <Switch checked={scanningOn} onCheckedChange={onToggleScanning} />
            </Row>
          )}

        </dl>

        {endpoint.lastScanError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{endpoint.lastScanError}</span>
          </div>
        )}
      </div>
    </Section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

function NotesSection({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div className="rounded-xl bg-surface-container-low border border-border overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Internal Notes
          </h2>
          <Link
            to={`/endpoints/${endpoint.id}/edit`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Edit notes"
          >
            <FileEdit className="h-4 w-4" />
          </Link>
        </div>
        {endpoint.notes ? (
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2">
            <ReactMarkdown>{endpoint.notes}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No notes.</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Security posture banner
// ---------------------------------------------------------------------------

// Specific detail shown inside the coloured posture banner.
function postureDetail(c: TLSClassification): string {
  const criticalCiphers  = c.cipherSuites.filter((f) => f.severity === 'critical')
  const warnCiphers      = c.cipherSuites.filter((f) => f.severity === 'warning')
  const criticalVersions = c.versions.filter((f) => f.severity === 'critical').map((f) => f.name)

  if (c.overallSeverity === 'ok')
    return 'No insecure protocols or cipher suites detected.'
  if (criticalVersions.length > 0)
    return `${criticalVersions.join(' and ')} ${criticalVersions.length > 1 ? 'are' : 'is'} enabled.`
  if (criticalCiphers.length > 0)
    return `${criticalCiphers.length} critically weak cipher${criticalCiphers.length > 1 ? 's' : ''} ${criticalCiphers.length > 1 ? 'are' : 'is'} accepted.`
  if (warnCiphers.length > 0)
    return `${warnCiphers.length} cipher${warnCiphers.length > 1 ? 's' : ''} without ECDHE forward secrecy ${warnCiphers.length > 1 ? 'are' : 'is'} accepted.`
  return 'Weaknesses detected.'
}

const POSTURE_STYLE: Record<TLSSeverity, {
  wrapper: string; icon: React.ReactNode; title: string; label: string; body: string
}> = {
  ok: {
    wrapper: 'bg-tertiary-container/40',
    icon:    <ShieldCheck className="h-8 w-8 shrink-0 text-tertiary" />,
    title:   'text-on-tertiary-container',
    label:   'Strong Configuration',
    body:    'text-on-tertiary-container/80',
  },
  warning: {
    wrapper: 'bg-warning-container/40',
    icon:    <ShieldAlert className="h-8 w-8 shrink-0 text-warning" />,
    title:   'text-on-warning-container',
    label:   'Weaknesses Detected',
    body:    'text-on-warning-container/80',
  },
  critical: {
    wrapper: 'bg-error-container/40',
    icon:    <ShieldX className="h-8 w-8 shrink-0 text-error" />,
    title:   'text-on-error-container',
    label:   'Insecure Configuration',
    body:    'text-on-error-container/80',
  },
}

function PostureBanner({ classification }: { classification: TLSClassification }) {
  const s = POSTURE_STYLE[classification.overallSeverity]
  return (
    <div className={`flex items-start gap-3 rounded-lg p-3 ${s.wrapper}`}>
      {s.icon}
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${s.title}`}>{s.label}</p>
        <p className={`mt-0.5 text-xs ${s.body}`}>{postureDetail(classification)}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TLS profile section
// ---------------------------------------------------------------------------

type TLSState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: EndpointTLSProfile }

function SecurityPostureSection({ tlsState, endpoint }: { tlsState: TLSState; endpoint: Endpoint }) {
  if (tlsState.status !== 'ready') return null
  const { classification, score } = tlsState.profile
  const primaryCert =
    endpoint.activeCerts.find((c) => c.certUse === 'tls') ??
    endpoint.activeCerts[0] ??
    null

  return (
    <Section title="Security Posture Summary" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
      <div className="space-y-4">
        {/* Grade + sub-score bars */}
        <div className="flex items-stretch gap-6">
          <div className="shrink-0 w-44 flex flex-col items-center justify-center rounded-xl border border-border bg-surface-container-low p-5">
            <span className={`text-7xl font-bold tracking-tight leading-none ${gradeTextColor(score.grade)}`}>
              {score.grade}
            </span>
            <span className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Summary Grade
            </span>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-4">
            <ScoreBar label="Protocol Support" value={score.protocolScore} />
            <ScoreBar label="Key Exchange"     value={score.keyExchangeScore} />
            <ScoreBar label="Cipher Strength"  value={score.cipherScore} />
          </div>
        </div>

        <PostureBanner classification={classification} />

        {/* Stat row */}
        <div className="grid grid-cols-2 gap-3">
          <CertStatusCard cert={primaryCert} />
          <OverallScoreCard score={score.score} />
        </div>

        <Link
          to="/help/scoring"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          How is this score calculated?
        </Link>
      </div>
    </Section>
  )
}

function CertStatusCard({ cert }: { cert: EndpointCert | null }) {
  if (!cert) {
    return (
      <div className="rounded-xl bg-surface-container-low p-4 flex items-center gap-3">
        <XCircle className="h-7 w-7 text-muted-foreground/60 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Certificate</p>
          <p className="mt-0.5 text-base font-semibold">None</p>
        </div>
      </div>
    )
  }
  const days = Math.floor((new Date(cert.notAfter).getTime() - Date.now()) / 86_400_000)
  const expired = days < 0
  const warning = !expired && days <= 30
  const icon = expired
    ? <XCircle className="h-7 w-7 text-error shrink-0" />
    : warning
    ? <AlertTriangle className="h-7 w-7 text-warning shrink-0" />
    : <CheckCircle2 className="h-7 w-7 text-tertiary shrink-0" />
  const label = expired
    ? 'Expired'
    : warning
    ? `Expiring (${days}d)`
    : `Valid (${days}d)`
  return (
    <div className="rounded-xl bg-surface-container-low p-4 flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Certificate</p>
          <Link
            to={`/certificates/${cert.fingerprint}`}
            className="text-muted-foreground hover:text-foreground"
            aria-label="View certificate"
          >
            <Eye className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="mt-0.5 text-base font-semibold">{label}</p>
      </div>
    </div>
  )
}

function OverallScoreCard({ score }: { score: number }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4 flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Overall Score</p>
      <p className="text-2xl font-bold tracking-tight leading-none">
        {score}
        <span className="text-base font-medium text-muted-foreground">/100</span>
      </p>
    </div>
  )
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const barClass = value === null
    ? 'bg-muted-foreground/20'
    : value >= 80 ? 'bg-tertiary'
    : value >= 50 ? 'bg-warning'
    : 'bg-error'
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="text-sm font-semibold">
          {value !== null ? `${value}/100` : '—'}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  )
}

function gradeTextColor(grade: TLSGrade): string {
  switch (grade) {
    case 'A+':
    case 'A':
    case 'A-':
      return 'text-tertiary'
    case 'B':
    case 'C':
      return 'text-warning'
    default:
      return 'text-error'
  }
}

const TLS_VERSION_ROW: Array<{ name: string; key: 'tls13' | 'tls12' | 'tls11' | 'tls10' }> = [
  { name: 'TLS 1.3', key: 'tls13' },
  { name: 'TLS 1.2', key: 'tls12' },
  { name: 'TLS 1.1', key: 'tls11' },
  { name: 'TLS 1.0', key: 'tls10' },
]

function ActiveTLSProfileSection({ tlsState }: { tlsState: TLSState }) {
  if (tlsState.status !== 'ready') return null
  const { profile } = tlsState
  const findingByName = new Map(profile.classification.versions.map((v) => [v.name, v]))

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Active TLS Profile
          </h2>
          <a
            href="#cipher-suites"
            className="text-sm font-medium text-primary hover:underline"
          >
            View Cipher Suites
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {TLS_VERSION_ROW.map((v) => (
            <VersionChip
              key={v.name}
              name={v.name}
              enabled={profile[v.key]}
              severity={findingByName.get(v.name)?.severity}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function VersionChip({
  name,
  enabled,
  severity,
}: {
  name: string
  enabled: boolean
  severity: TLSSeverity | undefined
}) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md bg-surface-container-low px-3 py-1.5 text-sm font-medium text-muted-foreground/70">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        {name} (OFF)
      </span>
    )
  }
  const dotColor =
    severity === 'critical' ? 'bg-error' :
    severity === 'warning'  ? 'bg-warning' :
                               'bg-tertiary'
  const ringClass =
    severity === 'critical' ? 'ring-1 ring-error/60'   :
    severity === 'warning'  ? 'ring-1 ring-warning/60' :
                               ''
  const textColor =
    severity === 'critical' ? 'text-error'   :
    severity === 'warning'  ? 'text-warning' :
                               'text-foreground'
  return (
    <span className={`inline-flex items-center gap-2 rounded-md bg-surface-container-low px-3 py-1.5 text-sm font-medium ${textColor} ${ringClass}`}>
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      {name}
    </span>
  )
}

function CipherSuitesSection({ tlsState }: { tlsState: TLSState }) {
  if (tlsState.status === 'loading') {
    return (
      <Section title="Cipher Suites" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      </Section>
    )
  }
  if (tlsState.status === 'none') {
    return (
      <Section title="Cipher Suites" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
        <p className="text-sm italic text-muted-foreground">No TLS profile yet — will be populated on the next scan cycle.</p>
      </Section>
    )
  }
  if (tlsState.status === 'error') {
    return (
      <Section title="Cipher Suites" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
        <p className="text-sm text-destructive">{tlsState.message}</p>
      </Section>
    )
  }

  const { profile } = tlsState
  const { classification } = profile

  return (
    <div id="cipher-suites" className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-6">
        <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Cipher Suites ({classification.cipherSuites.length})
        </h2>
        <div className="space-y-5">
          {profile.scanError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{profile.scanError}</span>
            </div>
          )}

          {classification.cipherSuites.length > 0 ? (
            <div className="space-y-1.5">
              {classification.cipherSuites.map((f) => (
                <FindingRow key={f.name} finding={f} preferred={f.name === profile.selectedCipher} />
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground">No cipher suites recorded.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scan history section
// ---------------------------------------------------------------------------

function ScanHistoryRow({ item }: { item: EndpointScanHistoryItem }) {
  const ok = !item.scanError
  return (
    <div className="py-2.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        {ok
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-tertiary" />
          : <XCircle      className="h-4 w-4 shrink-0 text-error" />}
        <span className="shrink-0 text-sm font-medium">{fmtDateTime(item.scannedAt)}</span>
        {item.tlsVersion && (
          <span className="shrink-0 text-xs text-muted-foreground">{item.tlsVersion}</span>
        )}
        {item.fingerprint && (
          <Link
            to={`/certificates/${item.fingerprint}`}
            className="min-w-0 truncate font-mono text-xs text-muted-foreground/70 hover:text-primary hover:underline"
          >
            {item.fingerprint}
          </Link>
        )}
      </div>
      {item.scanError && <p className="mt-1 pl-7 text-xs text-destructive">{item.scanError}</p>}
    </div>
  )
}

function ScanHistorySection({ items }: { items: EndpointScanHistoryItem[] | null }) {
  return (
    <Section title="Scan History" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
      {items === null ? (
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No scan history yet.</p>
      ) : (
        <div>{items.map((item) => <ScanHistoryRow key={item.id} item={item} />)}</div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EndpointDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: endpoint, isLoading: endpointLoading, error: endpointError } = useQuery({
    queryKey: ['endpoint', id],
    queryFn: () => getEndpoint(id!),
    enabled: !!id,
  })

  const { data: tlsProfile, isLoading: tlsLoading, error: tlsError } = useQuery({
    queryKey: ['endpoint', id, 'tls'],
    queryFn: () => getTLSProfile(id!),
    enabled: !!id,
  })

  const { data: historyData } = useQuery({
    queryKey: ['endpoint', id, 'history'],
    queryFn: () => getScanHistory(id!),
    enabled: !!id,
  })

  const { data: tagsData } = useQuery({
    queryKey: ['endpoint', id, 'tags'],
    queryFn: () => getEndpointTags(id!),
    enabled: !!id,
  })

  const queryClient = useQueryClient()
  const { mutate: toggleScanning } = useMutation({
    mutationFn: (scanExempt: boolean) => patchEndpoint(id!, { scanExempt }),
    onSuccess: (updated) => queryClient.setQueryData(['endpoint', id], updated),
  })

  const { mutate: toggleEnabled } = useMutation({
    mutationFn: (enabled: boolean) => patchEndpoint(id!, { enabled }),
    onSuccess: (updated) => queryClient.setQueryData(['endpoint', id], updated),
  })

  const history: EndpointScanHistoryItem[] | null = historyData?.items ?? null
  const tags: TagWithCategory[] = tagsData ?? []

  let tlsState: TLSState
  if (tlsLoading) {
    tlsState = { status: 'loading' }
  } else if (tlsError) {
    if (tlsError instanceof ApiError && tlsError.status === 404) {
      tlsState = { status: 'none' }
    } else {
      tlsState = { status: 'error', message: tlsError instanceof ApiError ? tlsError.message : 'Failed to load TLS profile.' }
    }
  } else if (tlsProfile) {
    tlsState = { status: 'ready', profile: tlsProfile }
  } else {
    tlsState = { status: 'none' }
  }

  const backLink = (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/endpoints" className="hover:text-foreground">Endpoints</Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground">{endpoint ? endpoint.name : '…'}</span>
    </nav>
  )

  if (endpointLoading) {
    return <div className="space-y-4">{backLink}<p className="text-sm text-muted-foreground">Loading…</p></div>
  }

  if (endpointError) {
    return <div className="space-y-4">{backLink}<p className="text-sm text-destructive">{endpointError instanceof ApiError ? endpointError.message : 'Failed to load endpoint.'}</p></div>
  }

  if (!endpoint) return null

  return (
    <div className="space-y-5">
      {backLink}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <Badge className="h-7 rounded-md px-3 text-sm font-semibold uppercase shrink-0">
              {TYPE_LABEL[endpoint.type] ?? endpoint.type}
            </Badge>
            <h1 className="text-5xl font-bold truncate">{endpoint.name}</h1>
          </div>
          {endpoint.type !== 'manual' && (
            <p className="mt-2 text-sm text-muted-foreground">
              Last scanned {endpoint.lastScannedAt ? fmtDateTime(endpoint.lastScannedAt) : '—'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2 mt-1">
          <Button
            variant="outline"
            onClick={() => navigate(`/endpoints/${id}/edit`)}
            className="h-12 px-4 text-base font-semibold"
          >
            <Pencil className="mr-1.5 h-4 w-4" />
            Edit Endpoint
          </Button>
          {endpoint.type === 'host' && (
            <Button
              onClick={() => { /* TODO: wire up force scan */ }}
              className="h-12 px-4 text-base font-semibold"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Force Scan
            </Button>
          )}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tags.map(tag => (
            <span
              key={tag.id}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium ${categoryColor(tag.categoryId)}`}
            >
              <span className="opacity-60">{tag.categoryName}:</span>
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* 1/3 - 2/3 body (collapses to single column when there's no TLS Profile) */}
      <div className={`grid grid-cols-1 gap-5 ${endpoint.type === 'host' ? 'lg:grid-cols-3' : ''}`}>

        {/* ── Left column (1/3) ── */}
        <div className="space-y-5 lg:col-span-1">
          <ConfigurationSection
            endpoint={endpoint}
            onToggleEnabled={toggleEnabled}
            onToggleScanning={(on) => toggleScanning(!on)}
          />
          <NotesSection endpoint={endpoint} />
          <ScanHistorySection items={history} />
        </div>

        {/* ── Right column (2/3) — only when TLS Profile has content ── */}
        {endpoint.type === 'host' && (
          <div className="space-y-5 lg:col-span-2">
            <SecurityPostureSection tlsState={tlsState} endpoint={endpoint} />
            <ActiveTLSProfileSection tlsState={tlsState} />
            <CipherSuitesSection tlsState={tlsState} />
          </div>
        )}

      </div>
    </div>
  )
}
