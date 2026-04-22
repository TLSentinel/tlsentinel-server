import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteEndpoint } from '@/api/endpoints'
import type { EndpointListItem } from '@/types/api'
import { ApiError } from '@/types/api'
import { plural } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Bulk delete for endpoints. No dedicated bulk API — we loop single-item
// DELETEs in parallel. Each delete still emits its own audit entry, which
// matches what you'd get from clicking through the row kebabs one at a
// time, so the audit trail is faithful. Partial failure is possible and
// surfaced with a per-row summary before closing.
// ---------------------------------------------------------------------------

const PREVIEW_LIMIT = 5

type Result = { id: string; name: string; error?: string }

type Phase = 'confirm' | 'running' | 'summary'

interface Props {
  open:      boolean
  endpoints: EndpointListItem[]
  onClose:   () => void
  onDone:    () => void   // called after user dismisses the summary
}

export default function BulkDeleteEndpointsDialog({ open, endpoints, onClose, onDone }: Props) {
  const [phase,   setPhase]   = useState<Phase>('confirm')
  const [results, setResults] = useState<Result[]>([])

  function handleClose() {
    if (phase === 'running') return
    const wasDone = phase === 'summary'
    setPhase('confirm')
    setResults([])
    onClose()
    if (wasDone) onDone()
  }

  async function handleConfirm() {
    setPhase('running')
    const settled = await Promise.allSettled(
      endpoints.map(async ep => {
        await deleteEndpoint(ep.id)
        return ep
      }),
    )
    const out: Result[] = settled.map((s, i) => {
      const ep = endpoints[i]
      if (s.status === 'fulfilled') return { id: ep.id, name: ep.name }
      const err = s.reason
      return {
        id:    ep.id,
        name:  ep.name,
        error: err instanceof ApiError ? err.message : String(err),
      }
    })
    setResults(out)
    setPhase('summary')
  }

  const failed    = results.filter(r => r.error)
  const succeeded = results.length - failed.length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {phase === 'summary'
              ? 'Delete Results'
              : `Delete ${endpoints.length} ${plural(endpoints.length, 'Endpoint')}`}
          </DialogTitle>
        </DialogHeader>

        {phase === 'confirm' && (
          <>
            <p className="text-sm text-muted-foreground">
              You're about to delete <span className="font-medium text-foreground">{endpoints.length}</span>{' '}
              {plural(endpoints.length, 'endpoint')}. This action cannot be undone.
            </p>
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              {endpoints.slice(0, PREVIEW_LIMIT).map(ep => (
                <li key={ep.id} className="truncate py-0.5">
                  <span className="font-medium">{ep.name}</span>
                  {ep.dnsName && <span className="text-muted-foreground"> · {ep.dnsName}</span>}
                </li>
              ))}
              {endpoints.length > PREVIEW_LIMIT && (
                <li className="pt-1 text-xs italic text-muted-foreground">
                  …and {endpoints.length - PREVIEW_LIMIT} more
                </li>
              )}
            </ul>
          </>
        )}

        {phase === 'running' && (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Deleting {endpoints.length} {plural(endpoints.length, 'endpoint')}…
          </div>
        )}

        {phase === 'summary' && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span>
                <span className="font-medium text-green-600">{succeeded}</span>{' '}
                deleted
              </span>
              {failed.length > 0 && (
                <span>
                  <span className="font-medium text-destructive">{failed.length}</span>{' '}
                  failed
                </span>
              )}
            </div>
            {failed.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Could not delete
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {failed.map(r => (
                    <li key={r.id}>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.error}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === 'confirm' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button variant="destructive" onClick={handleConfirm}>
                Delete {endpoints.length}
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button disabled>Working…</Button>
          )}
          {phase === 'summary' && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
