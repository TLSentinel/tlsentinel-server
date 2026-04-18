import { useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Copy, Check, Download, Upload, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PemConverter } from '@peculiar/x509'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
    .toUpperCase()
}

function hexDump(buf: ArrayBuffer, maxBytes = 256): { lines: string[]; truncated: boolean } {
  const bytes = new Uint8Array(buf)
  const truncated = bytes.length > maxBytes
  const slice = truncated ? bytes.slice(0, maxBytes) : bytes
  const lines: string[] = []
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.slice(i, i + 16)
    const offset = i.toString(16).padStart(8, '0').toUpperCase()
    const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ').padEnd(47)
    const ascii = Array.from(chunk).map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${offset}  ${hex}  ${ascii}`)
  }
  return { lines, truncated }
}

function parseHexInput(raw: string): Uint8Array {
  // Accept: space/colon/no separator hex strings
  const cleaned = raw.trim().replace(/[\s:]/g, '')
  if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
    throw new Error('Invalid hex — expected pairs of hex digits, optionally separated by spaces or colons.')
  }
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function download(filename: string, data: BlobPart, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------------------
// PEM tags
// ---------------------------------------------------------------------------

const PEM_TAGS = [
  'CERTIFICATE',
  'CERTIFICATE REQUEST',
  'PRIVATE KEY',
  'EC PRIVATE KEY',
  'RSA PRIVATE KEY',
  'PUBLIC KEY',
  'X509 CRL',
]

// ---------------------------------------------------------------------------
// PEM → DER
// ---------------------------------------------------------------------------

interface PemToDerResult {
  tag: string
  der: ArrayBuffer
  hexFull: string
  dump: { lines: string[]; truncated: boolean }
}

function convertPemToDer(pem: string): PemToDerResult {
  const structs = PemConverter.decodeWithHeaders(pem.trim())
  if (!structs.length) throw new Error('No PEM blocks found.')
  const { type, rawData } = structs[0]
  const der = rawData as ArrayBuffer
  return {
    tag: type,
    der,
    hexFull: bufToHex(der),
    dump: hexDump(der),
  }
}

// ---------------------------------------------------------------------------
// DER → PEM (from hex or file)
// ---------------------------------------------------------------------------

function convertDerToPem(derBytes: ArrayBuffer, tag: string): string {
  return PemConverter.encode(derBytes, tag)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PEM → DER panel
// ---------------------------------------------------------------------------

function PemToDerPanel() {
  const [pem, setPem] = useState('')
  const [result, setResult] = useState<PemToDerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleConvert = useCallback(() => {
    setError(null)
    setResult(null)
    try {
      setResult(convertPemToDer(pem))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed.')
    }
  }, [pem])

  const handleClear = useCallback(() => { setPem(''); setResult(null); setError(null) }, [])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
          value={pem}
          onChange={(e) => { setPem(e.target.value); setResult(null); setError(null) }}
          className="font-mono text-xs min-h-[140px] resize-y"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <Button onClick={handleConvert} disabled={!pem.trim()}>Convert</Button>
          {pem && <Button variant="ghost" onClick={handleClear}>Clear</Button>}
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}

      {result && (
        <div className="space-y-3">
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">DER output</p>
              <p className="text-sm font-medium">{result.tag} · {result.der.byteLength.toLocaleString()} bytes</p>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton value={result.hexFull} />
              <Button className="gap-1.5"
                onClick={() => download(`${result.tag.toLowerCase().replace(/\s+/g, '_')}.der`, result.der, 'application/octet-stream')}>
                <Download className="h-4 w-4" />
                Download .der
              </Button>
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 overflow-x-auto">
            <pre className="text-[11px] font-mono leading-5">
              {result.dump.lines.join('\n')}
              {result.dump.truncated && `\n…  (showing first 256 of ${result.der.byteLength} bytes)`}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DER → PEM panel
// ---------------------------------------------------------------------------

function DerToPemPanel() {
  const [hex, setHex] = useState('')
  const [tag, setTag] = useState('CERTIFICATE')
  const [pem, setPem] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const convert = useCallback((derBytes: ArrayBuffer, currentTag: string) => {
    setError(null)
    try {
      setPem(convertDerToPem(derBytes, currentTag))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed.')
      setPem('')
    }
  }, [])

  const handleHexConvert = useCallback(() => {
    setError(null)
    setPem('')
    try {
      const bytes = parseHexInput(hex)
      convert(bytes.buffer as ArrayBuffer, tag)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed.')
    }
  }, [hex, tag, convert])

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    setHex('')
    setPem('')
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer
      if (buf) convert(buf, tag)
    }
    reader.readAsArrayBuffer(file)
  }, [tag, convert])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleTagChange = useCallback((newTag: string) => {
    setTag(newTag)
    // Re-run conversion if we already have output
    if (pem) {
      try {
        const derBytes = parseHexInput(hex).buffer as ArrayBuffer
        convert(derBytes, newTag)
      } catch { /* hex might be empty if file was used — ignore */ }
    }
  }, [pem, hex, convert])

  const handleClear = useCallback(() => {
    setHex(''); setPem(''); setError(null); setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  return (
    <div className="space-y-4">
      {/* File drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border hover:border-foreground/30 p-6 text-center cursor-pointer transition-colors"
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {fileName ? <span className="text-foreground font-medium">{fileName}</span> : 'Drop a .der / .cer / .crt file or click to browse'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".der,.cer,.crt,.key,.p8"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        <span>or paste hex</span>
        <Separator className="flex-1" />
      </div>

      {/* Hex input */}
      <Textarea
        placeholder="30 82 03 4a 30 82 02 32 …"
        value={hex}
        onChange={(e) => { setHex(e.target.value); setPem(''); setError(null); setFileName(null) }}
        className="font-mono text-xs min-h-[100px] resize-y"
        spellCheck={false}
      />

      {/* PEM type + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">PEM type</span>
          <Select value={tag} onValueChange={handleTagChange}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PEM_TAGS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hex && <Button onClick={handleHexConvert} disabled={!hex.trim()}>Convert</Button>}
        {(hex || fileName || pem) && <Button variant="ghost" onClick={handleClear}>Clear</Button>}
      </div>

      {error && <ErrorMsg msg={error} />}

      {pem && (
        <div className="space-y-2">
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">PEM output</p>
            <div className="flex items-center gap-2">
              <CopyButton value={pem} />
              <Button className="gap-1.5"
                onClick={() => download(`${tag.toLowerCase().replace(/\s+/g, '_')}.pem`, pem, 'text/plain')}>
                <Download className="h-4 w-4" />
                Download .pem
              </Button>
            </div>
          </div>
          <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
            {pem}
          </pre>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Direction = 'pem-to-der' | 'der-to-pem'

export default function PemDerPage() {
  const [direction, setDirection] = useState<Direction>('pem-to-der')

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/toolbox" className="hover:text-foreground">Toolbox</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">PEM / DER Converter</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">PEM / DER Converter</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Convert certificates and keys between PEM and DER encoding. Runs entirely in your browser.
        </p>
      </div>

      {/* Direction toggle */}
      <div className="flex items-center rounded-md border overflow-hidden w-fit">
        {([['pem-to-der', 'PEM → DER'], ['der-to-pem', 'DER → PEM']] as [Direction, string][]).map(([d, label]) => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={[
              'px-4 py-1.5 text-sm font-medium transition-colors',
              direction === d ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {direction === 'pem-to-der' ? <PemToDerPanel /> : <DerToPemPanel />}
    </div>
  )
}
