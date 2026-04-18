import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, Copy, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCertificate, getCertificateHosts } from '@/api/certificates'
import type { CertificateDetail, EndpointListItem } from '@/types/api'
import { CertProgressCard } from '@/components/CertProgressCard'
import { fmtDate } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card overflow-hidden">
      {title && (
        <div className="px-5 py-3 bg-muted">
          <p className="text-sm font-medium">{title}</p>
        </div>
      )}
      <div className="p-5">{children}</div>
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
// Validity progress bar
// ---------------------------------------------------------------------------

function ValiditySection({ cert }: { cert: CertificateDetail }) {
  const now      = Date.now()
  const issued   = new Date(cert.notBefore).getTime()
  const expiry   = new Date(cert.notAfter).getTime()
  const daysLeft = Math.floor((expiry - now) / 86_400_000)
  const isExpired  = daysLeft < 0
  const isWarning  = !isExpired && daysLeft <= 30
  const pct        = Math.round(Math.min(Math.max((now - issued) / (expiry - issued), 0), 1) * 100)

  const barClass = isExpired ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500'

  return (
    <Section title="Validity">
      <div className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Issued: {fmtDate(cert.notBefore)}</span>
          <span>{isExpired ? 'Expired' : `Days remaining: ${daysLeft}`}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
          <Field label="Not Before">
            <span className="text-base font-semibold">{fmtDate(cert.notBefore)}</span>
          </Field>
          <Field label="Not After">
            <span className="text-base font-semibold">{fmtDate(cert.notAfter)}</span>
          </Field>
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

function SubjectSection({ cert }: { cert: CertificateDetail }) {
  return (
    <Section title="Subject">
      <div className="space-y-3">
        <div className="col-span-2">
          <Field label="Common Name">
            <span className="text-base font-semibold">{cert.commonName || '—'}</span>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Organization">
            <span className="text-base font-semibold">{cert.subjectOrg || '—'}</span>
          </Field>
          <Field label="Org Unit">
            <span className="text-base font-semibold">{cert.subjectOrgUnit || '—'}</span>
          </Field>
        </div>
        {cert.sans.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Subject Alternative Names</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cert.sans.map((san) => (
                <span key={san} className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                  {san}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Issuer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Key & Signature
// ---------------------------------------------------------------------------

function KeySection({ cert }: { cert: CertificateDetail }) {
  const keyLabel = cert.keySize > 0 ? `${cert.keyAlgorithm} ${cert.keySize}-bit` : cert.keyAlgorithm || '—'

  return (
    <Section title="Key & Signature">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Key Algorithm">
            <span className="text-base font-semibold">{cert.keyAlgorithm || '—'}</span>
          </Field>
          <Field label="Key Size">
            <span className="text-base font-semibold">{cert.keySize > 0 ? keyLabel : '—'}</span>
          </Field>
        </div>
        <Field label="Signature Algorithm">
          <span className="text-base font-semibold">{cert.signatureAlgorithm || '—'}</span>
        </Field>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Usages
// ---------------------------------------------------------------------------

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded border bg-muted px-2 py-0.5 text-xs font-medium">
          {item}
        </span>
      ))}
    </div>
  )
}

function UsageSection({ cert }: { cert: CertificateDetail }) {
  return (
    <Section title="Usages">
      <div className="space-y-3">
        <Field label="Key Usage"><ChipList items={cert.keyUsages} /></Field>
        <Field label="Extended Key Usage"><ChipList items={cert.extKeyUsages} /></Field>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

function IdentifiersSection({ cert }: { cert: CertificateDetail }) {
  return (
    <Section title="Identifiers">
      <div className="space-y-3">
        <Field label="SHA-256 Fingerprint">
          <span className="break-all font-mono text-xs">{cert.fingerprint}</span>
        </Field>
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
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

function RevocationSection({ cert }: { cert: CertificateDetail }) {
  return (
    <Section title="Revocation">
      <div className="space-y-3">
        <Field label="OCSP URL"><UrlList urls={cert.ocspUrls} /></Field>
        <Field label="CRL Distribution Points"><UrlList urls={cert.crlDistributionPoints} /></Field>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Certificate chain
// ---------------------------------------------------------------------------

interface ChainCert {
  fingerprint: string
  commonName: string
  notBefore: string
  notAfter: string
  issuerFingerprint: string | null
}


function ChainSection({ cert }: { cert: CertificateDetail }) {
  const [chain, setChain] = useState<ChainCert[]>([])
  const [loading, setLoading] = useState(!!cert.issuerFingerprint)

  useEffect(() => {
    if (!cert.issuerFingerprint) return
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
            notBefore: parent.notBefore,
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
    return () => { cancelled = true }
  }, [cert.fingerprint, cert.issuerFingerprint, cert.commonName, cert.notBefore, cert.notAfter])

  function certRole(index: number, total: number) {
    if (index === total - 1) return 'Root'
    return 'Intermediate'
  }

  return (
    <Section title="Issuer">
      <div className="space-y-2">
        {loading && chain.length === 0 && (
          <p className="text-xs italic text-muted-foreground">Loading chain…</p>
        )}
        {!loading && chain.length === 0 && (
          <p className="text-sm italic text-muted-foreground">No issuer chain available.</p>
        )}
        {chain.map((c, i) => (
          <CertProgressCard
            key={c.fingerprint}
            fingerprint={c.fingerprint}
            commonName={c.commonName}
            notBefore={c.notBefore}
            notAfter={c.notAfter}
            label={certRole(i, chain.length)}
          />
        ))}
        {loading && chain.length > 0 && (
          <p className="text-xs italic text-muted-foreground">Loading chain…</p>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Endpoints using this certificate
// ---------------------------------------------------------------------------

function EndpointsSection({ fingerprint }: { fingerprint: string }) {
  const { data: endpoints, isLoading } = useQuery({
    queryKey: ['certificate', fingerprint, 'hosts'],
    queryFn: () => getCertificateHosts(fingerprint),
  })

  const endpointList: EndpointListItem[] = endpoints ?? []
  const title = isLoading
    ? 'Endpoints'
    : `Endpoints (${endpointList.length})`

  return (
    <Section title={title}>
      {isLoading && <p className="text-xs italic text-muted-foreground">Loading…</p>}

      {!isLoading && endpointList.length === 0 && (
        <p className="text-sm italic text-muted-foreground">No endpoints are currently using this certificate.</p>
      )}

      {!isLoading && endpointList.length > 0 && (
        <div className="space-y-1.5">
          {endpointList.map((h) => (
            <div key={h.id} className="flex items-center rounded-md border px-3 py-2 text-sm">
              <Link to={`/endpoints/${h.id}`} className="font-medium hover:underline">{h.name}</Link>
            </div>
          ))}
        </div>
      )}
    </Section>
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
      <Button onClick={handleCopy}>
        {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
        {copied ? 'Copied!' : 'Copy PEM'}
      </Button>
      <Button onClick={handleDownload}>
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
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/certificates" className="hover:text-foreground">Certificates</Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="text-foreground">{cert ? cert.commonName || fingerprint : '…'}</span>
    </nav>
  )

  if (isLoading) {
    return <div className="space-y-4">{backLink}<p className="text-sm text-muted-foreground">Loading…</p></div>
  }

  if (fetchError) {
    return <div className="space-y-4">{backLink}<p className="text-sm text-destructive">{fetchError.message}</p></div>
  }

  if (!cert) return null

  return (
    <div className="space-y-5">
      {backLink}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-5xl font-bold">{cert.commonName || '—'}</h1>
        <div className="shrink-0 mt-2">
          <PEMActions pem={cert.pem} commonName={cert.commonName} />
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* ── Left column ── */}
        <div className="space-y-5">
          <SubjectSection cert={cert} />
          <ValiditySection cert={cert} />
          <KeySection cert={cert} />
          <UsageSection cert={cert} />
          <IdentifiersSection cert={cert} />
          <RevocationSection cert={cert} />
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">
          <ChainSection cert={cert} />
          <EndpointsSection fingerprint={cert.fingerprint} />
        </div>

      </div>
    </div>
  )
}
