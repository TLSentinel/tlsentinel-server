import { useState, useCallback } from 'react'
import { Copy, Check, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { FIELD_LABEL } from '@/lib/utils'
import { Breadcrumb } from '@/components/Breadcrumb'
import { ErrorAlert } from '@/components/ErrorAlert'
import {
  decodeCert,
  fmtDate,
  DN_FIELDS,
  DN_LABELS,
  type DecodedCert,
} from '@/lib/cert-utils'

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>{title}</p>
      <Separator />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={FIELD_LABEL}>{label}</p>
      <div className="mt-1 text-sm font-medium break-all">{children}</div>
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])
  return (
    <div>
      <p className={FIELD_LABEL}>{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="text-xs font-mono break-all text-foreground">{value}</code>
        <button
          onClick={copy}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

function TagList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="font-mono text-xs">
          {item}
        </Badge>
      ))}
    </div>
  )
}

function UrlList({ urls }: { urls: string[] }) {
  if (!urls.length) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <div className="flex flex-col gap-1 mt-1">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer"
          className="text-sm text-primary hover:underline break-all">
          {u}
        </a>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Validity badge
// ---------------------------------------------------------------------------

function ValidityBadge({ cert }: { cert: DecodedCert }) {
  if (cert.isExpired) {
    return (
      <div className="flex items-center gap-1.5 text-destructive">
        <ShieldX className="h-4 w-4" />
        <span className="text-sm font-medium">Expired</span>
      </div>
    )
  }
  if (cert.daysRemaining <= 30) {
    return (
      <div className="flex items-center gap-1.5 text-amber-500">
        <ShieldAlert className="h-4 w-4" />
        <span className="text-sm font-medium">Expires in {cert.daysRemaining}d</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-emerald-500">
      <ShieldCheck className="h-4 w-4" />
      <span className="text-sm font-medium">Valid · {cert.daysRemaining}d remaining</span>
    </div>
  )
}

function DNSection({ title, fields }: { title: string; fields: Record<string, string[]> }) {
  return (
    <div className="space-y-3">
      <SectionHeader title={title} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DN_FIELDS.filter((f) => fields[f]).map((f) => (
          <Field key={f} label={DN_LABELS[f] ?? f}>{fields[f].join(', ')}</Field>
        ))}
        {Object.keys(fields).length === 0 && (
          <span className="text-sm text-muted-foreground col-span-2">—</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CertDecoderPage() {
  const [pem, setPem] = useState('')
  const [decoded, setDecoded] = useState<DecodedCert | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleDecode = useCallback(async () => {
    setError(null)
    setDecoded(null)
    setLoading(true)
    try {
      setDecoded(await decodeCert(pem))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse certificate')
    } finally {
      setLoading(false)
    }
  }, [pem])

  const handleClear = useCallback(() => {
    setPem('')
    setDecoded(null)
    setError(null)
  }, [])

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Toolbox', to: '/toolbox' },
        { label: 'Certificate Decoder' },
      ]} />

      <div>
        <h1 className="text-2xl font-semibold">Certificate Decoder</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Paste a PEM certificate to inspect all fields. Decoded entirely in your browser — nothing is transmitted.
        </p>
      </div>

      <div className="space-y-2">
        <Textarea
          placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
          value={pem}
          onChange={(e) => { setPem(e.target.value); setDecoded(null); setError(null) }}
          className="font-mono text-xs min-h-[140px] resize-y"
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleDecode} disabled={!pem.trim() || loading}>
            {loading ? 'Decoding…' : 'Decode'}
          </Button>
          {(pem || decoded) && <Button variant="ghost" onClick={handleClear}>Clear</Button>}
        </div>
      </div>

      {error && <ErrorAlert>{error}</ErrorAlert>}

      {decoded && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border p-4">
            <div>
              <p className={FIELD_LABEL}>Common Name</p>
              <p className="mt-1 text-sm font-semibold">{decoded.subject['CN']?.[0] ?? decoded.subjectString}</p>
            </div>
            <Separator orientation="vertical" className="h-8 hidden sm:block" />
            <ValidityBadge cert={decoded} />
            {decoded.isSelfSigned && <Badge variant="outline" className="text-xs">Self-signed</Badge>}
            {decoded.isCA && <Badge variant="outline" className="text-xs">CA Certificate</Badge>}
          </div>

          <DNSection title="Subject" fields={decoded.subject} />
          <DNSection title="Issuer" fields={decoded.issuer} />

          <div className="space-y-3">
            <SectionHeader title="Validity" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Not Before">{fmtDate(decoded.notBefore)}</Field>
              <Field label="Not After">{fmtDate(decoded.notAfter)}</Field>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Certificate Details" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Serial Number"><code className="text-xs font-mono">{decoded.serialNumber}</code></Field>
              <Field label="Signature Algorithm">{decoded.signatureAlgorithm}</Field>
              <Field label="Public Key">{decoded.publicKeyInfo}</Field>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Fingerprints" />
            <div className="space-y-3">
              <CopyField label="SHA-256" value={decoded.sha256} />
              <CopyField label="SHA-1" value={decoded.sha1} />
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Subject Alternative Names" />
            {decoded.sans.length === 0 ? (
              <span className="text-sm text-muted-foreground">None</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {decoded.sans.map((san, i) => (
                  <Badge key={i} variant="secondary" className="font-mono text-xs">
                    {san.type !== 'dns' ? `[${san.type}] ` : ''}{san.value}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <SectionHeader title="Key Usage" />
            <div className="space-y-3">
              <div>
                <p className={`${FIELD_LABEL} mb-1`}>Key Usage</p>
                <TagList items={decoded.keyUsages} />
              </div>
              <div>
                <p className={`${FIELD_LABEL} mb-1`}>Extended Key Usage</p>
                <TagList items={decoded.extendedKeyUsages} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Extensions" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Basic Constraints">
                {decoded.isCA
                  ? `CA: true${decoded.pathLength !== undefined ? `, Path Length: ${decoded.pathLength}` : ''}`
                  : 'CA: false'}
              </Field>
              {decoded.subjectKeyId && (
                <Field label="Subject Key Identifier">
                  <code className="text-xs font-mono">{decoded.subjectKeyId}</code>
                </Field>
              )}
              {decoded.authorityKeyId && (
                <Field label="Authority Key Identifier">
                  <code className="text-xs font-mono">{decoded.authorityKeyId}</code>
                </Field>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Authority Info Access" />
            <div className="space-y-3">
              <div>
                <p className={`${FIELD_LABEL} mb-1`}>OCSP</p>
                <UrlList urls={decoded.ocspUrls} />
              </div>
              <div>
                <p className={`${FIELD_LABEL} mb-1`}>CA Issuers</p>
                <UrlList urls={decoded.caIssuerUrls} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="CRL Distribution Points" />
            <UrlList urls={decoded.crlUrls} />
          </div>
        </div>
      )}
    </div>
  )
}
