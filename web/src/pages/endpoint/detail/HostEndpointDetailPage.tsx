import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle, RefreshCw, HelpCircle, FileEdit, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTLSProfile, getScanHistory, patchEndpoint } from '@/api/endpoints'
import { getEndpointTags } from '@/api/tags'
import type { Endpoint, EndpointCert, EndpointTLSProfile, TLSClassification, TLSFinding, TLSGrade, TLSSeverity, EndpointScanHistoryItem, TagWithCategory } from '@/types/api'
import { ApiError } from '@/types/api'
import {
  Section,
  Row,
  BackBreadcrumb,
  EndpointHeader,
  TagsRow,
  LastScanErrorBanner,
  MonitoringRows,
  NotesSection,
  ScanHistorySection,
} from './shared'

// ---------------------------------------------------------------------------
// TLS state for async-loaded TLS profile
// ---------------------------------------------------------------------------

type TLSState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: EndpointTLSProfile }

// ---------------------------------------------------------------------------
// Severity primitives
// ---------------------------------------------------------------------------

const SeverityIcon: Record<TLSSeverity, React.ReactNode> = {
  ok:       <ShieldCheck className="h-8 w-8 text-tertiary" />,
  warning:  <ShieldAlert className="h-8 w-8 text-warning"  />,
  critical: <ShieldX     className="h-8 w-8 text-error"    />,
}

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
// Configuration section (host-specific fields)
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
          <Row label="DNS Name">
            <span className="text-base font-semibold">{endpoint.dnsName}</span>
          </Row>
          <Row label="IP Address">
            <span className="text-base font-semibold">{endpoint.ipAddress ?? 'Auto'}</span>
          </Row>
          <Row label="Port">
            <span className="text-base font-semibold">{endpoint.port}</span>
          </Row>
          <Row label="Scanner">
            <span className="text-base font-semibold">{endpoint.scannerName ?? 'Default'}</span>
          </Row>
          <MonitoringRows
            endpoint={endpoint}
            onToggleEnabled={onToggleEnabled}
            onToggleScanning={onToggleScanning}
          />
        </dl>

        {endpoint.lastScanError && <LastScanErrorBanner message={endpoint.lastScanError} />}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Security posture banner
// ---------------------------------------------------------------------------

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
// Security posture section
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Active TLS profile (protocol chips)
// ---------------------------------------------------------------------------

const TLS_VERSION_ROW: Array<{ name: string; key: 'tls13' | 'tls12' | 'tls11' | 'tls10' | 'ssl30' }> = [
  { name: 'TLS 1.3', key: 'tls13' },
  { name: 'TLS 1.2', key: 'tls12' },
  { name: 'TLS 1.1', key: 'tls11' },
  { name: 'TLS 1.0', key: 'tls10' },
  { name: 'SSL 3.0', key: 'ssl30' },
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

// ---------------------------------------------------------------------------
// Cipher suites
// ---------------------------------------------------------------------------

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
// Page
// ---------------------------------------------------------------------------

export default function HostEndpointDetailPage({ endpoint }: { endpoint: Endpoint }) {
  const id = endpoint.id

  const { data: tlsProfile, isLoading: tlsLoading, error: tlsError } = useQuery({
    queryKey: ['endpoint', id, 'tls'],
    queryFn: () => getTLSProfile(id),
  })

  const { data: historyData } = useQuery({
    queryKey: ['endpoint', id, 'history', 'recent'],
    queryFn: () => getScanHistory(id, 1, 10),
  })

  const { data: tagsData } = useQuery({
    queryKey: ['endpoint', id, 'tags'],
    queryFn: () => getEndpointTags(id),
  })

  const queryClient = useQueryClient()
  const { mutate: toggleScanning } = useMutation({
    mutationFn: (scanExempt: boolean) => patchEndpoint(id, { scanExempt }),
    onSuccess: (updated) => queryClient.setQueryData(['endpoint', id], updated),
  })
  const { mutate: toggleEnabled } = useMutation({
    mutationFn: (enabled: boolean) => patchEndpoint(id, { enabled }),
    onSuccess: (updated) => queryClient.setQueryData(['endpoint', id], updated),
  })

  const history: EndpointScanHistoryItem[] | null = historyData?.items ?? null
  const historyTotal = historyData?.totalCount ?? 0
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

  return (
    <div className="space-y-5">
      <BackBreadcrumb name={endpoint.name} />

      <EndpointHeader
        endpoint={endpoint}
        action={
          <Button
            onClick={() => { /* TODO: wire up force scan */ }}
            className="h-12 px-4 text-base font-semibold"
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Force Scan
          </Button>
        }
      />

      <TagsRow tags={tags} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <ConfigurationSection
            endpoint={endpoint}
            onToggleEnabled={toggleEnabled}
            onToggleScanning={(on) => toggleScanning(!on)}
          />
          <NotesSection endpoint={endpoint} />
          <ScanHistorySection items={history} endpointID={id} totalCount={historyTotal} />
        </div>

        <div className="space-y-5 lg:col-span-2">
          <SecurityPostureSection tlsState={tlsState} endpoint={endpoint} />
          <ActiveTLSProfileSection tlsState={tlsState} />
          <CipherSuitesSection tlsState={tlsState} />
        </div>
      </div>
    </div>
  )
}
