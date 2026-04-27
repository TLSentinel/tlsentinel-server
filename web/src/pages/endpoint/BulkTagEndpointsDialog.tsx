import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { setEndpointTags } from '@/api/tags'
import type { CategoryWithTags, EndpointListItem } from '@/types/api'
import { ApiError } from '@/types/api'
import { plural, cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Bulk add-tags dialog.
//
// v1 semantic is add-only: every tag picked here is unioned with each
// endpoint's existing tags. Nothing is removed — this is the "mark these
// 14 as Production" workflow, not "reset their tags". A future "remove"
// or "replace" mode would add a second section to this dialog.
//
// Backend has no bulk endpoint, so we loop per-endpoint PUTs in parallel.
// The list response already carries current tags, so no extra GETs.
// ---------------------------------------------------------------------------

type Result = { id: string; name: string; error?: string }

type Phase = 'pick' | 'running' | 'summary'

interface Props {
  open:       boolean
  endpoints:  EndpointListItem[]
  categories: CategoryWithTags[]
  onClose:    () => void
  onDone:     () => void
}

export default function BulkTagEndpointsDialog({ open, endpoints, categories, onClose, onDone }: Props) {
  const [phase,    setPhase]    = useState<Phase>('pick')
  const [picked,   setPicked]   = useState<Set<string>>(new Set())
  const [results,  setResults]  = useState<Result[]>([])

  // Reset internal state each time the dialog opens
  useEffect(() => {
    if (open) {
      setPhase('pick')
      setPicked(new Set())
      setResults([])
    }
  }, [open])

  function togglePick(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleClose() {
    if (phase === 'running') return
    const wasDone = phase === 'summary'
    onClose()
    if (wasDone) onDone()
  }

  async function handleConfirm() {
    if (picked.size === 0) return
    setPhase('running')

    const toAdd = [...picked]
    const settled = await Promise.allSettled(
      endpoints.map(async ep => {
        // Union existing tag IDs with newly picked — preserves anything the
        // endpoint already has, which is the v1 add-only contract.
        const existing = new Set(ep.tags.map(t => t.id))
        for (const id of toAdd) existing.add(id)
        await setEndpointTags(ep.id, [...existing])
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
              ? 'Tag Results'
              : `Add Tags to ${endpoints.length} ${plural(endpoints.length, 'Endpoint')}`}
          </DialogTitle>
        </DialogHeader>

        {phase === 'pick' && (
          <>
            <p className="text-sm text-muted-foreground">
              Selected tags will be <span className="font-medium text-foreground">added</span>{' '}
              to each endpoint. Existing tags are preserved.
            </p>

            {categories.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No tags defined yet. Create tags in Settings before using bulk tagging.
              </p>
            ) : (
              <div className="max-h-80 space-y-4 overflow-y-auto py-1">
                {categories.map(cat => (
                  <div key={cat.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {cat.name}
                    </p>
                    <div className="space-y-1">
                      {cat.tags.map(tag => {
                        const on = picked.has(tag.id)
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => togglePick(tag.id)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                              on ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                            )}
                          >
                            <span className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                            )}>
                              {on && (
                                <svg viewBox="0 0 8 6" className="h-2.5 w-2.5 fill-current">
                                  <path d="M1 3l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            {tag.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {phase === 'running' && (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Tagging {endpoints.length} {plural(endpoints.length, 'endpoint')}…
          </div>
        )}

        {phase === 'summary' && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span>
                <span className="font-medium text-green-600">{succeeded}</span>{' '}
                updated
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
                  Could not tag
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
          {phase === 'pick' && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={picked.size === 0}>
                Add {picked.size > 0 ? picked.size : ''} {plural(picked.size || 1, 'Tag')}
              </Button>
            </>
          )}
          {phase === 'running' && <Button disabled>Working…</Button>}
          {phase === 'summary' && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
