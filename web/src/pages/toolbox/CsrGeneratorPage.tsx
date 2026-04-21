import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, X, Copy, Check, Download, AlertCircle, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Pkcs10CertificateRequestGenerator,
  SubjectAlternativeNameExtension,
  PemConverter,
} from '@peculiar/x509'

const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

// ---------------------------------------------------------------------------
// Key algorithm configs
// ---------------------------------------------------------------------------

type KeyAlgo = 'rsa-2048' | 'rsa-4096' | 'ec-p256' | 'ec-p384'

const KEY_ALGO_LABEL: Record<KeyAlgo, string> = {
  'rsa-2048': 'RSA 2048-bit',
  'rsa-4096': 'RSA 4096-bit',
  'ec-p256': 'ECDSA P-256',
  'ec-p384': 'ECDSA P-384',
}

function getAlgoParams(algo: KeyAlgo): { keyGen: RsaHashedKeyGenParams | EcKeyGenParams; signing: Algorithm | EcdsaParams } {
  switch (algo) {
    case 'rsa-2048':
      return {
        keyGen: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        signing: { name: 'RSASSA-PKCS1-v1_5' },
      }
    case 'rsa-4096':
      return {
        keyGen: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        signing: { name: 'RSASSA-PKCS1-v1_5' },
      }
    case 'ec-p256':
      return {
        keyGen: { name: 'ECDSA', namedCurve: 'P-256' },
        signing: { name: 'ECDSA', hash: 'SHA-256' },
      }
    case 'ec-p384':
      return {
        keyGen: { name: 'ECDSA', namedCurve: 'P-384' },
        signing: { name: 'ECDSA', hash: 'SHA-384' },
      }
  }
}

// ---------------------------------------------------------------------------
// SAN detection
// ---------------------------------------------------------------------------

function detectSANType(value: string): 'dns' | 'ip' | 'email' | 'url' {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return 'ip'
  if (/^[0-9a-f:]+$/i.test(value) && value.includes(':')) return 'ip'
  if (value.includes('@')) return 'email'
  if (/^https?:\/\//i.test(value)) return 'url'
  return 'dns'
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface GenerateResult {
  csrPem: string
  privateKeyPem: string
}

async function generateCSR(
  fields: { cn: string; o: string; ou: string; c: string; st: string; l: string; email: string },
  sans: string[],
  algo: KeyAlgo,
): Promise<GenerateResult> {
  const { keyGen, signing } = getAlgoParams(algo)

  // Generate keypair
  const keyPair = await crypto.subtle.generateKey(keyGen, true, ['sign', 'verify']) as CryptoKeyPair

  // Build subject string
  const parts: string[] = []
  if (fields.cn) parts.push(`CN=${fields.cn}`)
  if (fields.o) parts.push(`O=${fields.o}`)
  if (fields.ou) parts.push(`OU=${fields.ou}`)
  if (fields.l) parts.push(`L=${fields.l}`)
  if (fields.st) parts.push(`ST=${fields.st}`)
  if (fields.c) parts.push(`C=${fields.c}`)
  if (fields.email) parts.push(`E=${fields.email}`)
  const nameStr = parts.join(', ')

  // Build extensions
  const extensions: SubjectAlternativeNameExtension[] = []
  const sanEntries = sans.filter(Boolean)
  if (sanEntries.length > 0) {
    extensions.push(
      new SubjectAlternativeNameExtension(
        sanEntries.map((v) => ({ type: detectSANType(v), value: v })),
      ),
    )
  }

  // Create CSR
  const csr = await Pkcs10CertificateRequestGenerator.create({
    name: nameStr,
    keys: keyPair,
    signingAlgorithm: signing,
    extensions: extensions.length ? extensions : undefined,
  })

  // Export private key as PKCS#8 PEM
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  const privateKeyPem = PemConverter.encode(pkcs8, 'PRIVATE KEY')

  return {
    csrPem: csr.toString('pem'),
    privateKeyPem,
  }
}

// ---------------------------------------------------------------------------
// Copy + Download helpers
// ---------------------------------------------------------------------------

function useCopy(value: string) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])
  return { copied, copy }
}

