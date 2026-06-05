import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { deleteEndpoint } from '@/api/endpoints'
import { ApiError } from '@/types/api'

/**
 * Structural prop type so the dialog accepts both EndpointListItem
 * (from the list page) and Endpoint (from the detail header) without
 * either side having to coerce. We only need id + name for the
 * confirmation copy; dnsName is decorative when present.
 */
export interface DeletableEndpoint {
  id: string
  name: string
  dnsName?: string | null
}

interface DeleteEndpointDialogProps {
  endpoint: DeletableEndpoint | null
  onClose: () => void
  /** Fires after a successful delete. Use to refetch a list, or to
   *  navigate away from a now-stale detail page. */
  onDeleted: () => void
}

export default function DeleteEndpointDialog({ endpoint, onClose, onDeleted }: DeleteEndpointDialogProps) {
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
          <span className="font-medium text-foreground">{endpoint?.name}</span>
          {endpoint?.dnsName ? ` (${endpoint.dnsName})` : ''}? This action cannot be undone.
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
