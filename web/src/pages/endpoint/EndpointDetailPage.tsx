import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ChevronRight, AlertCircle, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getEndpoint, getTLSProfile, getScanHistory, patchEndpoint } from '@/api/endpoints'
import { getEndpointTags } from '@/api/tags'
import type { Endpoint, EndpointCert, EndpointTLSProfile, TLSClassification, TLSFinding, TLSSeverity, EndpointScanHistoryItem, TagWithCategory } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDateTime } from '@/lib/utils'
import { CertProgressCard } from '@/components/CertProgressCard'
import { categoryColor } from '@/lib/tag-colors'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function Section({ title, className, children }: { title?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl bg-card overflow-hidden ${className ?? ''}`}>
      {title && (
        <div className="px-5 py-3 bg-muted">
          <p className="text-sm font-medium">{title}</p>
        </div>
      )}
      <div className="p-5">
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium">{children}</div>
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

function EndpointInfoSection({ endpoint, onToggleEnabled, tags }: { endpoint: Endpoint; onToggleEnabled: (enabled: boolean) => void; tags: TagWithCategory[] }) {
  const isHost   = endpoint.type === 'host'
  const isSAML   = endpoint.type === 'saml'
  const isManual = endpoint.type === 'manual'

  return (
    <Section title="Endpoint">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">

          {isHost && (
            <div className="col-span-2">
              <Field label="DNS Name">
                <span className="text-base font-semibold">{endpoint.dnsName}</span>
              </Field>
            </div>
          )}

          {isSAML && (
            <div className="col-span-2">
              <Field label="Metadata URL">
                <span className="font-mono break-all">{endpoint.url ?? '—'}</span>
              </Field>
            </div>
          )}

          {isManual && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground italic">
                Manually tracked — certificate is linked directly, no scanning.
              </p>
            </div>
          )}

          {isHost && (
            <Field label="IP Address">
              <span className="text-base font-semibold">{endpoint.ipAddress ?? 'Auto'}</span>
            </Field>
          )}

          {isHost && <Field label="Port"><span className="text-base font-semibold">{endpoint.port}</span></Field>}

          {tags.length > 0 && (
            <Field label="Tags">
              <div className="flex flex-col items-start gap-1.5">
                {tags.map(tag => (
                  <span
                    key={tag.id}
                    className={`inline-flex items-center gap-1 rounded border px-2.5 py-0.5 text-xs font-medium ${categoryColor(tag.categoryId)}`}
                  >
                    <span className="opacity-60">{tag.categoryName}:</span>
                    {tag.name}
                  </span>
                ))}
              </div>
            </Field>
          )}

          <div className="col-start-2">
            <Field label="Monitored">
              <Switch
                checked={endpoint.enabled}
                onCheckedChange={onToggleEnabled}
              />
            </Field>
          </div>

        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

function NotesSection({ endpoint }: { endpoint: Endpoint }) {
  return (
    <Section title="Notes">
      {endpoint.notes ? (
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2">
          <ReactMarkdown>{endpoint.notes}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">No notes.</p>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Scan status section
// ---------------------------------------------------------------------------

function ScanStatusSection({ endpoint, onToggleScanning }: { endpoint: Endpoint; onToggleScanning: (enabled: boolean) => void }) {
  const isManual = endpoint.type === 'manual'
  const scanningOn = !endpoint.scanExempt

  return (
    <Section className="bg-muted/40">
      <div className="space-y-3">
        {!isManual && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Scanner"><span className="text-base font-semibold">{endpoint.scannerName ?? 'Default'}</span></Field>
            <Field label="Scanning">
              <Switch
                checked={scanningOn}
                onCheckedChange={onToggleScanning}
              />
            </Field>
          </div>
        )}
        <Field label="Last Scanned">
          <span className="text-base font-semibold">{endpoint.lastScannedAt ? fmtDateTime(endpoint.lastScannedAt) : '—'}</span>
        </Field>
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

// ---------------------------------------------------------------------------
// Security posture banner
// ---------------------------------------------------------------------------

// Formal summary shown below the compliance score.
// TODO: finalise copy for each severity tier.
function postureSummary(c: TLSClassification): string {
  if (c.overallSeverity === 'ok')
    return 'This endpoint meets current TLS security standards. All negotiated cipher suites and protocol versions are considered acceptable.'
  if (c.overallSeverity === 'warning')
    return 'This endpoint does not fully comply with modern TLS best practices. Review the findings below and consider upgrading the affected configuration.'
  return 'This endpoint fails to meet minimum TLS security standards and presents a significant risk. Immediate remediation is required.'
}

// Specific detail shown inside the coloured posture banner.
// TODO: finalise copy for each severity tier.
function postureDetail(c: TLSClassification): string {
  const criticalCiphers = c.cipherSuites.filter((f) => f.severity === 'critical')
  const warnCiphers     = c.cipherSuites.filter((f) => f.severity === 'warning')
  const criticalVersions = c.versions.filter((f) => f.severity === 'critical').map((f) => f.name)

  if (c.overallSeverity === 'ok')
    return 'No insecure protocol versions or cipher suites were detected.'
  if (criticalVersions.length > 0)
    return `${criticalVersions.join(' and ')} ${criticalVersions.length > 1 ? 'are' : 'is'} enabled and must be disabled immediately.`
  if (criticalCiphers.length > 0)
    return `${criticalCiphers.length} critically weak cipher${criticalCiphers.length > 1 ? 's' : ''} ${criticalCiphers.length > 1 ? 'are' : 'is'} currently accepted by this endpoint.`
  if (warnCiphers.length > 0)
    return `${warnCiphers.length} cipher${warnCiphers.length > 1 ? 's' : ''} lacking Elliptic Curve Diffie-Hellman (ECDHE) forward secrecy ${warnCiphers.length > 1 ? 'are' : 'is'} currently accepted.`
  return 'Weaknesses detected — review the findings below.'
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

function TLSProfileSection({ tlsState }: { tlsState: TLSState }) {
  if (tlsState.status === 'loading') {
    return (
      <Section title="TLS Profile">
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      </Section>
    )
  }
  if (tlsState.status === 'none') {
    return (
      <Section title="TLS Profile">
        <p className="text-sm italic text-muted-foreground">No TLS profile yet — will be populated on the next scan cycle.</p>
      </Section>
    )
  }
  if (tlsState.status === 'error') {
    return (
      <Section title="TLS Profile">
        <p className="text-sm text-destructive">{tlsState.message}</p>
      </Section>
    )
  }

  const { profile } = tlsState
  const { classification } = profile

  return (
    <Section title="TLS Profile">
      <div className="space-y-5">
        {/* Security posture subsection */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Security Posture</p>

          {/* Compliance score — placeholder until scoring logic is implemented */}
          <div className="rounded-xl bg-primary bg-[linear-gradient(180deg,var(--primary-container),var(--primary))] text-primary-foreground p-5 space-y-2">
            <div className="flex items-baseline gap-2.5">
              <span className="text-5xl font-bold tracking-tight">00%</span>
              <span className="text-sm font-medium text-primary-foreground/70">Compliance Score</span>
            </div>
            <p className="text-sm text-primary-foreground/80">{postureSummary(classification)}</p>
          </div>

          <PostureBanner classification={classification} />
        </div>

        {profile.scanError && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{profile.scanError}</span>
          </div>
        )}

        {classification.versions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Supported Versions</p>
            <div className="space-y-1.5">
              {classification.versions.map((f) => <FindingRow key={f.name} finding={f} />)}
            </div>
          </div>
        )}

        {classification.cipherSuites.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Cipher Suites ({classification.cipherSuites.length})
            </p>
            <div className="space-y-1.5">
              {classification.cipherSuites.map((f) => (
                <FindingRow key={f.name} finding={f} preferred={f.name === profile.selectedCipher} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Active certificate section
// ---------------------------------------------------------------------------

const CERT_USE_LABEL: Record<string, string> = {
  tls:        'TLS Certificate',
  signing:    'Signing Certificate',
  encryption: 'Encryption Certificate',
  manual:     'Manually Added Certificate',
}

function ActiveCertsSection({ certs }: { certs: EndpointCert[] }) {
  return (
    <Section title="Certificates">
      {certs.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No certificates recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {certs.map((cert) => (
            <CertProgressCard
              key={`${cert.fingerprint}-${cert.certUse}`}
              fingerprint={cert.fingerprint}
              commonName={cert.commonName}
              notBefore={cert.notBefore}
              notAfter={cert.notAfter}
              label={CERT_USE_LABEL[cert.certUse] ?? cert.certUse}
            />
          ))}
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Scan history section
// ---------------------------------------------------------------------------

function ScanHistoryRow({ item }: { item: EndpointScanHistoryItem }) {
  const ok = !item.scanError
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="mt-0.5 shrink-0">
        {ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{fmtDateTime(item.scannedAt)}</p>
        {item.tlsVersion && <p className="text-xs font-medium">{item.tlsVersion}</p>}
        {item.fingerprint && (
          <div>
            <p className="text-xs text-muted-foreground">Fingerprint</p>
            <Link
              to={`/certificates/${item.fingerprint}`}
              className="block truncate font-mono text-xs text-muted-foreground/70 hover:text-primary hover:underline"
            >
              {item.fingerprint}
            </Link>
          </div>
        )}
        {item.scanError && <p className="text-xs text-destructive">{item.scanError}</p>}
      </div>
    </div>
  )
}

function ScanHistorySection({ items }: { items: EndpointScanHistoryItem[] | null }) {
  return (
    <Section title="Scan History">
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
        <div>
          <h1 className="text-5xl font-bold">{endpoint.name}</h1>
        </div>
        <Button onClick={() => navigate(`/endpoints/${id}/edit`)} className="shrink-0 mt-1">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
      </div>

      {/* Type badge */}
      <div>
        <Badge className="h-7 rounded-md px-3 text-sm font-semibold uppercase">
          {TYPE_LABEL[endpoint.type] ?? endpoint.type}
        </Badge>
      </div>

      {/* Two-column body (collapses to single column when there's no TLS Profile) */}
      <div className={`grid grid-cols-1 gap-5 ${endpoint.type === 'host' ? 'lg:grid-cols-2' : ''}`}>

        {/* ── Left column ── */}
        <div className="space-y-5">
          <EndpointInfoSection endpoint={endpoint} onToggleEnabled={toggleEnabled} tags={tags} />
          <ActiveCertsSection certs={endpoint.activeCerts} />
          {endpoint.notes && <NotesSection endpoint={endpoint} />}
          <ScanStatusSection endpoint={endpoint} onToggleScanning={(on) => toggleScanning(!on)} />
          <ScanHistorySection items={history} />
        </div>

        {/* ── Right column (only when TLS Profile has content) ── */}
        {endpoint.type === 'host' && (
          <div className="space-y-5">
            <TLSProfileSection tlsState={tlsState} />
          </div>
        )}

      </div>
    </div>
  )
}
