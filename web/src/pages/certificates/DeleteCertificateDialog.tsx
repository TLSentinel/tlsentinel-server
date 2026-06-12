import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { deleteCertificate, getCertificateReferences } from '@/api/certificates'
import { ApiError } from '@/types/api'
import { plural } from '@/lib/utils'

/**
 * Structural prop type so the dialog accepts both CertificateListItem
 * (from the list page) and Certificate (from the detail header) without
 * either side having to coerce. We only need fingerprint to delete and
 * commonName to label the confirmation; the rest of either type is
 * irrelevant here.
 */
export interface DeletableCertificate {
  fingerprint: string
  commonName?: string | null
}

interface DeleteCertificateDialogProps {
  cert: DeletableCertificate | null
  onClose: () => void
  /** Fires after a successful delete. Use to refetch a list, or to
   *  navigate away from a now-stale detail page. */
  onDeleted: () => void
}

export default function DeleteCertificateDialog({ cert, onClose, onDeleted }: DeleteCertificateDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purgeChecked, setPurgeChecked] = useState(false)

  // Fetch what still points at this cert when the dialog opens, so we can
  // explain the situation up front instead of letting the operator click
  // Delete and bounce off a 409. One fast COUNT query.
  const { data: refs, isLoading: refsLoading } = useQuery({
    queryKey: ['cert-references', cert?.fingerprint],
    queryFn: () => getCertificateReferences(cert!.fingerprint),
    enabled: cert !== null,
  })

  // Reset transient state each time the dialog opens for a different cert.
  useEffect(() => {
    setPurgeChecked(false)
    setError(null)
  }, [cert?.fingerprint])

  const isIssuer = !!refs && refs.issuedCerts > 0
  const blockingCount = refs
    ? refs.currentEndpoints + refs.historicalEndpoints + refs.scanHistory
    : 0
  const hasBlockingRefs = !isIssuer && blockingCount > 0

  // Breakdown lines for the warning panel.
  const refLines: string[] = []
  if (refs) {
    if (refs.currentEndpoints > 0)
      refLines.push(`${refs.currentEndpoints} active ${plural(refs.currentEndpoints, 'endpoint')}`)
    if (refs.historicalEndpoints > 0)
      refLines.push(`${refs.historicalEndpoints} historical ${plural(refs.historicalEndpoints, 'attachment')}`)
    if (refs.scanHistory > 0)
      refLines.push(`${refs.scanHistory} scan history ${plural(refs.scanHistory, 'record')}`)
  }

  async function handleDelete() {
    if (!cert) return
    setLoading(true)
    setError(null)
    try {
      await deleteCertificate(cert.fingerprint, hasBlockingRefs && purgeChecked)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete certificate.')
    } finally {
      setLoading(false)
    }
  }

  // Delete is blocked while we don't yet know the reference state, when the
  // cert is an issuer (never deletable), and when there are references the
  // operator hasn't opted to purge.
  const deleteDisabled =
    loading || refsLoading || isIssuer || (hasBlockingRefs && !purgeChecked)

  const deleteLabel = loading
    ? 'Deleting…'
    : hasBlockingRefs && purgeChecked
      ? 'Delete + purge references'
      : 'Delete'

  return (
    <Dialog open={cert !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Certificate</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{' '}
          {/* Fingerprint fallback (when there's no CN) is a 64-char hex
              string with no natural break points — without break-all it
              overflows the dialog. Match the rest of the app's treatment
              of fingerprints: font-mono + break-all. Prose CNs stay in
              the default sans with regular wrapping. */}
          {cert?.commonName ? (
            <span className="font-medium text-foreground break-words">{cert.commonName}</span>
          ) : (
            <span className="font-mono text-foreground break-all">{cert?.fingerprint}</span>
          )}
          ? This action cannot be undone.
        </p>

        {refsLoading && (
          <p className="text-xs text-muted-foreground">Checking references…</p>
        )}

        {/* Issuer of other certs — hard block, no purge option. The chain is
            reconstructed from observed certs and would likely rebuild anyway,
            so we never break it. */}
        {isIssuer && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This certificate is the issuer of{' '}
              <span className="font-semibold">
                {refs!.issuedCerts} other {plural(refs!.issuedCerts, 'certificate')}
              </span>{' '}
              and can&rsquo;t be deleted. Delete those first.
            </span>
          </div>
        )}

        {/* Has references but is deletable with a purge — explain and gate. */}
        {hasBlockingRefs && (
          <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p>This certificate is still referenced by:</p>
                <ul className="list-inside list-disc text-amber-700/90 dark:text-amber-400/90">
                  {refLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={purgeChecked}
                onChange={(e) => setPurgeChecked(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-destructive cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-muted-foreground">
                Also remove these references (scan history and endpoint
                attachments) and delete the certificate.
              </span>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteDisabled}>
            {deleteLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
