import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ChevronRight, AlertCircle, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle, Pencil, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getEndpoint, getTLSProfile, getScanHistory, updateEndpoint } from '@/api/endpoints'
import { getCertificate } from '@/api/certificates'
import { listScanners } from '@/api/scanners'
import { resolve } from '@/api/utils'
import { CertCard } from '@/components/CertCard'
import type { Endpoint, EndpointTLSProfile, TLSClassification, TLSFinding, TLSSeverity, CertificateDetail, EndpointScanHistoryItem, ScannerToken, UpdateEndpointRequest } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDateTime } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <Separator />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Severity primitives
// ---------------------------------------------------------------------------

const severityBorder: Record<TLSSeverity, string> = {
  ok:       'border-green-500 bg-green-50 text-green-700',
  warning:  'border-amber-400 bg-amber-50 text-amber-700',
  critical: 'border-red-500  bg-red-50  text-red-700',
}

const SeverityIcon: Record<TLSSeverity, React.ReactNode> = {
  ok:       <ShieldCheck className="h-4 w-4 text-green-600" />,
  warning:  <ShieldAlert className="h-4 w-4 text-amber-500" />,
  critical: <ShieldX     className="h-4 w-4 text-red-600"   />,
}

function SeverityBadge({ severity }: { severity: TLSSeverity }) {
  const label = severity === 'ok' ? 'OK' : severity === 'warning' ? 'Warning' : 'Critical'
  return (
    <Badge variant="outline" className={severityBorder[severity]}>
      {label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Finding row
// ---------------------------------------------------------------------------

function FindingRow({ finding, preferred = false }: { finding: TLSFinding; preferred?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-md border px-3 py-2">
      <div className="mt-0.5 shrink-0">{SeverityIcon[finding.severity]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{finding.name}</span>
          <SeverityBadge severity={finding.severity} />
          {preferred && (
            <Badge variant="secondary" className="text-xs">Preferred</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{finding.reason}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resolve button — inline in IP address field
// ---------------------------------------------------------------------------

function ResolveButton({ dnsName, onResolved }: { dnsName: string; onResolved: (ip: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function handleResolve() {
    if (!dnsName.trim()) return
    setLoading(true)
    setError(false)
    try {
      const res = await resolve(dnsName.trim())
      if (res.addresses.length > 0) onResolved(res.addresses[0])
    } catch {
      setError(true)
      setTimeout(() => setError(false), 2000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleResolve}
      disabled={loading || !dnsName.trim()}
      className={`absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-40
        ${error ? 'text-destructive' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
    >
      {loading ? 'Resolving…' : error ? 'Failed' : 'Resolve'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

const TYPE_META: Record<string, { label: string; className: string }> = {
  host:   { label: 'Host',   className: 'border-blue-500 bg-blue-50 text-blue-700' },
  saml:   { label: 'SAML',   className: 'border-violet-500 bg-violet-50 text-violet-700' },
  manual: { label: 'Manual', className: 'border-gray-400 bg-gray-50 text-gray-500' },
}

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type, className: 'border-border text-muted-foreground' }
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Edit form — draft state for all editable fields
// ---------------------------------------------------------------------------

interface Draft {
  name: string
  // host fields
  dnsName: string
  port: string
  ipAddress: string
  // saml fields
  url: string
  // common
  enabled: boolean
  scannerId: string  // '__default__' when none
  notes: string
}

function endpointToDraft(endpoint: Endpoint): Draft {
  return {
    name:      endpoint.name,
    dnsName:   endpoint.dnsName ?? '',
    port:      String(endpoint.port ?? 443),
    ipAddress: endpoint.ipAddress ?? '',
    url:       endpoint.url ?? '',
    enabled:   endpoint.enabled,
    scannerId: endpoint.scannerId ?? '__default__',
    notes:     endpoint.notes ?? '',
  }
}

// ---------------------------------------------------------------------------
// Endpoint info section
// ---------------------------------------------------------------------------

interface EndpointInfoSectionProps {
  endpoint: Endpoint
  editing: boolean
  draft: Draft
  scanners: ScannerToken[]
  onChange: (patch: Partial<Draft>) => void
}

function EndpointInfoSection({ endpoint, editing, draft, scanners, onChange }: EndpointInfoSectionProps) {
  const isHost   = endpoint.type === 'host'
  const isSAML   = endpoint.type === 'saml'
  const isManual = endpoint.type === 'manual'

  if (!editing) {
    return (
      <div className="space-y-3">
        <SectionHeader title="Endpoint" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">

          {/* Host fields */}
          {isHost && (
            <>
              <Field label="DNS Name">
                <span className="font-mono">{endpoint.dnsName}</span>
              </Field>
              <Field label="Port">{endpoint.port}</Field>
              <Field label="IP Address">
                <span className="font-mono">{endpoint.ipAddress ?? 'Auto'}</span>
              </Field>
              <div /> {/* spacer */}
            </>
          )}

          {/* SAML fields */}
          {isSAML && (
            <div className="col-span-2">
              <Field label="Metadata URL">
                <span className="font-mono break-all">{endpoint.url ?? '—'}</span>
              </Field>
            </div>
          )}

          {/* Manual — no type-specific fields */}
          {isManual && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground italic">
                Manually tracked — certificate is linked directly, no scanning.
              </p>
            </div>
          )}

          {/* Scanner + Enabled — shown for all types */}
          {!isManual && (
            <Field label="Scanner">{endpoint.scannerName ?? 'Default'}</Field>
          )}
          <Field label="Enabled">
            {endpoint.enabled
              ? <span className="text-green-600 font-medium">Yes</span>
              : <span className="text-muted-foreground">No</span>}
          </Field>
        </div>
      </div>
    )
  }

  // Edit mode
  return (
    <div className="space-y-3">
      <SectionHeader title="Endpoint" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">

        {/* Host edit fields */}
        {isHost && (
          <>
            <div>
              <p className="text-xs text-muted-foreground">DNS Name</p>
              <Input
                className="mt-0.5 h-8 font-mono text-sm"
                value={draft.dnsName}
                onChange={(e) => onChange({ dnsName: e.target.value })}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Port</p>
              <Input
                className="mt-0.5 h-8 text-sm"
                type="number"
                value={draft.port}
                onChange={(e) => onChange({ port: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">IP Address</p>
              <div className="relative mt-0.5">
                <Input
                  className="h-8 font-mono text-sm pr-20"
                  value={draft.ipAddress}
                  placeholder="Auto"
                  onChange={(e) => onChange({ ipAddress: e.target.value })}
                />
                <ResolveButton dnsName={draft.dnsName} onResolved={(ip) => onChange({ ipAddress: ip })} />
              </div>
            </div>
          </>
        )}

        {/* SAML edit fields */}
        {isSAML && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Metadata URL</p>
            <Input
              className="mt-0.5 h-8 font-mono text-sm"
              value={draft.url}
              placeholder="https://login.microsoftonline.com/.../federationmetadata.xml"
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </div>
        )}

        {/* Scanner — host and saml */}
        {!isManual && (
          <div>
            <p className="text-xs text-muted-foreground">Scanner</p>
            <Select value={draft.scannerId} onValueChange={(v) => onChange({ scannerId: v })}>
              <SelectTrigger className="mt-0.5 h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Default</SelectItem>
                {scanners.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Enabled — all types */}
        <div>
          <Label htmlFor="endpoint-enabled" className="text-xs text-muted-foreground cursor-pointer">Enabled</Label>
          <div className="mt-1.5">
            <Switch
              id="endpoint-enabled"
              checked={draft.enabled}
              onCheckedChange={(v) => onChange({ enabled: v })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

interface EndpointNotesSectionProps {
  endpoint: Endpoint
  editing: boolean
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
}

function NotesSection({ endpoint, editing, draft, onChange }: EndpointNotesSectionProps) {
  if (!editing) {
    return (
      <div className="space-y-3">
        <SectionHeader title="Notes" />
        {endpoint.notes ? (
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2">
            <ReactMarkdown>{endpoint.notes}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No notes.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <SectionHeader title="Notes" />
      <Textarea
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Supports Markdown"
        rows={6}
        className="text-sm"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scan status section
// ---------------------------------------------------------------------------

function ScanStatusSection({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Scan Status" />
      <Field label="Last Scanned">
        {endpoint.lastScannedAt ? fmtDateTime(endpoint.lastScannedAt) : '—'}
      </Field>
      {endpoint.lastScanError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{endpoint.lastScanError}</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Security posture description
// ---------------------------------------------------------------------------

function postureDescription(c: TLSClassification): string {
  if (c.overallSeverity === 'ok') return 'No known weaknesses detected — strong TLS configuration.'

  const criticalVersions = c.versions.filter((f) => f.severity === 'critical').map((f) => f.name)
  const criticalCiphers  = c.cipherSuites.filter((f) => f.severity === 'critical')
  const warnVersions     = c.versions.filter((f) => f.severity === 'warning').map((f) => f.name)
  const warnCiphers      = c.cipherSuites.filter((f) => f.severity === 'warning')

  const issues: string[] = []
  if (criticalVersions.length > 0)
    issues.push(`${criticalVersions.join(' and ')} ${criticalVersions.length > 1 ? 'are' : 'is'} enabled`)
  if (criticalCiphers.length > 0)
    issues.push(`${criticalCiphers.length} critically weak cipher${criticalCiphers.length > 1 ? 's' : ''} accepted`)
  if (warnVersions.length > 0)
    issues.push(`${warnVersions.join(' and ')} ${warnVersions.length > 1 ? 'are' : 'is'} enabled`)
  if (warnCiphers.length > 0)
    issues.push(`${warnCiphers.length} cipher${warnCiphers.length > 1 ? 's' : ''} lacking forward secrecy accepted`)

  const summary = issues.length > 0 ? issues.join('; ') + '.' : 'Weaknesses detected — see findings below.'
  return c.overallSeverity === 'critical'
    ? `${summary} Immediate remediation recommended.`
    : `${summary} Consider upgrading to stronger settings.`
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
      <div className="space-y-3">
        <SectionHeader title="TLS Profile" />
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      </div>
    )
  }
  if (tlsState.status === 'none') {
    return (
      <div className="space-y-3">
        <SectionHeader title="TLS Profile" />
        <p className="text-sm italic text-muted-foreground">No TLS profile yet — will be populated on the next scan cycle.</p>
      </div>
    )
  }
  if (tlsState.status === 'error') {
    return (
      <div className="space-y-3">
        <SectionHeader title="TLS Profile" />
        <p className="text-sm text-destructive">{tlsState.message}</p>
      </div>
    )
  }

  const { profile } = tlsState
  const { classification } = profile

  return (
    <div className="space-y-5">
      <SectionHeader title="TLS Profile" />
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Security Posture</p>
          <div className="mt-1 space-y-1.5">
            <SeverityBadge severity={classification.overallSeverity} />
            <p className="text-sm text-muted-foreground">{postureDescription(classification)}</p>
          </div>
        </div>
        <Field label="Last Scanned">{fmtDateTime(profile.scannedAt)}</Field>
      </div>
      {profile.scanError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{profile.scanError}</span>
        </div>
      )}
      {classification.versions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Supported Versions</p>
          <div className="space-y-1.5">
            {classification.versions.map((f) => <FindingRow key={f.name} finding={f} />)}
          </div>
        </div>
      )}
      {classification.cipherSuites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Supported Cipher Suites ({classification.cipherSuites.length})
          </p>
          <div className="space-y-1.5">
            {classification.cipherSuites.map((f) => (
              <FindingRow key={f.name} finding={f} preferred={f.name === profile.selectedCipher} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Active certificate section
// ---------------------------------------------------------------------------

type CertState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'ready'; cert: CertificateDetail }

function ActiveCertSection({ certState }: { certState: CertState }) {
  if (certState.status === 'loading') {
    return (
      <div className="space-y-3">
        <SectionHeader title="Active Certificate" />
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      </div>
    )
  }
  if (certState.status === 'none') {
    return (
      <div className="space-y-3">
        <SectionHeader title="Active Certificate" />
        <p className="text-sm italic text-muted-foreground">No certificate recorded yet.</p>
      </div>
    )
  }
  if (certState.status === 'error') {
    return (
      <div className="space-y-3">
        <SectionHeader title="Active Certificate" />
        <p className="text-sm text-destructive">{certState.message}</p>
      </div>
    )
  }

  const { cert } = certState
  return (
    <div className="space-y-3">
      <SectionHeader title="Active Certificate" />
      <CertCard
        fingerprint={cert.fingerprint}
        commonName={cert.commonName}
        notAfter={cert.notAfter}
        notBefore={cert.notBefore}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scan history section
// ---------------------------------------------------------------------------

function ScanHistoryRow({ item }: { item: EndpointScanHistoryItem }) {
  const ok = !item.scanError
  return (
    <div className="flex items-start gap-3 px-1 py-2">
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
    <div className="space-y-3">
      <SectionHeader title="Scan History" />
      {items === null ? (
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No scan history yet.</p>
      ) : (
        <div>{items.map((item) => <ScanHistoryRow key={item.id} item={item} />)}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type EndpointState =
  | { status: 'loading' }
  | { status: 'ready'; endpoint: Endpoint }
  | { status: 'error'; message: string }

export default function EndpointDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [endpointState, setEndpointState]   = useState<EndpointState>({ status: 'loading' })
  const [tlsState, setTLSState]     = useState<TLSState>({ status: 'loading' })
  const [certState, setCertState]   = useState<CertState>({ status: 'loading' })
  const [history, setHistory]       = useState<EndpointScanHistoryItem[] | null>(null)
  const [scanners, setScanners]     = useState<ScannerToken[]>([])
  const [editing, setEditing]       = useState(false)
  const [draft, setDraft]           = useState<Draft | null>(null)
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    listScanners().then(setScanners).catch(() => setScanners([]))
  }, [])

  useEffect(() => {
    if (!id) return
    getEndpoint(id)
      .then((endpoint) => {
        setEndpointState({ status: 'ready', endpoint })
        if (searchParams.get('edit') === 'true') {
          setDraft(endpointToDraft(endpoint))
          setEditing(true)
        }
      })
      .catch((err) => setEndpointState({ status: 'error', message: err instanceof ApiError ? err.message : 'Failed to load endpoint.' }))
  }, [id])

  useEffect(() => {
    if (!id) return
    getTLSProfile(id)
      .then((profile) => setTLSState({ status: 'ready', profile }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setTLSState({ status: 'none' })
        else setTLSState({ status: 'error', message: err instanceof ApiError ? err.message : 'Failed to load TLS profile.' })
      })
  }, [id])

  useEffect(() => {
    if (endpointState.status !== 'ready') return
    const fp = endpointState.endpoint.activeFingerprint
    if (!fp) { setCertState({ status: 'none' }); return }
    getCertificate(fp)
      .then((cert) => setCertState({ status: 'ready', cert }))
      .catch((err) => setCertState({ status: 'error', message: err instanceof ApiError ? err.message : 'Failed to load certificate.' }))
  }, [endpointState])

  useEffect(() => {
    if (!id) return
    getScanHistory(id).then((r) => setHistory(r.items)).catch(() => setHistory([]))
  }, [id])

  function startEditing(endpoint: Endpoint) {
    setDraft(endpointToDraft(endpoint))
    setEditing(true)
  }

  function cancelEditing(endpoint: Endpoint) {
    setDraft(endpointToDraft(endpoint))
    setEditing(false)
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((prev) => prev ? { ...prev, ...patch } : prev)
  }

  async function save() {
    if (!draft || !id || endpointState.status !== 'ready') return
    setSaving(true)
    const { endpoint } = endpointState
    try {
      const req: UpdateEndpointRequest = {
        name:      draft.name,
        type:      endpoint.type,
        enabled:   draft.enabled,
        scannerId: draft.scannerId === '__default__' ? undefined : draft.scannerId,
        notes:     draft.notes.trim() || undefined,
        // host-specific
        ...(endpoint.type === 'host' && {
          dnsName:   draft.dnsName,
          port:      Number(draft.port) || 443,
          ipAddress: draft.ipAddress.trim() || undefined,
        }),
        // saml-specific
        ...(endpoint.type === 'saml' && {
          url: draft.url.trim() || undefined,
        }),
      }
      const updated = await updateEndpoint(id, req)
      setEndpointState({ status: 'ready', endpoint: updated })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const backLink = (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/endpoints" className="hover:text-foreground">Endpoints</Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground">{endpointState.status === 'ready' ? endpointState.endpoint.name : '…'}</span>
    </nav>
  )

  if (endpointState.status === 'loading') {
    return <div className="space-y-4">{backLink}<p className="text-sm text-muted-foreground">Loading…</p></div>
  }

  if (endpointState.status === 'error') {
    return <div className="space-y-4">{backLink}<p className="text-sm text-destructive">{endpointState.message}</p></div>
  }

  const { endpoint } = endpointState

  return (
    <div className="space-y-5">
      {backLink}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          {editing && draft ? (
            <Input
              className="h-9 text-2xl font-bold"
              value={draft.name}
              onChange={(e) => patchDraft({ name: e.target.value })}
              autoFocus
            />
          ) : (
            <h1 className="text-2xl font-bold">{endpoint.name}</h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 mt-1">

          {/* Edit / Save / Cancel */}
          {editing && draft ? (
            <>
              <button
                onClick={() => save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                onClick={() => cancelEditing(endpoint)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => startEditing(endpoint)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

        {/* ── Left column ── */}
        <div className="space-y-6">
          <NotesSection
            endpoint={endpoint}
            editing={editing}
            draft={draft ?? endpointToDraft(endpoint)}
            onChange={patchDraft}
          />

          {/* Endpoint Type */}
          <div className="space-y-3">
            <SectionHeader title="Endpoint Type" />
            <TypeBadge type={endpoint.type} />
          </div>

          <EndpointInfoSection
            endpoint={endpoint}
            editing={editing}
            draft={draft ?? endpointToDraft(endpoint)}
            scanners={scanners}
            onChange={patchDraft}
          />
          <ScanStatusSection endpoint={endpoint} />
          {endpoint.type === 'host' && <TLSProfileSection tlsState={tlsState} />}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          <ActiveCertSection certState={certState} />
          <ScanHistorySection items={history} />
        </div>

      </div>
    </div>
  )
}