function download(filename: string, content: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
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

function PemBlock({ label, value, filename }: { label: string; value: string; filename: string }) {
  const { copied, copy } = useCopy(value)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={FIELD_LABEL}>{label}</p>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={copy} className="h-7 gap-1.5 text-xs">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => download(filename, value)} className="h-7 gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>
      <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {value}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CsrGeneratorPage() {
  const [cn, setCn] = useState('')
  const [o, setO] = useState('')
  const [ou, setOu] = useState('')
  const [c, setC] = useState('')
  const [st, setSt] = useState('')
  const [l, setL] = useState('')
  const [email, setEmail] = useState('')
  const [sans, setSans] = useState<string[]>([''])
  const [algo, setAlgo] = useState<KeyAlgo>('ec-p256')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const addSan = () => setSans((s) => [...s, ''])
  const removeSan = (i: number) => setSans((s) => s.filter((_, idx) => idx !== i))
  const updateSan = (i: number, val: string) =>
    setSans((s) => s.map((v, idx) => (idx === i ? val : v)))

  const handleGenerate = useCallback(async () => {
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const res = await generateCSR({ cn, o, ou, c, st, l, email }, sans, algo)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }, [cn, o, ou, c, st, l, email, sans, algo])

  const handleReset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  const canGenerate = cn.trim().length > 0

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Link to="/toolbox" className="hover:text-foreground">Toolbox</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">CSR Generator</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">CSR Generator</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Generate a CSR and private key entirely in your browser. Your private key is never transmitted.
        </p>
      </div>

      {/* Private key warning */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Save your private key immediately after generation — it cannot be recovered once you leave this page.</span>
      </div>

      {/* Form */}
      <div className="space-y-6">
        <div className="space-y-3">
          <SectionHeader title="Subject" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cn" className={FIELD_LABEL}>Common Name <span className="text-destructive">*</span></Label>
              <Input id="cn" placeholder="example.com" value={cn} onChange={(e) => setCn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o" className={FIELD_LABEL}>Organization</Label>
              <Input id="o" placeholder="Acme Corp" value={o} onChange={(e) => setO(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ou" className={FIELD_LABEL}>Organizational Unit</Label>
              <Input id="ou" placeholder="Engineering" value={ou} onChange={(e) => setOu(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c" className={FIELD_LABEL}>Country</Label>
              <Input id="c" placeholder="US" maxLength={2} value={c} onChange={(e) => setC(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st" className={FIELD_LABEL}>State / Province</Label>
              <Input id="st" placeholder="California" value={st} onChange={(e) => setSt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l" className={FIELD_LABEL}>Locality</Label>
              <Input id="l" placeholder="San Francisco" value={l} onChange={(e) => setL(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email" className={FIELD_LABEL}>Email</Label>
              <Input id="email" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </div>

        {/* SANs */}
        <div className="space-y-3">
          <SectionHeader title="Subject Alternative Names" />
          <p className="text-xs text-muted-foreground -mt-1">
            DNS names, IP addresses, or email addresses. Type is detected automatically.
          </p>
          <div className="space-y-2">
            {sans.map((san, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="e.g. www.example.com or 192.168.1.1"
                  value={san}
                  onChange={(e) => updateSan(i, e.target.value)}
                  className="font-mono text-sm"
                />
                <button
                  onClick={() => removeSan(i)}
                  disabled={sans.length === 1}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                  title="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addSan} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add SAN
          </Button>
        </div>

        {/* Key Algorithm */}
        <div className="space-y-3">
          <SectionHeader title="Key Algorithm" />
          <div className="w-48">
            <Select value={algo} onValueChange={(v) => setAlgo(v as KeyAlgo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KEY_ALGO_LABEL) as KeyAlgo[]).map((k) => (
                  <SelectItem key={k} value={k}>{KEY_ALGO_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={!canGenerate || loading}>
            {loading ? 'Generating…' : 'Generate CSR'}
          </Button>
          {result && (
            <Button variant="ghost" onClick={handleReset}>Generate new</Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Output */}
      {result && (
        <div className="space-y-6">
          <Separator />
          <PemBlock
            label="Certificate Signing Request (CSR)"
            value={result.csrPem}
            filename="request.csr"
          />
          <PemBlock
            label="Private Key — keep this secret"
            value={result.privateKeyPem}
            filename="private.key"
          />
        </div>
      )}
    </div>
  )
}
