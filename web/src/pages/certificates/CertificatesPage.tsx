import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, FolderOpen, MoreVertical, ExternalLink, Trash2, Shield, Clock, AlertTriangle, ShieldOff, ChevronLeft, ChevronRight } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import SearchInput from '@/components/SearchInput'
import FilterDropdown from '@/components/FilterDropdown'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  listCertificates,
  createCertificate,
  deleteCertificate,
} from '@/api/certificates'
import { can } from '@/api/client'
import type { CertificateListItem } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDate, plural } from '@/lib/utils'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Filter / sort options
// ---------------------------------------------------------------------------

type CertStatus   = 'expired' | 'critical' | 'warning' | 'ok'
type StatusFilter = '' | CertStatus
type SortOption   = '' | 'expiry_asc' | 'expiry_desc' | 'common_name'

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

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

type SignalColor = 'neutral' | 'green' | 'amber' | 'red'

const SIGNAL_BORDER: Record<SignalColor, string> = {
  neutral: 'border-l-foreground/20',
  green:   'border-l-green-500',
  amber:   'border-l-amber-500',
  red:     'border-l-red-500',
}

const SIGNAL_VALUE: Record<SignalColor, string> = {
  neutral: 'text-foreground',
  green:   'text-green-600',
  amber:   'text-amber-600',
  red:     'text-red-600',
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  signal?: SignalColor
  active?: boolean
  onClick?: () => void
}

