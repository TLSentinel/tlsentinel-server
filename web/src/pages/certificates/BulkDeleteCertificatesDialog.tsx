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
// A cert delete is refused (409) when the cert is still referenced by
// endpoint attachments or scan history, or when it is the issuer of other
// certs. The optional "purge references" toggle sends ?purge=true on every
// delete, which clears the referencing scan-history rows and endpoint
// attachments first (safe no-op on certs that have none). Issuer certs are
// never deletable and surface in the failure summary regardless.
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
  const [purge,   setPurge]   = useState(false)

  function handleClose() {
    if (phase === 'running') return
    const wasDone = phase === 'summary'
    setPhase('confirm')
    setResults([])
    setPurge(false)
    onClose()
    if (wasDone) onDone()
  }

  async function handleConfirm() {
    setPhase('running')
    const settled = await Promise.allSettled(
      certificates.map(async cert => {
        await deleteCertificate(cert.fingerprint, purge)
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
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={purge}
                onChange={(e) => setPurge(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-destructive cursor-pointer"
              />
              <span className="text-muted-foreground">
                Also purge references (scan history and endpoint attachments) for any
                referenced certificates.
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              {purge
                ? 'Referenced certificates will have their references removed and be deleted. Issuer certificates are never deletable and will be reported below.'
                : 'Certificates still referenced by endpoints or scan history are skipped and reported below — tick the box above to purge and delete them too.'}
            </p>
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
                {purge ? `Delete + purge ${certificates.length}` : `Delete ${certificates.length}`}
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
