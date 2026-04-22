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
import { deleteCertificate } from '@/api/certificates'
import type { CertificateListItem } from '@/types/api'
import { ApiError } from '@/types/api'
import { plural } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Bulk delete for certificates. No dedicated bulk API — we loop single-item
// DELETEs in parallel. Each delete still emits its own audit entry.
//
// Unlike endpoints, cert deletes can fail at the DB layer when a cert is
// still referenced (endpoint_certs, hosts.active_fingerprint). The server
// surfaces those as a generic 500 today, which shows up verbatim in the
// per-row summary — good enough until we add structured FK conflict errors.
// ---------------------------------------------------------------------------

const PREVIEW_LIMIT = 5

type Result = { fingerprint: string; name: string; error?: string }

type Phase = 'confirm' | 'running' | 'summary'

interface Props {
  open:         boolean
  certificates: CertificateListItem[]
  onClose:      () => void
  onDone:       () => void   // called after user dismisses the summary
}

export default function BulkDeleteCertificatesDialog({ open, certificates, onClose, onDone }: Props) {
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
      certificates.map(async cert => {
        await deleteCertificate(cert.fingerprint)
        return cert
      }),
    )
    const out: Result[] = settled.map((s, i) => {
      const cert = certificates[i]
      const name = cert.commonName || cert.fingerprint
      if (s.status === 'fulfilled') return { fingerprint: cert.fingerprint, name }
      const err = s.reason
      return {
        fingerprint: cert.fingerprint,
        name,
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
              : `Delete ${certificates.length} ${plural(certificates.length, 'Certificate')}`}
          </DialogTitle>
        </DialogHeader>

        {phase === 'confirm' && (
          <>
            <p className="text-sm text-muted-foreground">
              You're about to delete <span className="font-medium text-foreground">{certificates.length}</span>{' '}
              {plural(certificates.length, 'certificate')}. This action cannot be undone.
            </p>
            <p className="text-xs text-muted-foreground">
              Certificates currently referenced by endpoints or hosts cannot be deleted and will be reported below.
            </p>
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              {certificates.slice(0, PREVIEW_LIMIT).map(cert => (
                <li key={cert.fingerprint} className="truncate py-0.5">
                  <span className="font-medium">{cert.commonName || '—'}</span>
                  <span className="text-muted-foreground"> · {cert.fingerprint.slice(0, 16)}…</span>
                </li>
              ))}
              {certificates.length > PREVIEW_LIMIT && (
                <li className="pt-1 text-xs italic text-muted-foreground">
                  …and {certificates.length - PREVIEW_LIMIT} more
                </li>
              )}
            </ul>
          </>
        )}

        {phase === 'running' && (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Deleting {certificates.length} {plural(certificates.length, 'certificate')}…
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
                    <li key={r.fingerprint}>
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
                Delete {certificates.length}
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
