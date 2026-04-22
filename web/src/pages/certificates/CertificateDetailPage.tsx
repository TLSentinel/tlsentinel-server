import { Fragment, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Check,
  Download,
  KeyRound,
  Landmark,
  Server,
  Shield,
  ShieldCheck,
  XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCertificate, getCertificateHosts, getCertificateHostsHistorical } from '@/api/certificates'
import { listRootStores } from '@/api/rootstores'
import type { CertificateDetail, EndpointListItem, HistoricalEndpointItem } from '@/types/api'
import { fmtDate } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Breadcrumb } from '@/components/Breadcrumb'

// ---------------------------------------------------------------------------
// Shared formatting / status helpers
// ---------------------------------------------------------------------------

function keyLabel(cert: CertificateDetail) {
  if (!cert.keyAlgorithm) return ''
  return cert.keySize > 0 ? `${cert.keyAlgorithm} ${cert.keySize}-bit` : cert.keyAlgorithm
}

function formatSubjectDN(cert: CertificateDetail) {
  const parts = [
    cert.commonName     && `CN=${cert.commonName}`,
    cert.subjectOrg     && `O=${cert.subjectOrg}`,
    cert.subjectOrgUnit && `OU=${cert.subjectOrgUnit}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

function formatIssuerDN(cert: CertificateDetail) {
  const parts = [
    cert.issuerCn  && `CN=${cert.issuerCn}`,
    cert.issuerOrg && `O=${cert.issuerOrg}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

function certStatus(cert: CertificateDetail) {
  const daysLeft = Math.floor((new Date(cert.notAfter).getTime() - Date.now()) / 86_400_000)
  const expired  = daysLeft < 0
  const warning  = !expired && daysLeft <= 30
  return {
    expired,
    warning,
    label:
      expired ? 'Expired' :
      warning ? 'Expiring' :
                'Valid',
    pillClass:
      expired ? 'bg-error-container text-on-error-container'       :
      warning ? 'bg-warning-container text-on-warning-container'   :
                'bg-tertiary-container text-on-tertiary-container',
    Icon:
      expired ? XCircle        :
      warning ? AlertTriangle  :
                CheckCircle2,
  }
}

// ---------------------------------------------------------------------------
// Freestanding section header + attribute primitives
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {title}
    </h2>
  )
}

function Attr({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-md bg-muted px-3 py-1 text-sm">
          {item}
        </span>
      ))}
    </div>
  )
}

