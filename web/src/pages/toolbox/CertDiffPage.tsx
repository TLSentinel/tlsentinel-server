import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, AlertCircle, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  decodeCert,
  fmtDate,
  DN_FIELDS,
  DN_LABELS,
  type DecodedCert,
} from '@/lib/cert-utils'
import { plural } from '@/lib/utils'

const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

// ---------------------------------------------------------------------------
// Diff row primitives
// ---------------------------------------------------------------------------

type RowStatus = 'match' | 'diff' | 'only-a' | 'only-b'

function rowBg(status: RowStatus, side: 'a' | 'b') {
  if (status === 'match') return ''
  if (status === 'diff') return 'bg-amber-500/10'
  if (status === 'only-a') return side === 'a' ? 'bg-amber-500/10' : 'bg-muted/40'
  if (status === 'only-b') return side === 'b' ? 'bg-amber-500/10' : 'bg-muted/40'
  return ''
}

function DiffRow({
  label,
  a,
  b,
}: {
  label: string
  a: string | undefined
  b: string | undefined
}) {
  const aVal = a ?? ''
  const bVal = b ?? ''
  let status: RowStatus = 'match'
  if (!aVal && bVal) status = 'only-b'
  else if (aVal && !bVal) status = 'only-a'
  else if (aVal !== bVal) status = 'diff'

  const empty = <span className="text-muted-foreground/50 italic text-xs">—</span>

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-border">
      <div className={`px-3 py-2.5 ${rowBg(status, 'a')}`}>
        <p className={`${FIELD_LABEL} mb-1`}>{label}</p>
        {aVal ? <p className="text-xs font-medium break-all">{aVal}</p> : empty}
      </div>
      <div className={`px-3 py-2.5 ${rowBg(status, 'b')}`}>
        <p className={`${FIELD_LABEL} mb-1`}>{label}</p>
        {bVal ? <p className="text-xs font-medium break-all">{bVal}</p> : empty}
      </div>
    </div>
  )
}

