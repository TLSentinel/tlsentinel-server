import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronLeft, ChevronRight, Search, FolderOpen, ChevronDown, Check } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  listCertificates,
  createCertificate,
  deleteCertificate,
} from '@/api/certificates'
import { isAdmin } from '@/api/client'
import type { CertificateListItem } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDate, plural } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CertStatus = 'expired' | 'critical' | 'warning' | 'ok'
type StatusFilter = '' | CertStatus
type SortOption = '' | 'expiry_asc' | 'expiry_desc' | 'common_name'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '',         label: 'All' },
  { value: 'expired',  label: 'Expired' },
  { value: 'critical', label: 'Critical (≤7d)' },
  { value: 'warning',  label: 'Warning (≤30d)' },
  { value: 'ok',       label: 'OK' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: '',            label: 'Newest first' },
  { value: 'expiry_asc',  label: 'Expiring soonest' },
  { value: 'expiry_desc', label: 'Expiring latest' },
  { value: 'common_name', label: 'Common name A→Z' },
]

const STATUS_META: Record<CertStatus, { label: string; className: string }> = {
  expired:  { label: 'Expired',  className: 'bg-red-50    text-red-700    border border-red-500' },
  critical: { label: 'Critical', className: 'bg-orange-50 text-orange-700 border border-orange-500' },
  warning:  { label: 'Warning',  className: 'bg-amber-50  text-amber-700  border border-amber-500' },
  ok:       { label: 'OK',       className: 'bg-green-50  text-green-700  border border-green-500' },
}

function StatusBadge({ notAfter }: { notAfter: string }) {
  const [now] = useState(Date.now)
  const days = Math.floor((new Date(notAfter).getTime() - now) / 86_400_000)
  const status: CertStatus =
    days < 0 ? 'expired' : days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'ok'
  const { label, className } = STATUS_META[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Ingest Dialog
// ---------------------------------------------------------------------------

interface IngestDialogProps {
  open: boolean
  onClose: () => void
  onIngested: (fingerprint: string) => void
}

function IngestDialog({ open, onClose, onIngested }: IngestDialogProps) {
  const [pem, setPem] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPem('')
    setFileName(null)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPem((ev.target?.result as string) ?? '')
      setError(null)
    }
    reader.onerror = () => setError('Failed to read file.')
    reader.readAsText(file)
    // reset so the same file can be re-selected if needed
    e.target.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = pem.trim()
    if (!trimmed) {
      setError('Paste a PEM / Base64 DER certificate, or browse for a file.')
      return
    }

    setLoading(true)
    setError(null)

    const body = trimmed.startsWith('-----')
      ? { certificatePem: trimmed }
      : { certificateDerBase64: trimmed }

    try {
      const created = await createCertificate(body)
      reset()
      onClose()
      onIngested(created.fingerprint)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to ingest certificate.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ingest Certificate</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cert-pem">PEM or Base64 DER</Label>
            <textarea
              id="cert-pem"
              className="min-h-[200px] w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
              value={pem}
              onChange={(e) => { setPem(e.target.value); setFileName(null) }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pem,.crt,.cer,.cert,.der"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {fileName ?? 'Browse file…'}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Ingesting…' : 'Ingest'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  cert: CertificateListItem | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ cert, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!cert) return
    setLoading(true)
    setError(null)
    try {
      await deleteCertificate(cert.fingerprint)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete certificate.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={cert !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Certificate</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">{cert?.commonName || cert?.fingerprint}</span>?
          This action cannot be undone.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function CertificatesPage() {
  const admin = isAdmin()
  const navigate = useNavigate()
  const [certs, setCerts] = useState<CertificateListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [sortOption, setSortOption] = useState<SortOption>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<CertificateListItem | null>(null)
  const [ingestOpen, setIngestOpen] = useState(false)

  // Debounce search — reset to page 1 when query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listCertificates(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption)
      setCerts(result.items ?? [])
      setTotalCount(result.totalCount)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load certificates.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, sortOption])

  useEffect(() => {
    load()
  }, [load])

  function handleStatusChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleSortChange(value: SortOption) {
    setSortOption(value)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const activeStatusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label ?? 'All'
  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sortOption)?.label ?? 'Newest first'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Certificates</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCount} {plural(totalCount, 'certificate')} stored
          </p>
        </div>
        {admin && (
          <Button onClick={() => setIngestOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Ingest
          </Button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search common name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              Status
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUS_OPTIONS.map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => handleStatusChange(value)}
                className="gap-2"
              >
                <Check className={`h-4 w-4 ${statusFilter === value ? 'opacity-100' : 'opacity-0'}`} />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              Sort
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SORT_OPTIONS.map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => handleSortChange(value)}
                className="gap-2"
              >
                <Check className={`h-4 w-4 ${sortOption === value ? 'opacity-100' : 'opacity-0'}`} />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active filter context line */}
      <p className="text-sm text-muted-foreground">
        Showing results for{' '}
        <span className="font-semibold text-foreground">{activeStatusLabel.toLowerCase()}</span>
        {debouncedSearch && (
          <> matching <span className="font-semibold text-foreground">"{debouncedSearch}"</span></>
        )}
        {' · '}sorted by{' '}
        <span className="font-semibold text-foreground">{activeSortLabel.toLowerCase()}</span>
      </p>

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Common Name</TableHead>
              <TableHead>SANs</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!loading && certs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  {debouncedSearch || statusFilter
                    ? <span className="text-sm text-muted-foreground">No certificates match your filters.</span>
                    : <StrixEmpty message="No certificates yet." />}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              certs.map((cert) => (
                <TableRow
                  key={cert.fingerprint}
                  className="cursor-pointer"
                  onClick={() => navigate(`/certificates/${cert.fingerprint}`)}
                >
                  <TableCell className="font-medium">{cert.commonName || '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {cert.sans.length === 0
                      ? '—'
                      : cert.sans.slice(0, 3).join(', ') +
                        (cert.sans.length > 3 ? ` +${cert.sans.length - 3}` : '')}
                  </TableCell>
                  <TableCell>
                    <StatusBadge notAfter={cert.notAfter} />
                  </TableCell>
                  <TableCell>{fmtDate(cert.notBefore)}</TableCell>
                  <TableCell>{fmtDate(cert.notAfter)}</TableCell>
                  <TableCell>
                    {admin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(cert)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {totalCount === 0 ? 'No results' : `Page ${page} of ${totalPages} · ${totalCount} total`}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <IngestDialog
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onIngested={(fp) => navigate(`/certificates/${fp}`)}
      />
      <DeleteDialog
        cert={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={load}
      />
    </div>
  )
}