function UrlList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((u) => (
        <code key={u} className="rounded bg-muted px-2 py-0.5 font-mono text-sm break-all">
          {u}
        </code>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Validity timeline card (right column, top)
// ---------------------------------------------------------------------------

function ValidityTimelineCard({ cert }: { cert: CertificateDetail }) {
  const now      = Date.now()
  const issued   = new Date(cert.notBefore).getTime()
  const expiry   = new Date(cert.notAfter).getTime()
  const daysLeft = Math.floor((expiry - now) / 86_400_000)
  const expired  = daysLeft < 0
  const warning  = !expired && daysLeft <= 30
  const pct      = Math.round(Math.min(Math.max((now - issued) / (expiry - issued), 0), 1) * 100)

  const barClass =
    expired ? 'bg-error'    :
    warning ? 'bg-warning'  :
              'bg-tertiary'
  const statusLabel =
    expired ? 'Expired' :
    warning ? 'Warning' :
              'Healthy'
  const statusColor =
    expired ? 'text-error'    :
    warning ? 'text-warning'  :
              'text-tertiary'
  const remainingLabel = expired ? 'Expired' : 'Remaining'
  const remainingText =
    expired ? `${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'Day' : 'Days'} ago` :
              `${daysLeft} ${daysLeft === 1 ? 'Day' : 'Days'}`

  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Validity Timeline
      </h3>

      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{remainingLabel}</p>
          <p className="mt-1 text-4xl font-bold leading-tight">{remainingText}</p>
        </div>
        <span className={`text-xs font-semibold uppercase tracking-widest ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-5 flex justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Issued</p>
          <p className="mt-1 text-sm font-medium">{fmtDate(cert.notBefore)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Expires</p>
          <p className="mt-1 text-sm font-medium">{fmtDate(cert.notAfter)}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root Store Trust — per-cert trust matrix derived from CCADB membership.
// Chain is walked server-side; `cert.trustedBy` lists root store IDs whose
// anchors appear anywhere in the chain.
// ---------------------------------------------------------------------------

function RootStoreTrustCard({ cert }: { cert: CertificateDetail }) {
  const { data: stores } = useQuery({
    queryKey: ['root-stores'],
    queryFn: listRootStores,
    staleTime: 5 * 60 * 1000,
  })

  const trustedSet = new Set(cert.trustedBy)

  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Root Store Trust
      </h3>

      {!stores ? (
        <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
      ) : stores.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">No root stores configured.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {stores.map((s) => {
            const trusted = trustedSet.has(s.id)
            return (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{s.name}</span>
                {trusted ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-tertiary-container px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-on-tertiary-container">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Trusted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <XCircle className="h-3.5 w-3.5" />
                    Not Trusted
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chain of Trust (horizontal Root → Intermediate → Leaf)
// ---------------------------------------------------------------------------

interface ChainCert {
  fingerprint: string
  commonName: string
  issuerFingerprint: string | null
  isTrustAnchor: boolean
}

type ChainRole = 'root' | 'intermediate' | 'leaf'

const CHAIN_ROLE_META: Record<ChainRole, {
  Icon: React.ComponentType<{ className?: string }>
  description: string
  pillLabel: string
  tileBg: string
  iconColor: string
  pillClass: string
}> = {
  root: {
    Icon: Landmark,
    description: 'Root Certificate Authority',
    pillLabel: 'ROOT',
    tileBg: 'bg-muted/70',
    iconColor: 'text-muted-foreground',
    pillClass: 'bg-foreground text-background',
  },
  intermediate: {
    Icon: Shield,
    description: 'Intermediate Certificate Authority',
    pillLabel: 'INTERMEDIATE',
    tileBg: 'bg-muted/70',
    iconColor: 'text-muted-foreground',
    pillClass: 'bg-foreground text-background',
  },
  leaf: {
    Icon: BadgeCheck,
    description: 'Entity Certificate',
    pillLabel: 'LEAF',
    tileBg: 'bg-primary-container/50',
    iconColor: 'text-primary',
    pillClass: 'bg-primary-container text-white',
  },
}

function ChainNode({
  fingerprint,
  commonName,
  role,
}: {
  fingerprint: string
  commonName: string
  role: ChainRole
}) {
  const meta = CHAIN_ROLE_META[role]
  const Icon = meta.Icon

  return (
    <Link
      to={`/certificates/${fingerprint}`}
      title={commonName}
      className="flex items-center gap-4 min-w-0 hover:opacity-80 transition-opacity"
    >
      <div className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${meta.tileBg}`}>
        <Icon className={`h-7 w-7 ${meta.iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold break-words leading-tight">{commonName || '—'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
      </div>
      <span className={`shrink-0 inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${meta.pillClass}`}>
        {meta.pillLabel}
      </span>
    </Link>
  )
}

function ChainOfTrustSection({ cert }: { cert: CertificateDetail }) {
  const [ancestors, setAncestors] = useState<ChainCert[]>([])
  const [loading, setLoading] = useState(!cert.isTrustAnchor && !!cert.issuerFingerprint)

  useEffect(() => {
    // Already at the anchor — nothing above to walk. Happens for CCADB roots
    // and for locally-stored cross-signs that Subject+SKI-match an anchor.
    if (cert.isTrustAnchor || !cert.issuerFingerprint) {
      setLoading(false)
      return
    }
    let cancelled = false

    async function traverse() {
      const result: ChainCert[] = []
      const seen = new Set([cert.fingerprint])
      let nextFp = cert.issuerFingerprint

      for (let depth = 0; depth < 4 && nextFp && !seen.has(nextFp); depth++) {
        try {
          const parent = await getCertificate(nextFp)
          if (cancelled) return
          seen.add(parent.fingerprint)
          result.push({
            fingerprint: parent.fingerprint,
            commonName: parent.commonName,
            issuerFingerprint: parent.issuerFingerprint,
            isTrustAnchor: parent.isTrustAnchor,
          })
          // Stop at the first anchor-equivalent parent so we don't follow a
          // cross-sign's issuer_fingerprint up to its signing parent, which
          // would mislabel the real root as an intermediate.
          if (parent.isTrustAnchor) break
          nextFp = parent.issuerFingerprint
        } catch {
          break
        }
      }

      if (!cancelled) {
        setAncestors(result)
        setLoading(false)
      }
    }

    traverse()
    return () => { cancelled = true }
  }, [cert.fingerprint, cert.issuerFingerprint, cert.isTrustAnchor])

  // Build visualization: root on left → ... → leaf on right.
  // `ancestors` is ordered [immediate issuer, grandparent, ...] so reverse it.
  const leaf: ChainCert = {
    fingerprint: cert.fingerprint,
    commonName: cert.commonName,
    issuerFingerprint: cert.issuerFingerprint,
    isTrustAnchor: cert.isTrustAnchor,
  }
  const reversed = [...ancestors].reverse()
  const nodes: Array<ChainCert & { role: ChainRole }> = [
    ...reversed.map((c, i) => ({
      ...c,
      role: (i === 0 ? 'root' : 'intermediate') as ChainRole,
    })),
    { ...leaf, role: (cert.isTrustAnchor ? 'root' : 'leaf') as ChainRole },
  ]

  return (
    <section>
      <SectionHeader title="Chain of Trust" />
      {loading && ancestors.length === 0 ? (
        <p className="mt-5 text-xs italic text-muted-foreground">Loading chain…</p>
      ) : (
        <div className="mt-5 space-y-2">
          {nodes.map((n, i) => (
            <Fragment key={n.fingerprint}>
              <ChainNode fingerprint={n.fingerprint} commonName={n.commonName} role={n.role} />
              {i < nodes.length - 1 && (
                <div className="ml-7 h-6 border-l border-border" aria-hidden />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Certificate attributes grid
// ---------------------------------------------------------------------------

function CertificateAttributesSection({ cert }: { cert: CertificateDetail }) {
  const hasEKU = cert.extKeyUsages.length > 0
  return (
    <section>
      <SectionHeader title="Certificate Attributes" />
      <dl className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <Attr label="Subject DN">{formatSubjectDN(cert)}</Attr>
        <Attr label="Issuer DN">{formatIssuerDN(cert)}</Attr>
        <Attr label="Serial Number">
          <span className="break-all font-mono text-sm">{cert.serialNumber}</span>
        </Attr>
        <Attr label="Signature Algorithm">{cert.signatureAlgorithm || '—'}</Attr>
        <Attr label="Public Key">{keyLabel(cert) || '—'}</Attr>
        <Attr label="Key Usage">
          {cert.keyUsages.length > 0 ? cert.keyUsages.join(', ') : '—'}
        </Attr>
        {hasEKU && (
          <Attr label="Extended Key Usage" wide>
            {cert.extKeyUsages.join(', ')}
          </Attr>
        )}
      </dl>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Subject Alternative Names
// ---------------------------------------------------------------------------

function SANsSection({ cert }: { cert: CertificateDetail }) {
  if (cert.sans.length === 0) return null
  return (
    <section>
      <SectionHeader title="Subject Alternative Names (SANs)" />
      <div className="mt-5">
        <ChipList items={cert.sans} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Fingerprints / Key IDs
// ---------------------------------------------------------------------------

function FingerprintsSection({ cert }: { cert: CertificateDetail }) {
  return (
    <section>
      <SectionHeader title="Fingerprints & Key IDs" />
      <dl className="mt-5 space-y-5">
        <Attr label="SHA-256 Fingerprint">
          <span className="break-all font-mono text-sm">{cert.fingerprint}</span>
        </Attr>
        <Attr label="Subject Key ID">
          <span className="break-all font-mono text-sm">{cert.subjectKeyId || '—'}</span>
        </Attr>
        {cert.authorityKeyId && (
          <Attr label="Authority Key ID">
            <span className="break-all font-mono text-sm">{cert.authorityKeyId}</span>
          </Attr>
        )}
      </dl>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

function RevocationSection({ cert }: { cert: CertificateDetail }) {
  if (cert.ocspUrls.length === 0 && cert.crlDistributionPoints.length === 0) return null
  return (
    <section>
      <SectionHeader title="Revocation" />
      <dl className="mt-5 space-y-5">
        <Attr label="OCSP">
          <UrlList urls={cert.ocspUrls} />
        </Attr>
        <Attr label="CRL Distribution Points">
          <UrlList urls={cert.crlDistributionPoints} />
        </Attr>
      </dl>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Endpoints using this certificate (right column)
// ---------------------------------------------------------------------------

function endpointIcon(type: string) {
  switch (type) {
    case 'saml':   return KeyRound
    case 'manual': return ShieldCheck
    default:       return Server
  }
}

function endpointSubtitle(ep: EndpointListItem) {
  if (ep.type === 'host')   return ep.port > 0 ? `${ep.dnsName}:${ep.port}` : ep.dnsName
  if (ep.type === 'saml')   return 'SAML IDP'
  if (ep.type === 'manual') return 'Manual'
  return ep.type.toUpperCase()
}

function endpointDotClass(ep: EndpointListItem) {
  if (ep.lastScanError) return 'bg-warning'
  if (!ep.earliestExpiry) return 'bg-muted-foreground/40'
  const days = Math.floor((new Date(ep.earliestExpiry).getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return 'bg-error'
  if (days <= 30) return 'bg-warning'
  return 'bg-tertiary'
}

function EndpointRow({ ep }: { ep: EndpointListItem }) {
  const Icon = endpointIcon(ep.type)
  const subtitle = endpointSubtitle(ep)
  const dotClass = endpointDotClass(ep)
  const subtitleClass = ep.type === 'host'
    ? 'mt-0.5 text-xs text-muted-foreground truncate font-mono'
    : 'mt-0.5 text-xs uppercase tracking-widest text-muted-foreground truncate'

  return (
    <Link
      to={`/endpoints/${ep.id}`}
      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
    >
      <div className="shrink-0 w-9 h-9 rounded-md bg-muted/70 flex items-center justify-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{ep.name}</p>
        <p className={subtitleClass}>{subtitle}</p>
      </div>
      <span className={`shrink-0 w-2 h-2 rounded-full ${dotClass}`} aria-hidden />
    </Link>
  )
}

function EndpointsSection({ fingerprint }: { fingerprint: string }) {
  const { data: endpoints, isLoading } = useQuery({
    queryKey: ['certificate', fingerprint, 'hosts'],
    queryFn: () => getCertificateHosts(fingerprint),
  })

  const endpointList: EndpointListItem[] = endpoints ?? []

  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Associated Endpoints
      </h3>

      {isLoading && <p className="mt-4 text-xs italic text-muted-foreground">Loading…</p>}

      {!isLoading && endpointList.length === 0 && (
        <p className="mt-4 text-sm italic text-muted-foreground">
          No endpoints are currently using this certificate.
        </p>
      )}

      {!isLoading && endpointList.length > 0 && (
        <div className="mt-4 space-y-1">
          {endpointList.map((ep) => <EndpointRow key={ep.id} ep={ep} />)}
        </div>
      )}
    </div>
  )
}

// HistoricalEndpointRow mirrors EndpointRow but substitutes the right-side
// status dot for a "last seen" date — the endpoint's current posture isn't
// what's relevant here; when the cert was rotated off is.
function HistoricalEndpointRow({ ep }: { ep: HistoricalEndpointItem }) {
  const Icon = endpointIcon(ep.type)
  const subtitle = endpointSubtitle(ep)
  const subtitleClass = ep.type === 'host'
    ? 'mt-0.5 text-xs text-muted-foreground truncate font-mono'
    : 'mt-0.5 text-xs uppercase tracking-widest text-muted-foreground truncate'

  return (
    <Link
      to={`/endpoints/${ep.id}`}
      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
    >
      <div className="shrink-0 w-9 h-9 rounded-md bg-muted/70 flex items-center justify-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{ep.name}</p>
        <p className={subtitleClass}>{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Last seen</p>
        <p className="text-xs font-mono text-muted-foreground">{fmtDate(ep.lastSeenAt)}</p>
      </div>
    </Link>
  )
}

function HistoricalEndpointsSection({ fingerprint }: { fingerprint: string }) {
  const { data: endpoints, isLoading } = useQuery({
    queryKey: ['certificate', fingerprint, 'hosts', 'historical'],
    queryFn: () => getCertificateHostsHistorical(fingerprint),
  })

  const endpointList: HistoricalEndpointItem[] = endpoints ?? []

  // Hide the card entirely when there's no history — don't burn real estate
  // on a placeholder for the common case.
  if (!isLoading && endpointList.length === 0) return null

  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Historical Endpoints
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Endpoints that previously served this certificate.
      </p>

      {isLoading && <p className="mt-4 text-xs italic text-muted-foreground">Loading…</p>}

      {!isLoading && endpointList.length > 0 && (
        <div className="mt-4 space-y-1">
          {endpointList.map((ep) => <HistoricalEndpointRow key={ep.id} ep={ep} />)}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copy PEM / Download
// ---------------------------------------------------------------------------

function PEMActions({ pem, commonName }: { pem: string; commonName: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(pem)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const blob = new Blob([pem], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${commonName || 'certificate'}.pem`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-2">
      <Button onClick={handleCopy} className="h-12 px-4 text-base font-semibold">
        {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
        {copied ? 'Copied!' : 'Copy PEM'}
      </Button>
      <Button onClick={handleDownload} className="h-12 px-4 text-base font-semibold">
        <Download className="mr-1.5 h-4 w-4" />
        Download
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CertificateDetailPage() {
  const { fingerprint } = useParams<{ fingerprint: string }>()

  const { data: cert, isLoading, error: fetchError } = useQuery({
    queryKey: ['certificate', fingerprint],
    queryFn: () => getCertificate(fingerprint!),
    enabled: !!fingerprint,
  })

  const backLink = (
    <Breadcrumb items={[
      { label: 'Certificates', to: '/certificates' },
      { label: <>{cert ? cert.commonName || fingerprint : '…'}</> },
    ]} />
  )

  if (isLoading) {
    return <div className="space-y-4">{backLink}<p className="text-sm text-muted-foreground">Loading…</p></div>
  }

  if (fetchError) {
    return <div className="space-y-4">{backLink}<p className="text-sm text-destructive">{fetchError.message}</p></div>
  }

  if (!cert) return null

  const status = certStatus(cert)
  const StatusIcon = status.Icon
  const subtitleBits = [
    keyLabel(cert) && `${keyLabel(cert)} Certificate`,
    cert.signatureAlgorithm,
  ].filter(Boolean)

  return (
    <div className="space-y-8">
      {backLink}

      {/* Header: title + status pill, subtitle (key/sig), actions on right */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-5xl font-bold break-all">{cert.commonName || '—'}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${status.pillClass}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
          </div>
          {subtitleBits.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitleBits.join(' • ')}</p>
          )}
        </div>
        <div className="shrink-0 mt-2">
          <PEMActions pem={cert.pem} commonName={cert.commonName} />
        </div>
      </div>

      {/* 2/3 + 1/3 body */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

        {/* ── Left column (2/3) ── */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-card border border-border p-6 space-y-8">
            <ChainOfTrustSection cert={cert} />
            <CertificateAttributesSection cert={cert} />
            <SANsSection cert={cert} />
            <FingerprintsSection cert={cert} />
            <RevocationSection cert={cert} />
          </div>
        </div>

        {/* ── Right column (1/3) ── */}
        <div className="space-y-5 lg:col-span-1">
          <ValidityTimelineCard cert={cert} />
          <RootStoreTrustCard cert={cert} />
          <EndpointsSection fingerprint={cert.fingerprint} />
          <HistoricalEndpointsSection fingerprint={cert.fingerprint} />
        </div>

      </div>
    </div>
  )
}
