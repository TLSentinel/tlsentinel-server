import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileEdit, CheckCircle2, XCircle, Pencil, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { patchEndpoint } from '@/api/endpoints'
import type { Endpoint, EndpointScanHistoryItem, TagWithCategory } from '@/types/api'
import { ApiError } from '@/types/api'
import { fmtDateTime } from '@/lib/utils'
import { categoryColor } from '@/lib/tag-colors'
import { Breadcrumb } from '@/components/Breadcrumb'
import { ErrorAlert } from '@/components/ErrorAlert'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TYPE_LABEL: Record<string, string> = {
  host:   'Host',
  saml:   'SAML',
  manual: 'Manual',
}

// ---------------------------------------------------------------------------
// Section primitive
// ---------------------------------------------------------------------------

export function Section({ title, titleClassName, className, bareTitle = false, action, children }: { title?: string; titleClassName?: string; className?: string; bareTitle?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl bg-card border border-border overflow-hidden ${className ?? ''}`}>
      {title && !bareTitle && (
        <div className="px-5 py-3 bg-muted flex items-center justify-between gap-3">
          <h2 className={`text-sm font-medium ${titleClassName ?? ''}`}>{title}</h2>
          {action}
        </div>
      )}
      <div className={bareTitle ? 'p-6' : 'p-5'}>
        {title && bareTitle && (
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 className={titleClassName ?? 'text-sm font-medium'}>{title}</h2>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Back breadcrumb
// ---------------------------------------------------------------------------

export function BackBreadcrumb({ name }: { name: string | null }) {
  return (
    <Breadcrumb items={[
      { label: 'Endpoints', to: '/endpoints' },
      { label: <>{name ?? '…'}</> },
    ]} />
  )
}

// ---------------------------------------------------------------------------
// Page header — type badge, name, last-scanned, edit button, optional action
// ---------------------------------------------------------------------------

export function EndpointHeader({
  endpoint,
  showLastScanned = true,
  action,
}: {
  endpoint: Endpoint
  showLastScanned?: boolean
  action?: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <Badge className="h-7 rounded-md px-3 text-sm font-semibold uppercase shrink-0">
            {TYPE_LABEL[endpoint.type] ?? endpoint.type}
          </Badge>
          <h1 className="text-5xl font-bold truncate">{endpoint.name}</h1>
        </div>
        {showLastScanned && (
          <p className="mt-2 text-sm text-muted-foreground">
            Last scanned {endpoint.lastScannedAt ? fmtDateTime(endpoint.lastScannedAt) : '—'}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2 mt-1">
        <Button
          variant="outline"
          onClick={() => navigate(`/endpoints/${endpoint.id}/edit`)}
          className="h-12 px-4 text-base font-semibold"
        >
          <Pencil className="mr-1.5 h-4 w-4" />
          Edit Endpoint
        </Button>
        {action}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tags row
// ---------------------------------------------------------------------------

export function TagsRow({ tags }: { tags: TagWithCategory[] }) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map(tag => (
        <span
          key={tag.id}
          className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium ${categoryColor(tag.categoryId)}`}
        >
          <span className="opacity-60">{tag.categoryName}:</span>
          {tag.name}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error banner (used when lastScanError is set)
// ---------------------------------------------------------------------------

export function LastScanErrorBanner({ message }: { message: string }) {
  return <ErrorAlert>{message}</ErrorAlert>
}

// ---------------------------------------------------------------------------
// Monitored / scanning toggle rows (shared between host + saml)
// ---------------------------------------------------------------------------

export function MonitoringRows({
  endpoint,
  onToggleEnabled,
  onToggleScanning,
  showScanning = true,
}: {
  endpoint: Endpoint
  onToggleEnabled: (enabled: boolean) => void
  onToggleScanning?: (enabled: boolean) => void
  showScanning?: boolean
}) {
  const scanningOn = !endpoint.scanExempt
  return (
    <>
      <Row label="Monitored">
        <Switch checked={endpoint.enabled} onCheckedChange={onToggleEnabled} />
      </Row>
      {showScanning && onToggleScanning && (
        <Row label="Scanning">
          <Switch checked={scanningOn} onCheckedChange={onToggleScanning} />
        </Row>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Notes section (with inline edit modal, PATCH /endpoints/{id})
// ---------------------------------------------------------------------------

export function NotesSection({ endpoint }: { endpoint: Endpoint }) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div className="rounded-xl bg-surface-container-low border border-border overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Internal Notes
          </h2>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Edit notes"
          >
            <FileEdit className="h-4 w-4" />
          </button>
        </div>
        {endpoint.notes ? (
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2">
            <ReactMarkdown>{endpoint.notes}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No notes.</p>
        )}
      </div>
      <NotesEditDialog endpoint={endpoint} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  )
}

function NotesEditDialog({
  endpoint,
  open,
  onClose,
}: {
  endpoint: Endpoint
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(endpoint.notes ?? '')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setValue(endpoint.notes ?? '')
      setError('')
    }
  }, [open, endpoint.notes])

  const { mutate, isPending } = useMutation({
    mutationFn: (notes: string | null) => patchEndpoint(endpoint.id, { notes }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['endpoint', endpoint.id], updated)
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save notes'),
  })

  function handleSave() {
    const trimmed = value.trim()
    mutate(trimmed === '' ? null : trimmed)
  }

  const hasNotes = !!endpoint.notes

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <StickyNote className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">{hasNotes ? 'Edit Notes' : 'Add Notes'}</DialogTitle>
            <DialogDescription>
              Owner, support contact, runbook link — markdown is supported.
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'Owner, support contact, runbook link…\n\nMarkdown is supported.'}
            rows={10}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Scan history (tlsVersion + fingerprint fields are null for SAML)
// ---------------------------------------------------------------------------

export function ScanHistorySection({
  items,
  endpointID,
  totalCount,
}: {
  items: EndpointScanHistoryItem[] | null
  endpointID: string
  totalCount: number
}) {
  const hasMore = items !== null && totalCount > items.length
  return (
    <Section title="Scan History" titleClassName="text-xs font-semibold uppercase tracking-widest text-muted-foreground" bareTitle>
      {items === null ? (
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No scan history yet.</p>
      ) : (
        <>
          <div>{items.map((item) => <ScanHistoryRow key={item.id} item={item} />)}</div>
          {hasMore && (
            <div className="mt-3 pt-3 border-t border-border/40">
              <Link
                to={`/endpoints/${endpointID}/scan-history`}
                className="text-xs font-medium text-primary hover:underline"
              >
                View full scan history ({totalCount})
              </Link>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

export function ScanHistoryRow({ item }: { item: EndpointScanHistoryItem }) {
  const ok = !item.scanError
  return (
    <div className="py-2.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        {ok
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-tertiary" />
          : <XCircle      className="h-4 w-4 shrink-0 text-error" />}
        <span className="shrink-0 text-sm font-medium">{fmtDateTime(item.scannedAt)}</span>
        {item.tlsVersion && (
          <span className="shrink-0 text-xs text-muted-foreground">{item.tlsVersion}</span>
        )}
        {item.fingerprint && (
          <Link
            to={`/certificates/${item.fingerprint}`}
            className="min-w-0 truncate font-mono text-xs text-muted-foreground/70 hover:text-primary hover:underline"
          >
            {item.fingerprint}
          </Link>
        )}
      </div>
      {item.scanError && <p className="mt-1 pl-7 text-xs text-destructive">{item.scanError}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading / error shells — keep the back breadcrumb so users can bail out.
// ---------------------------------------------------------------------------

export function DetailShell({ name, children }: { name: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <BackBreadcrumb name={name} />
      {children}
    </div>
  )
}
