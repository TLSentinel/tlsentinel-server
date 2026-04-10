import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Copy, Check, AlertTriangle, Star, ChevronRight } from 'lucide-react'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { listScanners, createScanner, updateScanner, setDefaultScanner, deleteScanner } from '@/api/scanners'
import { can } from '@/api/client'
import type { ScannerToken, ScannerTokenCreated } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDate, plural } from '@/lib/utils'
import { useQuery, keepPreviousData } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRelative(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function fmtInterval(secs: number): string {
  if (secs >= 3600 && secs % 3600 === 0) return `${secs / 3600}h`
  if (secs >= 60 && secs % 60 === 0) return `${secs / 60}m`
  return `${secs}s`
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (created: ScannerTokenCreated) => void
}

function CreateDialog({ open, onClose, onCreated }: CreateDialogProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createScanner(name.trim())
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create scanner token.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Scanner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="a-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prod-scanner-01"
              required
            />
            <p className="text-xs text-muted-foreground">
              A descriptive label to identify this scanner agent.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Scanner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit scanner dialog
// ---------------------------------------------------------------------------

interface EditScannerDialogProps {
  scanner: ScannerToken | null
  onClose: () => void
  onSaved: () => void
}

function EditScannerDialog({ scanner, onClose, onSaved }: EditScannerDialogProps) {
  const [name, setName] = useState(scanner?.name ?? '')
  const [intervalSecs, setIntervalSecs] = useState(scanner?.scanIntervalSeconds ?? 3600)
  const [concurrency, setConcurrency] = useState(scanner?.scanConcurrency ?? 5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!scanner) return
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    if (intervalSecs < 10) {
      setError('Scan interval must be at least 10 seconds.')
      return
    }
    if (concurrency < 1) {
      setError('Concurrency must be at least 1.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await updateScanner(scanner.id, name.trim(), intervalSecs, concurrency)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update scanner.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={scanner !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Scanner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="e-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-interval">
              Scan interval{' '}
              <span className="text-xs text-muted-foreground">(seconds)</span>
            </Label>
            <Input
              id="e-interval"
              type="number"
              min={10}
              value={intervalSecs}
              onChange={(e) => setIntervalSecs(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              How often the scanner checks each host. Default: 3600 (1 hour).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-concurrency">Concurrency</Label>
            <Input
              id="e-concurrency"
              type="number"
              min={1}
              max={100}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Maximum simultaneous host scans. Default: 5.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Token reveal dialog — shown exactly once after creation
// ---------------------------------------------------------------------------

interface TokenRevealDialogProps {
  created: ScannerTokenCreated | null
  onClose: () => void
}

function TokenRevealDialog({ created, onClose }: TokenRevealDialogProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scanner Token Created</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning banner */}
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Copy this token now — it will <strong>not</strong> be shown again.
            </p>
          </div>

          {/* Token display */}
          <div className="space-y-1.5">
            <Label>Bearer Token</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                {created?.token}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="sr-only">Copy token</span>
              </Button>
            </div>
          </div>

          {/* Usage hint */}
          <p className="text-xs text-muted-foreground">
            Provide this token in the{' '}
            <code className="rounded bg-muted px-1 font-mono">Authorization: Bearer &lt;token&gt;</code>{' '}
            header when configuring your scanner.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  scanner: ScannerToken | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ scanner, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!scanner) return
    setLoading(true)
    setError(null)
    try {
      await deleteScanner(scanner.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke scanner token.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={scanner !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke Scanner</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to revoke{' '}
          <span className="font-medium text-foreground">{scanner?.name}</span>? Any scanner
          using this token will immediately lose access.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScannersPage() {
  const admin = can('scanners:edit')
  const [now] = useState(Date.now)

  const [addSeq, setAddSeq] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [revealToken, setRevealToken] = useState<ScannerTokenCreated | null>(null)
  const [editTarget, setEditTarget] = useState<ScannerToken | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScannerToken | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const { data: scannersData, isLoading, isFetching, error: fetchError, refetch } = useQuery({
    queryKey: ['scanners'],
    queryFn: listScanners,
    placeholderData: keepPreviousData,
  })
  const scanners: ScannerToken[] = scannersData ?? []

  function handleCreated(created: ScannerTokenCreated) {
    // Refresh the list, then show the one-time token reveal.
    refetch()
    setRevealToken(created)
  }

  async function handleSetDefault(scanner: ScannerToken) {
    try {
      await setDefaultScanner(scanner.id)
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : 'Failed to set default scanner.')
    } finally {
      refetch()
    }
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Scanners</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Scanners</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {scanners.length} {plural(scanners.length, 'scanner')} registered
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
            Add Scanner
          </Button>
        )}
      </div>

      {/* Error */}
      {fetchError && <p className="text-sm text-destructive">{fetchError.message}</p>}
      {mutationError && <p className="text-sm text-destructive">{mutationError}</p>}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Interval</TableHead>
            <TableHead>Concurrency</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody className={`[&_tr]:border-b-0 transition-opacity ${isFetching && !isLoading ? 'opacity-50' : 'opacity-100'}`}>
          {isLoading && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                Loading…
              </TableCell>
            </TableRow>
          )}

          {!isLoading && scanners.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center">
                <StrixEmpty message={<>No scanners yet. Click <strong>Add Scanner</strong> to get started.</>} />
              </TableCell>
            </TableRow>
          )}

          {!isLoading &&
            scanners.map((scanner) => (
              <TableRow key={scanner.id}>
                {/* Name + default badge */}
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {scanner.name}
                    {scanner.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </span>
                </TableCell>

                {/* Scan interval */}
                <TableCell className="text-sm text-muted-foreground">
                  {fmtInterval(scanner.scanIntervalSeconds)}
                </TableCell>

                {/* Concurrency */}
                <TableCell className="text-sm text-muted-foreground">
                  {scanner.scanConcurrency}
                </TableCell>

                {/* Created */}
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(scanner.createdAt)}
                </TableCell>

                {/* Last used */}
                <TableCell className="text-sm">
                  {scanner.lastUsedAt ? (
                    fmtRelative(scanner.lastUsedAt, now)
                  ) : (
                    <span className="text-muted-foreground">Never</span>
                  )}
                </TableCell>

                {/* Actions — admin only */}
                <TableCell>
                  {admin && (
                    <div className="flex items-center justify-end gap-0.5">
                      {/* Set as default */}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className={
                          scanner.isDefault
                            ? 'text-amber-500'
                            : 'text-muted-foreground hover:text-amber-500'
                        }
                        onClick={() => handleSetDefault(scanner)}
                        title={scanner.isDefault ? 'Default scanner' : 'Set as default'}
                      >
                        <Star
                          className="h-4 w-4"
                          fill={scanner.isDefault ? 'currentColor' : 'none'}
                        />
                        <span className="sr-only">
                          {scanner.isDefault
                            ? 'Default scanner'
                            : `Set ${scanner.name} as default`}
                        </span>
                      </Button>

                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={() => setEditTarget(scanner)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit {scanner.name}</span>
                      </Button>

                      {/* Revoke */}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(scanner)}
                        title="Revoke"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Revoke {scanner.name}</span>
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      {/* Dialogs */}
      <CreateDialog
        key={addSeq}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />

      <TokenRevealDialog
        created={revealToken}
        onClose={() => setRevealToken(null)}
      />

      <EditScannerDialog
        key={editTarget?.id}
        scanner={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={refetch}
      />

      <DeleteDialog
        scanner={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={refetch}
      />
    </div>
  )
}
