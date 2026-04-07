import { useState, useRef } from 'react'
import { Upload, Download, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { bulkImportEndpoints } from '@/api/endpoints'
import type { BulkImportRow, BulkImportRowResult } from '@/types/api'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

const SAMPLE_CSV = `name,type,dns_name,port,ip_address,url,notes
Production API,host,api.example.com,443,,,"Main production API gateway"
Staging API,host,staging-api.example.com,8443,,,
Okta IdP,saml,,,,"https://example.okta.com/app/metadata",
Internal CA,manual,,,,,"Manually tracked root cert"
`

const SAMPLE_FILENAME = 'endpoints-import-sample.csv'

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = SAMPLE_FILENAME
  a.click()
  URL.revokeObjectURL(url)
}

interface ParsedRow {
  rowNum: number
  raw: Record<string, string>
  data: BulkImportRow
  validationError: string | null
}

function parseCSV(text: string): ParsedRow[] {
  // Strip UTF-8 BOM if present
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []

  // Parse a single CSV line respecting quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'))

  return lines.slice(1).map((line, i) => {
    const values = parseLine(line)
    const raw: Record<string, string> = {}
    headers.forEach((h, j) => { raw[h] = values[j] ?? '' })

    const type = (raw['type'] || 'host').toLowerCase()
    const portRaw = raw['port'] ? parseInt(raw['port'], 10) : 0
    const port = Number.isNaN(portRaw) ? 0 : portRaw

    const data: BulkImportRow = {
      name: raw['name'] ?? '',
      type,
      dnsName:   raw['dns_name']   || undefined,
      port:      port || undefined,
      ipAddress: raw['ip_address'] || undefined,
      url:       raw['url']        || undefined,
      notes:     raw['notes']      || undefined,
    }

    let validationError: string | null = null
    if (!data.name) {
      validationError = 'name is required'
    } else if (!['host', 'saml', 'manual'].includes(type)) {
      validationError = `unknown type "${type}"`
    } else if (type === 'host' && !data.dnsName) {
      validationError = 'dns_name is required for host'
    } else if (type === 'saml' && !data.url) {
      validationError = 'url is required for saml'
    }

    return { rowNum: i + 2, raw, data, validationError }
  })
}

// ---------------------------------------------------------------------------
// Preview table
// ---------------------------------------------------------------------------

function PreviewTable({ rows }: { rows: ParsedRow[] }) {
  const validCount   = rows.filter((r) => !r.validationError).length
  const invalidCount = rows.filter((r) =>  r.validationError).length

  return (
    <div className="space-y-3">
      {/* Summary line */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{rows.length} row{rows.length !== 1 ? 's' : ''} parsed</span>
        {validCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-green-600 dark:text-green-400">{validCount} ready</span>
          </span>
        )}
        {invalidCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
            <span className="text-destructive">{invalidCount} invalid</span>
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-y-auto rounded-md border" style={{ maxHeight: '280px' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-center">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-16">Type</TableHead>
              <TableHead>Host / URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.rowNum}
                className={row.validationError ? 'bg-destructive/5 border-l-2 border-l-destructive' : ''}
              >
                <TableCell className="text-center text-xs text-muted-foreground">{row.rowNum}</TableCell>
                <TableCell>
                  <p className="text-sm font-medium">
                    {row.data.name || <span className="italic text-muted-foreground">—</span>}
                  </p>
                  {row.validationError && (
                    <p className="text-xs text-destructive mt-0.5">{row.validationError}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.data.type}</TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  <span className="truncate block max-w-[200px]">
                    {row.data.dnsName
                      ? `${row.data.dnsName}:${row.data.port ?? 443}`
                      : row.data.url ?? '—'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results summary
// ---------------------------------------------------------------------------

function ResultsSummary({ results, created, failed }: { results: BulkImportRowResult[]; created: number; failed: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        {created > 0 && (
          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {created} created
          </span>
        )}
        {failed > 0 && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <XCircle className="h-4 w-4" />
            {failed} failed
          </span>
        )}
      </div>
      {failed > 0 && (
        <ul className="space-y-0.5">
          {results.filter((r) => r.error).map((r) => (
            <li key={r.row} className="text-xs text-destructive">
              Row {r.row} ({r.name}): {r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

interface BulkImportDialogProps {
  open: boolean
  onClose: () => void
  onComplete: () => void
}

type Stage = 'upload' | 'preview' | 'results'

export default function BulkImportDialog({ open, onClose, onComplete }: BulkImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage]   = useState<Stage>('upload')
  const [rows, setRows]     = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [results, setResults] = useState<BulkImportRowResult[]>([])
  const [created, setCreated] = useState(0)
  const [failed, setFailed]   = useState(0)

  function reset() {
    setStage('upload')
    setRows([])
    setFileName(null)
    setParseError(null)
    setImporting(false)
    setImportError(null)
    setResults([])
    setCreated(0)
    setFailed(0)
  }

  function handleClose() {
    const didCreate = stage === 'results' && created > 0
    reset()
    onClose()
    if (didCreate) onComplete()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length === 0) {
        setParseError('No data rows found. Make sure the file has a header row and at least one data row.')
        return
      }
      setRows(parsed)
      setStage('preview')
    }
    reader.onerror = () => setParseError('Failed to read file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    const validRows = rows.filter((r) => !r.validationError)
    if (validRows.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const resp = await bulkImportEndpoints({ rows: validRows.map((r) => r.data) })
      setResults(resp.results)
      setCreated(resp.created)
      setFailed(resp.failed)
      setStage('results')
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const validCount   = rows.filter((r) => !r.validationError).length
  const invalidCount = rows.filter((r) =>  r.validationError).length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {stage === 'upload'  && 'Import Endpoints'}
            {stage === 'preview' && `Preview — ${rows.length} row${rows.length !== 1 ? 's' : ''}`}
            {stage === 'results' && 'Import Complete'}
          </DialogTitle>
        </DialogHeader>

        {/* Upload stage */}
        {stage === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with your endpoints. Download the sample to see the expected format.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadSample} className="gap-1.5">
                <Download className="h-4 w-4" />
                Download sample CSV
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
            >
              <Upload className="h-8 w-8" />
              <span>{fileName ?? 'Click to choose a CSV file'}</span>
            </button>
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          </div>
        )}

        {/* Preview stage */}
        {stage === 'preview' && <PreviewTable rows={rows} />}

        {/* Results stage */}
        {stage === 'results' && <ResultsSummary results={results} created={created} failed={failed} />}

        {importError && <p className="text-sm text-destructive">{importError}</p>}

        <DialogFooter>
          {stage === 'upload' && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {stage === 'preview' && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleImport} disabled={importing || validCount === 0 || invalidCount > 0}>
                {importing ? 'Importing…' : `Import ${validCount} endpoint${validCount !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
          {stage === 'results' && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
