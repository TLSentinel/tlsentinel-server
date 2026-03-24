import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, CheckCircle2,
  AlertTriangle, XCircle, ShieldCheck, ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  X509Certificate,
  X509ChainBuilder,
  SubjectAlternativeNameExtension,
  BasicConstraintsExtension,
  KeyUsagesExtension,
  KeyUsageFlags,
} from '@peculiar/x509'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePems(raw: string): X509Certificate[] {
  const re = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
  const matches = raw.match(re) ?? []
  return matches.map((pem) => new X509Certificate(pem))
}

function formatDate(d: Date) {
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })
}

function isExpired(cert: X509Certificate) {
  const now = new Date()
  return now < cert.notBefore || now > cert.notAfter
}

function isSelfSigned(cert: X509Certificate) {
  return cert.issuer === cert.subject
}

function sanList(cert: X509Certificate): string[] {
  const ext = cert.getExtension(SubjectAlternativeNameExtension)
  if (!ext) return []
  return ext.names.items.map((n) => {
    const j = n.toJSON()
    return `${j.type}:${j.value}`
  })
}

function keyUsageList(cert: X509Certificate): string[] {
  const ext = cert.getExtension(KeyUsagesExtension)
  if (!ext) return []
  const flags: string[] = []
  const map: [number, string][] = [
    [KeyUsageFlags.digitalSignature, 'Digital Signature'],
    [KeyUsageFlags.nonRepudiation,   'Non Repudiation'],
    [KeyUsageFlags.keyEncipherment,  'Key Encipherment'],
    [KeyUsageFlags.dataEncipherment, 'Data Encipherment'],
    [KeyUsageFlags.keyAgreement,     'Key Agreement'],
    [KeyUsageFlags.keyCertSign,      'Cert Sign'],
    [KeyUsageFlags.cRLSign,          'CRL Sign'],
  ]
  for (const [flag, label] of map) {
    if (ext.usages & flag) flags.push(label)
  }
  return flags
}

function isCA(cert: X509Certificate): boolean {
  const bc = cert.getExtension(BasicConstraintsExtension)
  return bc?.ca ?? false
}

// ---------------------------------------------------------------------------
// Chain validation
// ---------------------------------------------------------------------------

interface ChainResult {
  chain: X509Certificate[]          // ordered leaf → root
  valid: boolean
  incomplete: boolean
  errors: string[]
}

async function buildChain(certs: X509Certificate[]): Promise<ChainResult> {
  const errors: string[] = []

  // Identify leaf: not a CA, or the CA with the shortest path if all are CAs
  const leaves = certs.filter((c) => !isCA(c))
  const leaf = leaves.length > 0 ? leaves[0] : certs[0]

  const builder = new X509ChainBuilder({ certificates: certs })
  let chain: X509Certificate[] = []

  try {
    const built = await builder.build(leaf)
    chain = Array.from(built)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Chain build failed.')
    return { chain: certs, valid: false, incomplete: true, errors }
  }

  // Check for expiry in chain
  for (const cert of chain) {
    if (isExpired(cert)) {
      const cn = cert.subjectName.getField('CN')?.[0] ?? cert.subject
      errors.push(`"${cn}" is expired or not yet valid.`)
    }
  }

  // Check CA flag on non-leaf certs
  for (let i = 1; i < chain.length; i++) {
    if (!isCA(chain[i])) {
      const cn = chain[i].subjectName.getField('CN')?.[0] ?? chain[i].subject
      errors.push(`"${cn}" is missing the CA basic constraint.`)
    }
  }

  const root = chain[chain.length - 1]
  const incomplete = chain.length > 0 && !isSelfSigned(root)
  if (incomplete) errors.push('Chain is incomplete — root certificate not found.')

  return { chain, valid: errors.length === 0, incomplete, errors }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({ children, variant }: { children: React.ReactNode; variant: 'green' | 'amber' | 'red' | 'muted' }) {
  const cls = {
    green: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    red:   'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    muted: 'bg-muted text-muted-foreground border-border',
  }[variant]
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-xs break-all">{value}</span>
    </div>
  )
}

