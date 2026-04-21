import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { FIELD_LABEL } from '@/lib/utils'
import { Breadcrumb } from '@/components/Breadcrumb'
import { ErrorAlert } from '@/components/ErrorAlert'
import {
  Pkcs10CertificateRequest,
  SubjectAlternativeNameExtension,
  KeyUsagesExtension,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  Extension,
} from '@peculiar/x509'

// OIDs for CSR extension lookup
const OID_SAN = '2.5.29.17'
const OID_KEY_USAGE = '2.5.29.15'
const OID_EKU = '2.5.29.37'

function findExt<T extends Extension>(
  extensions: Extension[],
  oid: string,
  Ctor: new (raw: ArrayBuffer) => T,
): T | null {
  const ext = extensions.find((e) => e.type === oid)
  return ext ? new Ctor(ext.rawData) : null
}

// ---------------------------------------------------------------------------
// Helpers (shared patterns with CertDecoderPage)
// ---------------------------------------------------------------------------

function pubKeyDescription(algo: Algorithm): string {
  const name = algo.name
  if (name.includes('RSA')) {
    const rsa = algo as RsaHashedKeyAlgorithm
    const bits = rsa.modulusLength ? ` ${rsa.modulusLength}-bit` : ''
    const hash = rsa.hash?.name ? ` / ${rsa.hash.name}` : ''
    return `${name}${bits}${hash}`
  }
  if (name === 'ECDSA' || name === 'ECDH' || name === 'EC') {
    const ec = algo as EcKeyAlgorithm
    return ec.namedCurve ? `${name} (${ec.namedCurve})` : name
  }
  return name
}

const KEY_USAGE_LABELS: Record<number, string> = {
  [KeyUsageFlags.digitalSignature]: 'Digital Signature',
  [KeyUsageFlags.nonRepudiation]: 'Non-Repudiation',
  [KeyUsageFlags.keyEncipherment]: 'Key Encipherment',
  [KeyUsageFlags.dataEncipherment]: 'Data Encipherment',
  [KeyUsageFlags.keyAgreement]: 'Key Agreement',
  [KeyUsageFlags.keyCertSign]: 'Certificate Sign',
  [KeyUsageFlags.cRLSign]: 'CRL Sign',
  [KeyUsageFlags.encipherOnly]: 'Encipher Only',
  [KeyUsageFlags.decipherOnly]: 'Decipher Only',
}

const EKU_LABELS: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Timestamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
}

function keyUsageList(flags: number): string[] {
  return Object.entries(KEY_USAGE_LABELS)
    .filter(([bit]) => flags & Number(bit))
    .map(([, label]) => label)
}

const DN_LABELS: Record<string, string> = {
  CN: 'Common Name',
  O: 'Organization',
  OU: 'Organizational Unit',
  C: 'Country',
  ST: 'State / Province',
  L: 'Locality',
  E: 'Email',
  emailAddress: 'Email',
  DC: 'Domain Component',
  SERIALNUMBER: 'Serial Number',
  UID: 'User ID',
}

const DN_FIELDS = ['CN', 'O', 'OU', 'C', 'ST', 'L', 'E', 'emailAddress', 'DC', 'SERIALNUMBER', 'UID']

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DecodedCSR {
  subject: Record<string, string[]>
  subjectString: string
  signatureAlgorithm: string
  publicKeyInfo: string
  sans: Array<{ type: string; value: string }>
  keyUsages: string[]
  extendedKeyUsages: string[]
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

async function decodeCSR(pem: string): Promise<DecodedCSR> {
  const csr = new Pkcs10CertificateRequest(pem.trim())

  function extractDN(name: typeof csr.subjectName) {
    const result: Record<string, string[]> = {}
    for (const field of DN_FIELDS) {
      const vals = name.getField(field)
      if (vals.length) result[field] = vals
    }
    return result
  }

  const exts = csr.extensions
  const sanExt = findExt(exts, OID_SAN, SubjectAlternativeNameExtension)
  const sans = sanExt
    ? sanExt.names.items.map((n) => ({ type: n.type, value: n.value }))
    : []

  const kuExt = findExt(exts, OID_KEY_USAGE, KeyUsagesExtension)
  const ekuExt = findExt(exts, OID_EKU, ExtendedKeyUsageExtension)

  return {
    subject: extractDN(csr.subjectName),
    subjectString: csr.subject,
    signatureAlgorithm: csr.signatureAlgorithm.name,
    publicKeyInfo: pubKeyDescription(csr.publicKey.algorithm),
    sans,
    keyUsages: kuExt ? keyUsageList(kuExt.usages) : [],
    extendedKeyUsages: ekuExt ? ekuExt.usages.map((u) => EKU_LABELS[String(u)] ?? String(u)) : [],
  }
}

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CsrDecoderPage() {
  const [pem, setPem] = useState('')
  const [decoded, setDecoded] = useState<DecodedCSR | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleDecode = useCallback(async () => {
    setError(null)
    setDecoded(null)
    setLoading(true)
    try {
      setDecoded(await decodeCSR(pem))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSR')
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
        { label: 'CSR Decoder' },
      ]} />

      <div>
        <h1 className="text-2xl font-semibold">CSR Decoder</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Paste a PEM certificate signing request to inspect its contents before submission. Decoded entirely in your browser.
        </p>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <Textarea
          placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----"
          value={pem}
          onChange={(e) => {
            setPem(e.target.value)
            setDecoded(null)
            setError(null)
          }}
          className="font-mono text-xs min-h-[140px] resize-y"
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleDecode} disabled={!pem.trim() || loading}>
            {loading ? 'Decoding…' : 'Decode'}
          </Button>
          {(pem || decoded) && (
            <Button variant="ghost" onClick={handleClear}>Clear</Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <ErrorAlert>{error}</ErrorAlert>}

      {/* Results */}
      {decoded && (
        <div className="space-y-8">
          {/* Summary */}
          <div className="rounded-lg border p-4">
            <p className={FIELD_LABEL}>Common Name</p>
            <p className="mt-1 text-sm font-semibold">
              {decoded.subject['CN']?.[0] ?? decoded.subjectString}
            </p>
          </div>

          {/* Subject */}
          <div className="space-y-3">
            <SectionHeader title="Subject" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DN_FIELDS.filter((f) => decoded.subject[f]).map((f) => (
                <Field key={f} label={DN_LABELS[f] ?? f}>
                  {decoded.subject[f].join(', ')}
                </Field>
              ))}
              {Object.keys(decoded.subject).length === 0 && (
                <span className="text-sm text-muted-foreground col-span-2">—</span>
              )}
            </div>
          </div>

          {/* Key & Algo */}
          <div className="space-y-3">
            <SectionHeader title="Key &amp; Algorithm" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Public Key">{decoded.publicKeyInfo}</Field>
              <Field label="Signature Algorithm">{decoded.signatureAlgorithm}</Field>
            </div>
          </div>

          {/* SANs */}
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

          {/* Key Usages */}
          {(decoded.keyUsages.length > 0 || decoded.extendedKeyUsages.length > 0) && (
            <div className="space-y-3">
              <SectionHeader title="Key Usage" />
              <div className="space-y-3">
                {decoded.keyUsages.length > 0 && (
                  <div>
                    <p className={`${FIELD_LABEL} mb-1`}>Key Usage</p>
                    <TagList items={decoded.keyUsages} />
                  </div>
                )}
                {decoded.extendedKeyUsages.length > 0 && (
                  <div>
                    <p className={`${FIELD_LABEL} mb-1`}>Extended Key Usage</p>
                    <TagList items={decoded.extendedKeyUsages} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