function StatCard({ icon, label, value, signal = 'neutral', active, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border border-l-4 ${SIGNAL_BORDER[signal]} p-5 space-y-3 transition-colors ${onClick ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'} ${active ? 'bg-muted/40 ring-1 ring-inset ring-border' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className={`shrink-0 ${SIGNAL_VALUE[signal]}`}>{icon}</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-3xl font-bold tracking-tight ${SIGNAL_VALUE[signal]}`}>{value}</p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Expiration status pill
// ---------------------------------------------------------------------------

type ExpiryState = 'valid' | 'expiring' | 'expired'

function expiryState(notAfter: string): ExpiryState {
  const days = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return 'expired'
  if (days <= 30) return 'expiring'
  return 'valid'
}

const EXPIRY_LABEL: Record<ExpiryState, string> = {
  valid:    'Valid',
  expiring: 'Expiring Soon',
  expired:  'Expired',
}

const EXPIRY_DOT: Record<ExpiryState, string> = {
  valid:    'bg-green-500',
  expiring: 'bg-amber-500',
  expired:  'bg-red-500',
}

const EXPIRY_BG: Record<ExpiryState, string> = {
  valid:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expiring: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  expired:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

function ExpiryPill({ notAfter }: { notAfter: string }) {
  const state = expiryState(notAfter)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${EXPIRY_BG[state]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${EXPIRY_DOT[state]}`} />
      {EXPIRY_LABEL[state]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid-cols-[2.5rem_2fr_2.5fr_10rem_3rem]'

interface CertRowProps {
  cert: CertificateListItem
  admin: boolean
  selected: boolean
  onToggle: (fingerprint: string) => void
  onDelete: (cert: CertificateListItem) => void
}

function CertRow({ cert, admin, selected, onToggle, onDelete }: CertRowProps) {
  const navigate = useNavigate()
  const sansDisplay = cert.sans.length === 0
    ? '—'
    : cert.sans.slice(0, 3).join(', ') + (cert.sans.length > 3 ? ` +${cert.sans.length - 3}` : '')

  return (
    <div className={`grid ${ROW_GRID} items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0 hover:bg-muted/30`}>

      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(cert.fingerprint)}
          aria-label={`Select ${cert.commonName || cert.fingerprint}`}
          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
        />
      </div>

      {/* Common Name */}
      <div className="min-w-0">
        <Link
          to={`/certificates/${cert.fingerprint}`}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {cert.commonName || '—'}
        </Link>
      </div>

      {/* SANs */}
      <div className="min-w-0">
        <span className="block truncate text-sm text-muted-foreground" title={cert.sans.join(', ')}>
          {sansDisplay}
        </span>
      </div>

      {/* Expiration: date + status pill */}
      <div className="flex flex-col gap-1">
        <span className="text-sm whitespace-nowrap">{fmtDate(cert.notAfter)}</span>
        <ExpiryPill notAfter={cert.notAfter} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/certificates/${cert.fingerprint}`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              View Certificate
            </DropdownMenuItem>
            {admin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(cert)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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
      <DialogContent className="sm:max-w-2xl">
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
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function CertificatesPage() {
  const admin = can('certs:edit')
  const navigate = useNavigate()
  const [page, setPage]                       = useState(1)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]       = useState<StatusFilter>('')
  const [sortOption, setSortOption]           = useState<SortOption>('')
  const [deleteTarget, setDeleteTarget]       = useState<CertificateListItem | null>(null)
  const [ingestOpen, setIngestOpen]           = useState(false)
  const [selected, setSelected]               = useState<Set<string>>(new Set())

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['certificates', page, debouncedSearch, statusFilter, sortOption],
    queryFn: () => listCertificates(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption),
    placeholderData: keepPreviousData,
  })

  const { data: totalData }    = useQuery({ queryKey: ['certs-count', 'all'],      queryFn: () => listCertificates(1, 1, '', '', '') })
  const { data: expiredData }  = useQuery({ queryKey: ['certs-count', 'expired'],  queryFn: () => listCertificates(1, 1, '', 'expired',  '') })
  const { data: criticalData } = useQuery({ queryKey: ['certs-count', 'critical'], queryFn: () => listCertificates(1, 1, '', 'critical', '') })
  const { data: warningData }  = useQuery({ queryKey: ['certs-count', 'warning'],  queryFn: () => listCertificates(1, 1, '', 'warning',  '') })

  const totalAll     = totalData?.totalCount    ?? null
  const totalExpired = expiredData?.totalCount  ?? null
  const totalCrit    = criticalData?.totalCount ?? null
  const totalWarn    = warningData?.totalCount  ?? null

  const certs      = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, totalCount)

  function handleStatusChange(value: StatusFilter) { setStatusFilter(value); setPage(1) }
  function handleSortChange(value: SortOption)      { setSortOption(value);   setPage(1) }

  const pageFingerprints = useMemo(() => certs.map(c => c.fingerprint), [certs])
  const allPageSelected = pageFingerprints.length > 0 && pageFingerprints.every(fp => selected.has(fp))
  const somePageSelected = !allPageSelected && pageFingerprints.some(fp => selected.has(fp))

  function toggleOne(fp: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(fp)) next.delete(fp); else next.add(fp)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageFingerprints.forEach(fp => next.delete(fp))
      } else {
        pageFingerprints.forEach(fp => next.add(fp))
      }
      return next
    })
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Certificates</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Certificate store inventory.
          </p>
        </div>
        {admin && (
          <Button onClick={() => setIngestOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Ingest
          </Button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Total"
          value={totalAll ?? '—'}
          signal="neutral"
          active={statusFilter === ''}
          onClick={() => handleStatusChange('')}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Expiring ≤30d"
          value={totalWarn ?? '—'}
          signal={totalWarn === null ? 'neutral' : totalWarn === 0 ? 'green' : 'amber'}
          active={statusFilter === 'warning'}
          onClick={() => handleStatusChange('warning')}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Critical ≤7d"
          value={totalCrit ?? '—'}
          signal={totalCrit === null ? 'neutral' : totalCrit === 0 ? 'green' : 'red'}
          active={statusFilter === 'critical'}
          onClick={() => handleStatusChange('critical')}
        />
        <StatCard
          icon={<ShieldOff className="h-4 w-4" />}
          label="Expired"
          value={totalExpired ?? '—'}
          signal={totalExpired === null ? 'neutral' : totalExpired === 0 ? 'green' : 'red'}
          active={statusFilter === 'expired'}
          onClick={() => handleStatusChange('expired')}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search common name or SAN…"
          className="max-w-sm flex-1"
        />
        <FilterDropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onSelect={v => handleStatusChange(v as StatusFilter)}
        />
        <FilterDropdown
          label="Sort"
          options={SORT_OPTIONS}
          value={sortOption}
          onSelect={v => handleSortChange(v as SortOption)}
        />
      </div>

      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">

        {/* Column headers */}
        <div className={`grid ${ROW_GRID} items-center gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/40`}>
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={allPageSelected}
              ref={el => { if (el) el.indeterminate = somePageSelected }}
              onChange={toggleAll}
              disabled={certs.length === 0}
              aria-label="Select all on page"
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Common Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SANs</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expiration</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Actions</span>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : certs.length === 0 ? (
          <div className="py-16 flex items-center justify-center">
            {debouncedSearch || statusFilter
              ? <span className="text-sm text-muted-foreground">No certificates match your filters.</span>
              : <StrixEmpty message="No certificates yet." />}
          </div>
        ) : (
          <div className={`transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {certs.map(cert => (
              <CertRow
                key={cert.fingerprint}
                cert={cert}
                admin={admin}
                selected={selected.has(cert.fingerprint)}
                onToggle={toggleOne}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        {/* Footer: count + pagination inside the card */}
        <div className="flex items-center justify-between border-t border-border/40 px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? 'No certificates'
              : <>Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> {plural(totalCount, 'certificate')}</>}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <span className="px-2 text-sm tabular-nums text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <IngestDialog
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onIngested={(fp) => navigate(`/certificates/${fp}`)}
      />
      <DeleteDialog
        cert={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={refetch}
      />
    </div>
  )
}
