import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, AlertCircle, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getHost, getTLSProfile, getScanHistory } from '@/api/hosts'
import { getCertificate } from '@/api/certificates'
import { CertCard } from '@/components/CertCard'
import type { Host, HostTLSProfile, TLSClassification, TLSFinding, TLSSeverity, CertificateDetail, HostScanHistoryItem } from '@/types/api'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Layout primitives (mirrors CertificateDetailPage)
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
// Expiry badge (mirrors CertificateDetailPage)
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Shared finding row — used for both TLS versions and cipher suites
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
            <Badge variant="secondary" className="text-xs">
              Preferred
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{finding.reason}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Host info section
// ---------------------------------------------------------------------------

function HostInfoSection({ host }: { host: Host }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Host" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Field label="DNS Name">
          <span className="font-mono">{host.dnsName}</span>
        </Field>
        <Field label="Port">{host.port}</Field>
        {host.ipAddress && (
          <Field label="IP Override">
            <span className="font-mono">{host.ipAddress}</span>
          </Field>
        )}
        <Field label="Scanner">{host.scannerName ?? 'Default'}</Field>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

function NotesSection({ notes }: { notes: string | null }) {
  if (!notes) return null
  return (
    <div className="space-y-3">
      <SectionHeader title="Notes" />
      <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2">
        <ReactMarkdown>{notes}</ReactMarkdown>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scan status section
// ---------------------------------------------------------------------------

function ScanStatusSection({ host }: { host: Host }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Scan Status" />
      <Field label="Last Scanned">
        {host.lastScannedAt ? fmtDateTime(host.lastScannedAt) : '—'}
      </Field>
      {host.lastScanError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{host.lastScanError}</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Security posture description — derived from classification findings
// ---------------------------------------------------------------------------

function postureDescription(c: TLSClassification): string {
  if (c.overallSeverity === 'ok') {
    return 'No known weaknesses detected — strong TLS configuration.'
  }

  const criticalVersions = c.versions.filter((f) => f.severity === 'critical').map((f) => f.name)
  const criticalCiphers  = c.cipherSuites.filter((f) => f.severity === 'critical')
  const warnVersions     = c.versions.filter((f) => f.severity === 'warning').map((f) => f.name)
  const warnCiphers      = c.cipherSuites.filter((f) => f.severity === 'warning')

  const issues: string[] = []
  if (criticalVersions.length > 0) {
    issues.push(
      `${criticalVersions.join(' and ')} ${criticalVersions.length > 1 ? 'are' : 'is'} enabled`,
    )
  }
  if (criticalCiphers.length > 0) {
    issues.push(
      `${criticalCiphers.length} critically weak cipher${criticalCiphers.length > 1 ? 's' : ''} accepted`,
    )
  }
  if (warnVersions.length > 0) {
    issues.push(
      `${warnVersions.join(' and ')} ${warnVersions.length > 1 ? 'are' : 'is'} enabled`,
    )
  }
  if (warnCiphers.length > 0) {
    issues.push(
      `${warnCiphers.length} cipher${warnCiphers.length > 1 ? 's' : ''} lacking forward secrecy accepted`,
    )
  }

  const summary = issues.length > 0
    ? issues.join('; ') + '.'
    : 'Weaknesses detected — see findings below.'

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
  | { status: 'ready'; profile: HostTLSProfile }

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
        <p className="text-sm italic text-muted-foreground">
          No TLS profile yet — will be populated on the next scan cycle.
        </p>
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

      {/* Security posture + last scanned — mirrors Scan Status field layout */}
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Security Posture</p>
          <div className="mt-1 space-y-1.5">
            <SeverityBadge severity={classification.overallSeverity} />
            <p className="text-sm text-muted-foreground">
              {postureDescription(classification)}
            </p>
          </div>
        </div>
        <Field label="Last Scanned">{fmtDateTime(profile.scannedAt)}</Field>
      </div>

      {/* Partial-error banner */}
      {profile.scanError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{profile.scanError}</span>
        </div>
      )}

      {/* TLS versions */}
      {classification.versions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Supported Versions</p>
          <div className="space-y-1.5">
            {classification.versions.map((f) => (
              <FindingRow key={f.name} finding={f} />
            ))}
          </div>
        </div>
      )}

      {/* Cipher suites — one per line, server-preferred one marked */}
      {classification.cipherSuites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Supported Cipher Suites ({classification.cipherSuites.length})
          </p>
          <div className="space-y-1.5">
            {classification.cipherSuites.map((f) => (
              <FindingRow
                key={f.name}
                finding={f}
                preferred={f.name === profile.selectedCipher}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Active certificate card (right column)
// Mirrors the chain-item cards in CertificateDetailPage.
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
        <p className="text-sm italic text-muted-foreground">
          No certificate recorded yet.
        </p>
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
// Scan history section (right column)
// ---------------------------------------------------------------------------

function ScanHistoryRow({ item }: { item: HostScanHistoryItem }) {
  const ok = !item.scanError
  return (
    <div className="flex items-start gap-3 px-1 py-2">
      <div className="mt-0.5 shrink-0">
        {ok
          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
          : <XCircle className="h-4 w-4 text-red-600" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{fmtDateTime(item.scannedAt)}</p>
        {item.tlsVersion && (
          <p className="text-xs font-medium">{item.tlsVersion}</p>
        )}
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
        {item.scanError && (
          <p className="text-xs text-destructive">{item.scanError}</p>
        )}
      </div>
    </div>
  )
}

function ScanHistorySection({ items }: { items: HostScanHistoryItem[] | null }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Scan History" />
      {items === null ? (
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No scan history yet.</p>
      ) : (
        <div>
          {items.map((item) => (
            <ScanHistoryRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type HostState =
  | { status: 'loading' }
  | { status: 'ready'; host: Host }
  | { status: 'error'; message: string }

export default function HostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [hostState, setHostState] = useState<HostState>({ status: 'loading' })
  const [tlsState, setTLSState] = useState<TLSState>({ status: 'loading' })
  const [certState, setCertState] = useState<CertState>({ status: 'loading' })
  const [history, setHistory] = useState<HostScanHistoryItem[] | null>(null)

  useEffect(() => {
    if (!id) return
    getHost(id)
      .then((host) => setHostState({ status: 'ready', host }))
      .catch((err) =>
        setHostState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Failed to load host.',
        }),
      )
  }, [id])

  useEffect(() => {
    if (!id) return
    getTLSProfile(id)
      .then((profile) => setTLSState({ status: 'ready', profile }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setTLSState({ status: 'none' })
        } else {
          setTLSState({
            status: 'error',
            message: err instanceof ApiError ? err.message : 'Failed to load TLS profile.',
          })
        }
      })
  }, [id])

  // Fetch the active certificate once the host is known.
  useEffect(() => {
    if (hostState.status !== 'ready') return
    const fp = hostState.host.activeFingerprint
    if (!fp) {
      setCertState({ status: 'none' })
      return
    }
    getCertificate(fp)
      .then((cert) => setCertState({ status: 'ready', cert }))
      .catch((err) =>
        setCertState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Failed to load certificate.',
        }),
      )
  }, [hostState])

  useEffect(() => {
    if (!id) return
    getScanHistory(id)
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]))
  }, [id])

  const backLink = (
    <Link
      to="/hosts"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Hosts
    </Link>
  )

  if (hostState.status === 'loading') {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (hostState.status === 'error') {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-destructive">{hostState.message}</p>
      </div>
    )
  }

  const { host } = hostState

  return (
    <div className="space-y-5">
      {backLink}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{host.name}</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {host.dnsName}:{host.port}
          </p>
        </div>
        {host.enabled ? (
          <Badge variant="outline" className="border-green-500 bg-green-50 text-green-700">
            Enabled
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Disabled
          </Badge>
        )}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

        {/* ── Left column — host info + TLS profile ── */}
        <div className="space-y-6">
          <HostInfoSection host={host} />
          <NotesSection notes={host.notes} />
          <ScanStatusSection host={host} />
          <TLSProfileSection tlsState={tlsState} />
        </div>

        {/* ── Right column — active certificate card ── */}
        <div className="space-y-6">
          <ActiveCertSection certState={certState} />
          <ScanHistorySection items={history} />
        </div>

      </div>
    </div>
  )
}