function CertCard({ cert, position, index }: { cert: X509Certificate; position: string; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const expired = isExpired(cert)
  const selfSigned = isSelfSigned(cert)
  const ca = isCA(cert)
  const cn = cert.subjectName.getField('CN')?.[0] ?? cert.subject

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{cn}</span>
            <Badge variant="muted">{position}</Badge>
            {expired && <Badge variant="red">Expired</Badge>}
            {selfSigned && !ca && <Badge variant="amber">Self-Signed</Badge>}
            {selfSigned && ca && <Badge variant="green">Root CA</Badge>}
            {ca && !selfSigned && <Badge variant="muted">Intermediate CA</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{cert.issuer}</p>
        </div>
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-2">
          <Field label="Subject"   value={cert.subject} />
          <Field label="Issuer"    value={cert.issuer} />
          <Field label="Not Before" value={formatDate(cert.notBefore)} />
          <Field label="Not After"  value={formatDate(cert.notAfter)} />
          <Field label="Serial"    value={cert.serialNumber} />
          <Field label="Algorithm" value={cert.signatureAlgorithm.name} />
          <Field label="Key"       value={`${cert.publicKey.algorithm.name} ${JSON.stringify((cert.publicKey.algorithm as unknown as Record<string,unknown>).namedCurve ?? (cert.publicKey.algorithm as unknown as Record<string,unknown>).modulusLength ?? '')}`} />
          {keyUsageList(cert).length > 0 && (
            <Field label="Key Usage" value={keyUsageList(cert).join(', ')} />
          )}
          {sanList(cert).length > 0 && (
            <Field label="SANs" value={sanList(cert).join(', ')} />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CertChainPage() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ChainResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleBuild = useCallback(async () => {
    setParseError(null)
    setResult(null)
    const certs = parsePems(input)
    if (certs.length === 0) {
      setParseError('No valid PEM certificates found. Paste one or more -----BEGIN CERTIFICATE----- blocks.')
      return
    }
    setLoading(true)
    try {
      setResult(await buildChain(certs))
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Unexpected error.')
    } finally {
      setLoading(false)
    }
  }, [input])

  const positionLabel = (i: number, total: number) => {
    if (i === 0) return 'Leaf'
    if (i === total - 1) return 'Root'
    return `Intermediate ${i}`
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/toolbox" className="hover:text-foreground">Toolbox</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Chain Builder / Validator</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Chain Builder / Validator</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Paste a certificate bundle — leaf, intermediates, and optionally the root — to verify the full chain of trust.
        </p>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <Textarea
          placeholder="-----BEGIN CERTIFICATE-----&#10;...leaf cert...&#10;-----END CERTIFICATE-----&#10;-----BEGIN CERTIFICATE-----&#10;...intermediate...&#10;-----END CERTIFICATE-----"
          value={input}
          onChange={(e) => { setInput(e.target.value); setResult(null); setParseError(null) }}
          className="font-mono text-xs min-h-44 resize-y"
        />
        <div className="flex items-center gap-3">
          <Button onClick={handleBuild} disabled={!input.trim() || loading}>
            {loading ? 'Building…' : 'Build Chain'}
          </Button>
          {input && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setInput(''); setResult(null); setParseError(null) }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Status banner */}
          {result.valid ? (
            <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Chain is valid — {result.chain.length} certificate{result.chain.length !== 1 ? 's' : ''}, trusted to root.</span>
            </div>
          ) : result.incomplete ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            </div>
          )}

          {/* Chain viz */}
          <div className="space-y-1">
            {result.chain.map((cert, i) => (
              <div key={i} className="flex gap-2">
                {/* Connector line */}
                <div className="flex flex-col items-center w-5 shrink-0">
                  <div className={`mt-3.5 h-2.5 w-2.5 rounded-full border-2 shrink-0 ${isExpired(cert) ? 'border-red-500 bg-red-500/20' : 'border-green-500 bg-green-500/20'}`} />
                  {i < result.chain.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                </div>
                <div className="flex-1 pb-1">
                  <CertCard
                    cert={cert}
                    position={positionLabel(i, result.chain.length)}
                    index={i}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Unused certs (pasted but not in chain) */}
          {(() => {
            const chainPems = new Set(result.chain.map((c) => c.toString()))
            const unused = parsePems(input).filter((c) => !chainPems.has(c.toString()))
            if (!unused.length) return null
            return (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{unused.length} pasted certificate{unused.length !== 1 ? 's were' : ' was'} not used in the chain.</span>
                </div>
              </div>
            )
          })()}

          {/* Chain is valid with root */}
          {result.valid && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span>All signatures verified · Chain terminates at a self-signed root.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
