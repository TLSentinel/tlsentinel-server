import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, AlertCircle, Globe, Loader2, Search, ChevronDown, Check } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Link } from 'react-router-dom'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { listEndpoints, getEndpoint, createEndpoint, updateEndpoint, deleteEndpoint } from '@/api/endpoints'
import { listScanners } from '@/api/scanners'
import { resolve } from '@/api/utils'
import { isAdmin } from '@/api/client'
import type { EndpointListItem, ScannerToken } from '@/types/api'
import { ApiError } from '@/types/api'
import { plural } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Filter / sort options
// ---------------------------------------------------------------------------

type HostStatus = '' | 'enabled' | 'disabled'
type SortOption = '' | 'name' | 'dns_name' | 'last_scanned'

const STATUS_OPTIONS: { value: HostStatus; label: string }[] = [
  { value: '',         label: 'All' },
  { value: 'enabled',  label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: '',             label: 'Newest first' },
  { value: 'name',         label: 'Name A→Z' },
  { value: 'dns_name',     label: 'DNS name A→Z' },
  { value: 'last_scanned', label: 'Last scanned' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pure relative-time formatter. Accepts a pre-captured `now` to stay pure. */
function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ---------------------------------------------------------------------------
// Add / Edit dialog
// ---------------------------------------------------------------------------

interface EndpointDialogProps {
  /** null = create mode; non-null = edit mode (pre-fills from list item). */
  endpoint: EndpointListItem | null
  scanners: ScannerToken[]
  open: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Keyed by the parent so it remounts (fresh state) on every open.
 * Initial state is derived from the `host` prop at mount time — no
 * useEffect reset needed.
 */
function EndpointDialog({ endpoint, scanners, open, onClose, onSaved }: EndpointDialogProps) {
  const isEdit = endpoint !== null

  const [name, setName] = useState(endpoint?.name ?? '')
  const [dnsName, setDnsName] = useState(endpoint?.dnsName ?? '')
  const [port, setPort] = useState(String(endpoint?.port ?? 443))
  const [ipAddress, setIpAddress] = useState('')
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true)
  const [scannerID, setScannerID] = useState(endpoint?.scannerId ?? '')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  // In edit mode, HostListItem omits ipAddress/notes — fetch the full record once on mount.
  useEffect(() => {
    if (!endpoint) return
    getEndpoint(endpoint.id).then((full) => {
      if (full.ipAddress) setIpAddress(full.ipAddress)
      if (full.notes) setNotes(full.notes)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResolve() {
    const hostname = dnsName.trim()
    if (!hostname) return
    setResolving(true)
    setResolveError(null)
    try {
      const result = await resolve(hostname)
      if (result.addresses.length > 0) {
        setIpAddress(result.addresses[0])
      } else {
        setResolveError('No addresses returned for this hostname.')
      }
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : 'DNS resolution failed.')
    } finally {
      setResolving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !dnsName.trim()) {
      setError('Name and DNS Name are required.')
      return
    }
    const parsedPort = parseInt(port, 10)
    if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setError('Port must be between 1 and 65535.')
      return
    }

    const ip = ipAddress.trim() || undefined
    const sid = scannerID || undefined

    setSubmitting(true)
    setError(null)

    const notesVal = notes.trim() || undefined

    try {
      if (isEdit) {
        await updateEndpoint(endpoint.id, {
          name: name.trim(),
          dnsName: dnsName.trim(),
          port: parsedPort,
          ipAddress: ip,
          enabled,
          scannerId: sid,
          notes: notesVal,
        })
      } else {
        await createEndpoint({
          name: name.trim(),
          dnsName: dnsName.trim(),
          port: parsedPort,
          ipAddress: ip,
          scannerId: sid,
          notes: notesVal,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to ${isEdit ? 'update' : 'create'} endpoint.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Endpoint' : 'Add Endpoint'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="h-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="h-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production API"
              required
            />
          </div>

          {/* DNS Name + Resolve */}
          <div className="space-y-1.5">
            <Label htmlFor="h-dns">
              DNS Name <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="h-dns"
                value={dnsName}
                onChange={(e) => {
                  setDnsName(e.target.value)
                  setResolveError(null)
                }}
                placeholder="api.example.com"
                className="flex-1"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResolve}
                disabled={!dnsName.trim() || resolving}
                className="shrink-0"
              >
                {resolving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe className="mr-1.5 h-3.5 w-3.5" />
                )}
                Resolve
              </Button>
            </div>
          </div>

          {/* IP Address */}
          <div className="space-y-1.5">
            <Label htmlFor="h-ip">
              IP Address{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="h-ip"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="1.2.3.4"
            />
            {resolveError && (
              <p className="text-xs text-destructive">{resolveError}</p>
            )}
          </div>

          {/* Port */}
          <div className="space-y-1.5">
            <Label htmlFor="h-port">Port</Label>
            <Input
              id="h-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-28"
            />
          </div>

          {/* Scanner */}
          <div className="space-y-1.5">
            <Label htmlFor="h-scanner">Scanner</Label>
            <select
              id="h-scanner"
              value={scannerID}
              onChange={(e) => setScannerID(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Default</option>
              {scanners.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="h-notes">
              Notes{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="h-notes"
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder={"Owner, support contact, runbook link…\n\nMarkdown is supported."}
              rows={3}
            />
          </div>

          {/* Enabled (edit only) */}
          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="h-enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border border-border accent-primary"
              />
              <Label htmlFor="h-enabled">Enabled</Label>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? isEdit
                  ? 'Saving…'
                  : 'Adding…'
                : isEdit
                  ? 'Save Changes'
                  : 'Add Endpoint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  endpoint: EndpointListItem | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ endpoint, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!endpoint) return
    setLoading(true)
    setError(null)
    try {
      await deleteEndpoint(endpoint.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete endpoint.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={endpoint !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Endpoint</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">{endpoint?.name}</span> (
          {endpoint?.dnsName})? This action cannot be undone.
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
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function HostsPage() {
  const admin = isAdmin()

  // Captured once at mount — avoids calling the impure Date.now() during render.
  const [now] = useState(Date.now)

  const [endpoints, setEndpoints] = useState<EndpointListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<HostStatus>('')
  const [sortOption, setSortOption] = useState<SortOption>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [scanners, setScanners] = useState<ScannerToken[]>([])

  // Incremented each time "Add Endpoint" is clicked so the dialog remounts fresh.
  const [addSeq, setAddSeq] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EndpointListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EndpointListItem | null>(null)

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
      const result = await listEndpoints(page, PAGE_SIZE, debouncedSearch, statusFilter, sortOption)
      setEndpoints(result.items ?? [])
      setTotalCount(result.totalCount)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load endpoints.')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, sortOption])

  useEffect(() => {
    load()
  }, [load])

  // Load scanners once for the scanner dropdown.
  useEffect(() => {
    listScanners().then(setScanners).catch(() => {})
  }, [])

  function handleStatusChange(value: HostStatus) {
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

  function handleCloseDialog() {
    setAddOpen(false)
    setEditTarget(null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Endpoints</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {totalCount} {plural(totalCount, 'endpoint')} monitored
          </p>
        </div>
        {admin && (
          <Button
            onClick={() => {
              setAddSeq((s) => s + 1)
              setAddOpen(true)
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Endpoint
          </Button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name or DNS…"
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
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scanner</TableHead>
              <TableHead>Last Scanned</TableHead>
              <TableHead>Certificate</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}

            {!loading && endpoints.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  {debouncedSearch || statusFilter
                    ? <span className="text-sm text-muted-foreground">No endpoints match your filters.</span>
                    : <StrixEmpty message={<>No endpoints yet. Click <strong>Add Endpoint</strong> to get started.</>} />}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  {/* Name — links to host detail page */}
                  <TableCell className="font-medium">
                    <Link to={`/endpoints/${endpoint.id}`} className="hover:underline">
                      {endpoint.name}
                    </Link>
                  </TableCell>

                  {/* DNS + port */}
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {endpoint.dnsName}:{endpoint.port}
                  </TableCell>

                  {/* Enabled / Disabled */}
                  <TableCell>
                    {endpoint.enabled ? (
                      <Badge
                        variant="outline"
                        className="border-blue-500 bg-blue-50 text-blue-700"
                      >
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Disabled
                      </Badge>
                    )}
                  </TableCell>

                  {/* Scanner assignment */}
                  <TableCell className="text-sm">
                    {endpoint.scannerName ? (
                      endpoint.scannerName
                    ) : (
                      <span className="text-muted-foreground">Default</span>
                    )}
                  </TableCell>

                  {/* Last scanned + error indicator */}
                  <TableCell className="text-sm">
                    {endpoint.lastScannedAt ? (
                      <span className="flex items-center gap-1.5">
                        {fmtRelative(endpoint.lastScannedAt, now)}
                        {endpoint.lastScanError && (
                          <span title={endpoint.lastScanError}>
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </TableCell>

                  {/* Active certificate link */}
                  <TableCell className="font-mono text-xs">
                    {endpoint.activeFingerprint ? (
                      <Link
                        to={`/certificates/${endpoint.activeFingerprint}`}
                        className="text-primary hover:underline"
                      >
                        {endpoint.activeFingerprint.slice(0, 16)}…
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Row actions — admin only */}
                  <TableCell>
                    {admin && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          asChild
                        >
                          <Link to={`/endpoints/${endpoint.id}?edit=true`}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit {endpoint.name}</span>
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(endpoint)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete {endpoint.name}</span>
                        </Button>
                      </div>
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
          {totalCount === 0
            ? 'No endpoints'
            : `Page ${page} of ${totalPages} · ${totalCount} total`}
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

      {/*
        HostDialog is keyed so it remounts with fresh form state on every open:
        – Add mode: addSeq increments on each click, giving a unique key.
        – Edit mode: key is the endpoint ID, so switching endpoints also remounts.
      */}
      <EndpointDialog
        key={editTarget ? editTarget.id : `add-${addSeq}`}
        endpoint={editTarget}
        scanners={scanners}
        open={addOpen || editTarget !== null}
        onClose={handleCloseDialog}
        onSaved={load}
      />

      <DeleteDialog
        endpoint={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={load}
      />
    </div>
  )
}
