import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import StrixEmpty from '@/components/StrixEmpty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  listDiscoveryNetworks,
  createDiscoveryNetwork,
  updateDiscoveryNetwork,
  deleteDiscoveryNetwork,
} from '@/api/discovery'
import { listScanners } from '@/api/scanners'
import { can } from '@/api/client'
import type { DiscoveryNetwork, CreateDiscoveryNetworkRequest } from '@/types/api'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Network form dialog (create + edit)
// ---------------------------------------------------------------------------

interface NetworkDialogProps {
  open: boolean
  initial?: DiscoveryNetwork
  onClose: () => void
  onSaved: () => void
}

function NetworkDialog({ open, initial, onClose, onSaved }: NetworkDialogProps) {
  const [name, setName]           = useState('')
  const [range, setRange]         = useState('')
  const [portsRaw, setPortsRaw]   = useState('443')
  const [scannerId, setScannerId] = useState<string>('none')
  const [cron, setCron]           = useState('0 2 * * *')
  const [enabled, setEnabled]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const { data: scanners = [] } = useQuery({
    queryKey: ['scanners'],
    queryFn: listScanners,
  })

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setRange(initial?.range ?? '')
      setPortsRaw(initial?.ports.join(', ') ?? '443')
      setScannerId(initial?.scannerId ?? 'none')
      setCron(initial?.cronExpression ?? '0 2 * * *')
      setEnabled(initial?.enabled ?? true)
      setError(null)
    }
  }, [open, initial])

  function parsePorts(): number[] | null {
    const parts = portsRaw.split(/[\s,]+/).filter(Boolean)
    const ports: number[] = []
    for (const p of parts) {
      const n = parseInt(p, 10)
      if (isNaN(n) || n < 1 || n > 65535) return null
      ports.push(n)
    }
    return ports.length > 0 ? ports : null
  }

  async function handleSave() {
    const ports = parsePorts()
    if (!name.trim())  { setError('Name is required.'); return }
    if (!range.trim()) { setError('Range is required.'); return }
    if (!ports)        { setError('Ports must be valid numbers between 1–65535.'); return }
    if (!cron.trim())  { setError('Cron expression is required.'); return }

    const req: CreateDiscoveryNetworkRequest = {
      name: name.trim(),
      range: range.trim(),
      ports,
      scannerId: scannerId === 'none' ? null : scannerId,
      cronExpression: cron.trim(),
      enabled,
    }

    setSaving(true)
    setError(null)
    try {
      if (initial) {
        await updateDiscoveryNetwork(initial.id, req)
      } else {
        await createDiscoveryNetwork(req)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'An unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Network' : 'Add Network'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dn-name">Name</Label>
            <Input id="dn-name" value={name} onChange={e => setName(e.target.value)} placeholder="Office LAN" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dn-range">Range</Label>
            <Input
              id="dn-range"
              value={range}
              onChange={e => setRange(e.target.value)}
              placeholder="10.0.0.0/24 or 192.168.1.1-192.168.1.254"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">CIDR notation or hyphenated range.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dn-ports">Ports</Label>
            <Input
              id="dn-ports"
              value={portsRaw}
              onChange={e => setPortsRaw(e.target.value)}
              placeholder="443, 8443, 8080"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of TCP ports to probe.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dn-scanner">Scanner</Label>
            <Select value={scannerId} onValueChange={setScannerId}>
              <SelectTrigger id="dn-scanner">
                <SelectValue placeholder="Select scanner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {scanners.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dn-cron">Schedule (cron)</Label>
            <Input
              id="dn-cron"
              value={cron}
              onChange={e => setCron(e.target.value)}
              placeholder="0 2 * * *"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Standard 5-field cron expression.</p>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="dn-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="dn-enabled">Enabled</Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add network'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  network: DiscoveryNetwork | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ network, onClose, onDeleted }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleDelete() {
    if (!network) return
    setDeleting(true)
    setError(null)
    try {
      await deleteDiscoveryNetwork(network.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'An unexpected error occurred.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={!!network} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Network</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete <strong>{network?.name}</strong>? All discovered hosts in the inbox from this network will also be deleted.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DiscoveryNetworksPage() {
  const queryClient = useQueryClient()
  const canEdit = can('discovery:edit')

  const [showCreate, setShowCreate]       = useState(false)
  const [editing, setEditing]             = useState<DiscoveryNetwork | null>(null)
  const [deleting, setDeleting]           = useState<DiscoveryNetwork | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['discovery-networks'],
    queryFn: () => listDiscoveryNetworks(1, 100),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['discovery-networks'] })
  }

  const networks = data?.items ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Networks</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Network ranges scanned for TLS endpoints by your discovery scanner.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Network
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>
      ) : networks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <StrixEmpty message="No networks configured yet." />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Range</TableHead>
              <TableHead>Ports</TableHead>
              <TableHead>Scanner</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-b-0">
            {networks.map(net => (
              <TableRow key={net.id}>
                <TableCell className="font-medium">{net.name}</TableCell>
                <TableCell className="font-mono text-sm">{net.range}</TableCell>
                <TableCell className="font-mono text-sm">{net.ports.join(', ')}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {net.scannerName ?? <span className="italic">None</span>}
                </TableCell>
                <TableCell className="font-mono text-sm">{net.cronExpression}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${net.enabled ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                    {net.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(net)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(net)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NetworkDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => { setShowCreate(false); refresh() }}
      />
      <NetworkDialog
        open={!!editing}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh() }}
      />
      <DeleteDialog
        network={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => { setDeleting(null); refresh() }}
      />
    </div>
  )
}
