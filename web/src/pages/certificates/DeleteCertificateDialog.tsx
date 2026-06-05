import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { deleteCertificate } from '@/api/certificates'
import { ApiError } from '@/types/api'

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