function SansDiffRow({ a, b }: { a: DecodedCert['sans']; b: DecodedCert['sans'] }) {
  const aSet = new Set(a.map((s) => s.value))
  const bSet = new Set(b.map((s) => s.value))
  const allValues = [...new Set([...aSet, ...bSet])].sort()

  if (allValues.length === 0) return null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-border">
      <div className="px-3 py-2.5">
        <p className={`${FIELD_LABEL} mb-1.5`}>Subject Alternative Names</p>
        <div className="flex flex-wrap gap-1">
          {allValues.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className={`font-mono text-[10px] ${!bSet.has(v) ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : ''}`}
            >
              {v}
            </Badge>
          ))}
        </div>
      </div>
      <div className="px-3 py-2.5">
        <p className={`${FIELD_LABEL} mb-1.5`}>Subject Alternative Names</p>
        <div className="flex flex-wrap gap-1">
          {allValues.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className={`font-mono text-[10px] ${!aSet.has(v) ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : ''}`}
            >
              {v}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header (spans full width)
// ---------------------------------------------------------------------------

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="col-span-2 px-3 py-2 bg-muted/30 border-y border-border">
      <p className={FIELD_LABEL}>{title}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff table
// ---------------------------------------------------------------------------

function DiffTable({ a, b }: { a: DecodedCert; b: DecodedCert }) {
  // DN helper: collapse to single string per field
  function dnVal(fields: Record<string, string[]>, key: string) {
    return fields[key]?.join(', ') ?? ''
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden divide-y divide-border text-sm">
      {/* Column headers */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-border bg-muted/20">
        <div className={`px-3 py-2 ${FIELD_LABEL}`}>Certificate A</div>
        <div className={`px-3 py-2 ${FIELD_LABEL}`}>Certificate B</div>
      </div>

      {/* Subject */}
      <SectionDivider title="Subject" />
      {DN_FIELDS.map((f) => {
        const av = dnVal(a.subject, f)
        const bv = dnVal(b.subject, f)
        if (!av && !bv) return null
        return <DiffRow key={`subj-${f}`} label={DN_LABELS[f] ?? f} a={av || undefined} b={bv || undefined} />
      })}

      {/* Issuer */}
      <SectionDivider title="Issuer" />
      {DN_FIELDS.map((f) => {
        const av = dnVal(a.issuer, f)
        const bv = dnVal(b.issuer, f)
        if (!av && !bv) return null
        return <DiffRow key={`iss-${f}`} label={DN_LABELS[f] ?? f} a={av || undefined} b={bv || undefined} />
      })}

      {/* Validity */}
      <SectionDivider title="Validity" />
      <DiffRow label="Not Before" a={fmtDate(a.notBefore)} b={fmtDate(b.notBefore)} />
      <DiffRow label="Not After" a={fmtDate(a.notAfter)} b={fmtDate(b.notAfter)} />

      {/* Details */}
      <SectionDivider title="Certificate Details" />
      <DiffRow label="Serial Number" a={a.serialNumber} b={b.serialNumber} />
      <DiffRow label="Signature Algorithm" a={a.signatureAlgorithm} b={b.signatureAlgorithm} />
      <DiffRow label="Public Key" a={a.publicKeyInfo} b={b.publicKeyInfo} />

      {/* Fingerprints */}
      <SectionDivider title="Fingerprints" />
      <DiffRow label="SHA-256" a={a.sha256} b={b.sha256} />
      <DiffRow label="SHA-1" a={a.sha1} b={b.sha1} />

      {/* SANs */}
      <SectionDivider title="Subject Alternative Names" />
      <SansDiffRow a={a.sans} b={b.sans} />

      {/* Key Usage */}
      <SectionDivider title="Key Usage" />
      <DiffRow label="Key Usage" a={a.keyUsages.join(', ') || undefined} b={b.keyUsages.join(', ') || undefined} />
      <DiffRow label="Extended Key Usage" a={a.extendedKeyUsages.join(', ') || undefined} b={b.extendedKeyUsages.join(', ') || undefined} />

      {/* Extensions */}
      <SectionDivider title="Extensions" />
      <DiffRow
        label="Basic Constraints"
        a={a.isCA ? `CA: true${a.pathLength !== undefined ? `, Path: ${a.pathLength}` : ''}` : 'CA: false'}
        b={b.isCA ? `CA: true${b.pathLength !== undefined ? `, Path: ${b.pathLength}` : ''}` : 'CA: false'}
      />
      {(a.subjectKeyId || b.subjectKeyId) && (
        <DiffRow label="Subject Key Identifier" a={a.subjectKeyId} b={b.subjectKeyId} />
      )}
      {(a.authorityKeyId || b.authorityKeyId) && (
        <DiffRow label="Authority Key Identifier" a={a.authorityKeyId} b={b.authorityKeyId} />
      )}

      {/* AIA */}
      {(a.ocspUrls.length || b.ocspUrls.length) && (
        <>
          <SectionDivider title="Authority Info Access" />
          <DiffRow label="OCSP" a={a.ocspUrls.join('\n') || undefined} b={b.ocspUrls.join('\n') || undefined} />
          <DiffRow label="CA Issuers" a={a.caIssuerUrls.join('\n') || undefined} b={b.caIssuerUrls.join('\n') || undefined} />
        </>
      )}

      {/* CRL */}
      {(a.crlUrls.length || b.crlUrls.length) && (
        <>
          <SectionDivider title="CRL Distribution Points" />
          <DiffRow label="CRL URLs" a={a.crlUrls.join('\n') || undefined} b={b.crlUrls.join('\n') || undefined} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function diffCount(a: DecodedCert, b: DecodedCert): number {
  let count = 0
  const check = (av: string | undefined, bv: string | undefined) => { if ((av ?? '') !== (bv ?? '')) count++ }

  DN_FIELDS.forEach((f) => {
    check(a.subject[f]?.join(', '), b.subject[f]?.join(', '))
    check(a.issuer[f]?.join(', '), b.issuer[f]?.join(', '))
  })
  check(a.notBefore.toISOString(), b.notBefore.toISOString())
  check(a.notAfter.toISOString(), b.notAfter.toISOString())
  check(a.serialNumber, b.serialNumber)
  check(a.signatureAlgorithm, b.signatureAlgorithm)
  check(a.publicKeyInfo, b.publicKeyInfo)
  check(a.sha256, b.sha256)
  check(a.keyUsages.join(','), b.keyUsages.join(','))
  check(a.extendedKeyUsages.join(','), b.extendedKeyUsages.join(','))

  const aSet = new Set(a.sans.map((s) => s.value))
  const bSet = new Set(b.sans.map((s) => s.value))
  if ([...aSet].some((v) => !bSet.has(v)) || [...bSet].some((v) => !aSet.has(v))) count++

  return count
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CertDiffPage() {
  const [pemA, setPemA] = useState('')
  const [pemB, setPemB] = useState('')
  const [certA, setCertA] = useState<DecodedCert | null>(null)
  const [certB, setCertB] = useState<DecodedCert | null>(null)
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCompare = useCallback(async () => {
    setCertA(null)
    setCertB(null)
    setErrorA(null)
    setErrorB(null)
    setLoading(true)

    const [resA, resB] = await Promise.allSettled([
      decodeCert(pemA),
      decodeCert(pemB),
    ])

    if (resA.status === 'fulfilled') setCertA(resA.value)
    else setErrorA(resA.reason instanceof Error ? resA.reason.message : 'Failed to parse Certificate A')

    if (resB.status === 'fulfilled') setCertB(resB.value)
    else setErrorB(resB.reason instanceof Error ? resB.reason.message : 'Failed to parse Certificate B')

    setLoading(false)
  }, [pemA, pemB])

  const handleClear = useCallback(() => {
    setPemA('')
    setPemB('')
    setCertA(null)
    setCertB(null)
    setErrorA(null)
    setErrorB(null)
  }, [])

  const canCompare = pemA.trim().length > 0 && pemB.trim().length > 0
  const differences = certA && certB ? diffCount(certA, certB) : null

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Link to="/toolbox" className="hover:text-foreground">Toolbox</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Certificate Diff</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Certificate Diff</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Compare two PEM certificates side by side. Differences are highlighted. Runs entirely in your browser.
        </p>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className={FIELD_LABEL}>Certificate A</p>
          <Textarea
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={pemA}
            onChange={(e) => { setPemA(e.target.value); setCertA(null); setErrorA(null) }}
            className="font-mono text-xs min-h-[140px] resize-y"
            spellCheck={false}
          />
          {errorA && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{errorA}</span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className={FIELD_LABEL}>Certificate B</p>
          <Textarea
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={pemB}
            onChange={(e) => { setPemB(e.target.value); setCertB(null); setErrorB(null) }}
            className="font-mono text-xs min-h-[140px] resize-y"
            spellCheck={false}
          />
          {errorB && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{errorB}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleCompare} disabled={!canCompare || loading} className="gap-2">
          <ArrowLeftRight className="h-4 w-4" />
          {loading ? 'Comparing…' : 'Compare'}
        </Button>
        {(pemA || pemB) && <Button variant="ghost" onClick={handleClear}>Clear</Button>}
      </div>

      {/* Results */}
      {certA && certB && (
        <div className="space-y-4">
          <Separator />

          {/* Summary */}
          <div className="flex items-center gap-3">
            {differences === 0 ? (
              <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-0">
                Identical
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-amber-600 dark:text-amber-400 bg-amber-500/10 border-0">
                {plural(differences ?? 0, 'difference')}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Highlighted cells indicate values that differ between the two certificates.
            </span>
          </div>

          <DiffTable a={certA} b={certB} />
        </div>
      )}
    </div>
  )
}
