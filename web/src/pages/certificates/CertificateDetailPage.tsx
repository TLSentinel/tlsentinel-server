import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, Copy, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getCertificate, getCertificateHosts } from '@/api/certificates'
import type { CertificateDetail, EndpointListItem } from '@/types/api'
import { ApiError } from '@/types/api'
import { CertCard, ExpiryBadge } from '@/components/CertCard'
import { fmtDate } from '@/lib/utils'

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

function UrlList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {urls.map((u) => (
        <code key={u} className="rounded bg-muted px-2 py-0.5 font-mono text-xs break-all">
          {u}
        </code>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function SubjectSection({ cert }: { cert: CertificateDetail }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Subject" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Common Name">{cert.commonName || '—'}</Field>
        <Field label="Organization">{cert.subjectOrg || '—'}</Field>
        <Field label="Org Unit">{cert.subjectOrgUnit || '—'}</Field>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Subject Alternative Names</p>
        {cert.sans.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {cert.sans.map((san) => (
              <span key={san} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                {san}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-0.5 text-sm font-medium">—</p>
        )}
      </div>
    </div>
  )
}

function IssuerSection({ cert }: { cert: CertificateDetail }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Issuer" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Common Name">{cert.issuerCn || '—'}</Field>
        <Field label="Organization">{cert.issuerOrg || '—'}</Field>
      </div>
      {cert.issuerFingerprint && (
        <Field label="Issuer Certificate">
          <Link
            to={`/certificates/${cert.issuerFingerprint}`}
            className="font-mono text-xs text-primary hover:underline"
          >
            {cert.issuerFingerprint.slice(0, 32)}…
          </Link>
        </Field>
      )}
    </div>
  )
}

function ValiditySection({ cert }: { cert: CertificateDetail }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Validity" />
      <div className="grid grid-cols-2 gap-x-6">
        <Field label="Not Before">{fmtDate(cert.notBefore)}</Field>
        <Field label="Not After">{fmtDate(cert.notAfter)}</Field>
      </div>
    </div>
  )
}

function KeySection({ cert }: { cert: CertificateDetail }) {
  const keyLabel =
    cert.keySize > 0 ? `${cert.keyAlgorithm} ${cert.keySize}-bit` : cert.keyAlgorithm || '—'

  return (
    <div className="space-y-3">
      <SectionHeader title="Key & Signature" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Key Algorithm">{cert.keyAlgorithm || '—'}</Field>
        <Field label="Key Size">{cert.keySize > 0 ? keyLabel : '—'}</Field>
      </div>
      <Field label="Signature Algorithm">{cert.signatureAlgorithm || '—'}</Field>
    </div>
  )
}

function UsageSection({ cert }: { cert: CertificateDetail }) {
  function ChipList({ items }: { items: string[] }) {
    if (items.length === 0) return <span className="text-muted-foreground">—</span>
    return (
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded bg-muted px-2 py-0.5 text-xs font-medium"
          >
            {item}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <SectionHeader title="Usages" />
      <Field label="Key Usage">
        <ChipList items={cert.keyUsages} />
      </Field>
      <Field label="Extended Key Usage">
        <ChipList items={cert.extKeyUsages} />
      </Field>
    </div>
  )
}

function IdentifiersSection({ cert }: { cert: CertificateDetail }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Identifiers" />
      <Field label="Serial Number">
        <span className="break-all font-mono text-xs">{cert.serialNumber}</span>
      </Field>
      <Field label="Subject Key ID">
        <span className="break-all font-mono text-xs">{cert.subjectKeyId}</span>
      </Field>
      {cert.authorityKeyId && (
        <Field label="Authority Key ID">
          <span className="break-all font-mono text-xs">{cert.authorityKeyId}</span>
        </Field>
      )}
      <Field label="SHA-256 Fingerprint">
        <span className="break-all font-mono text-xs">{cert.fingerprint}</span>
      </Field>
    </div>
  )
}

function RevocationSection({ cert }: { cert: CertificateDetail }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Revocation" />
      <Field label="OCSP URL">
        <UrlList urls={cert.ocspUrls} />
      </Field>
      <Field label="CRL Distribution Points">
        <UrlList urls={cert.crlDistributionPoints} />
      </Field>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chain section — walks issuerFingerprint links up to 5 levels
// ---------------------------------------------------------------------------

interface ChainCert {
  fingerprint: string
  commonName: string
  notAfter: string
  issuerFingerprint: string | null
}

function ChainSection({ cert }: { cert: CertificateDetail }) {
  const [chain, setChain] = useState<ChainCert[]>([
    {
      fingerprint: cert.fingerprint,
      commonName: cert.commonName,
      notAfter: cert.notAfter,
      issuerFingerprint: cert.issuerFingerprint,
    },
  ])
  const [loading, setLoading] = useState(!!cert.issuerFingerprint)

  useEffect(() => {
    if (!cert.issuerFingerprint) return
    let cancelled = false

    async function traverse() {
      const result: ChainCert[] = [
        {
          fingerprint: cert.fingerprint,
          commonName: cert.commonName,
          notAfter: cert.notAfter,
          issuerFingerprint: cert.issuerFingerprint,
        },
      ]
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
            notAfter: parent.notAfter,
            issuerFingerprint: parent.issuerFingerprint,
          })
          nextFp = parent.issuerFingerprint
        } catch {
          break
        }
      }

      if (!cancelled) {
        setChain(result)
        setLoading(false)
      }
    }

    traverse()
    return () => {
      cancelled = true
    }
  }, [cert.fingerprint, cert.issuerFingerprint, cert.commonName, cert.notAfter])

  function certRole(index: number, total: number) {
    if (index === 0) return 'Leaf'
    if (index === total - 1) return 'Root'
    return 'Intermediate'
  }

  return (
    <div className="space-y-3">
      <SectionHeader title={`Certificate Chain (${chain.length}${loading ? '+' : ''})`} />

      <div className="space-y-2">
        {chain.map((c, i) => (
          <CertCard
            key={c.fingerprint}
            fingerprint={c.fingerprint}
            commonName={c.commonName}
            notAfter={c.notAfter}
            role={certRole(i, chain.length)}
            isViewing={i === 0}
            truncate
          />
        ))}

        {loading && (
          <p className="text-xs italic text-muted-foreground">Loading chain…</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Endpoints section
// ---------------------------------------------------------------------------

function EndpointsSection({ fingerprint }: { fingerprint: string }) {
  const [endpoints, setEndpoints] = useState<EndpointListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCertificateHosts(fingerprint)
      .then(setEndpoints)
      .catch(() => setEndpoints([]))
      .finally(() => setLoading(false))
  }, [fingerprint])

  const title = loading
    ? 'Endpoints Using This Certificate'
    : `Endpoints Using This Certificate (${endpoints.length})`

  return (
    <div className="space-y-3">
      <SectionHeader title={title} />

      {loading && <p className="text-xs italic text-muted-foreground">Loading…</p>}

      {!loading && endpoints.length === 0 && (
        <p className="text-sm italic text-muted-foreground">
          No endpoints are currently using this certificate.
        </p>
      )}

      {!loading && endpoints.length > 0 && (
        <div className="space-y-1.5">
          {endpoints.map((h) => (
            <div
              key={h.id}
              className="flex items-center rounded-md border px-3 py-2 text-sm"
            >
              <Link
                to={`/endpoints/${h.id}`}
                className="font-medium hover:underline"
              >
                {h.name}
              </Link>
            </div>
          ))}
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
      <Button variant="outline" size="sm" onClick={handleCopy}>
        {copied ? (
          <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="mr-1.5 h-3.5 w-3.5" />
        )}
        {copied ? 'Copied!' : 'Copy PEM'}
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownload}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Download
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PageState =
  | { status: 'loading' }
  | { status: 'success'; cert: CertificateDetail }
  | { status: 'error'; message: string }

export default function CertificateDetailPage() {
  const { fingerprint } = useParams<{ fingerprint: string }>()
  const [state, setState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    if (!fingerprint) return
    getCertificate(fingerprint)
      .then((cert) => setState({ status: 'success', cert }))
      .catch((err) =>
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Failed to load certificate.',
        }),
      )
  }, [fingerprint])

  const backLink = (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/certificates" className="hover:text-foreground">Certificates</Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground">{state.status === 'success' ? state.cert.commonName || fingerprint : '…'}</span>
    </nav>
  )

  if (state.status === 'loading') {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-destructive">{state.message}</p>
      </div>
    )
  }

  const { cert } = state

  return (
    <div className="space-y-5">
      {backLink}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{cert.commonName || '—'}</h1>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {cert.fingerprint}
          </p>
        </div>
        <ExpiryBadge notAfter={cert.notAfter} />
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ── Left column ── */}
        <div className="space-y-6">
          <SubjectSection cert={cert} />
          <IssuerSection cert={cert} />
          <ValiditySection cert={cert} />
          <KeySection cert={cert} />
          <UsageSection cert={cert} />
          <IdentifiersSection cert={cert} />
          <PEMActions pem={cert.pem} commonName={cert.commonName} />
          <RevocationSection cert={cert} />
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          <ChainSection cert={cert} />
          <EndpointsSection fingerprint={cert.fingerprint} />
        </div>
      </div>
    </div>
  )
}
