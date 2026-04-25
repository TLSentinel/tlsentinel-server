import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Network, Clock, MoreVertical, Power, PowerOff } from 'lucide-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import StrixEmpty from '@/components/StrixEmpty'
import SchedulePicker from '@/components/SchedulePicker'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  listDiscoveryNetworks,
  createDiscoveryNetwork,
  updateDiscoveryNetwork,
  deleteDiscoveryNetwork,
  listDiscoveryInbox,
} from '@/api/discovery'
import { listScanners } from '@/api/scanners'
import { can } from '@/api/client'
import type { DiscoveryNetwork, CreateDiscoveryNetworkRequest } from '@/types/api'
import { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, , dow] = parts
  const time =
    hour !== '*' && min !== '*'
      ? ` at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
      : ''
  if (dom === '*' && dow === '*') return `Daily${time}`
  if (dom === '*' && dow !== '*') {
    const n = parseInt(dow)
    const day = !isNaN(n) && n >= 0 && n <= 6 ? DAYS[n] : dow
    return `Weekly (${day})${time}`
  }
  if (dom !== '*' && dow === '*') return `Monthly${time}`
  return expr
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

type SignalColor = 'neutral' | 'green' | 'amber' | 'red'

const SIGNAL_BORDER: Record<SignalColor, string> = {
  neutral: 'border-l-foreground/20',
  green:   'border-l-green-500',
  amber:   'border-l-amber-500',
  red:     'border-l-red-500',
}

const SIGNAL_VALUE: Record<SignalColor, string> = {
  neutral: 'text-foreground',
  green:   'text-green-600',
  amber:   'text-amber-600',
  red:     'text-red-600',
}

function StatCard({
  label,
  value,
  signal = 'neutral',
}: {
  label: string
  value: string | number
  signal?: SignalColor
}) {
  return (
    <div className={`rounded-lg border border-l-4 ${SIGNAL_BORDER[signal]} bg-card p-5 space-y-2`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${SIGNAL_VALUE[signal]}`}>{value}</p>
    </div>
  )
}

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <Network className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <DialogTitle className="text-lg font-semibold">
              {initial ? 'Edit Network' : 'Create Network'}
            </DialogTitle>
            <DialogDescription>
              {initial ? 'Update network configuration' : 'Discover hosts on your network'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="dn-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Network Name
            </Label>
            <Input id="dn-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office-LAN" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dn-range" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              IP Range
            </Label>
            <Input
              id="dn-range"
              value={range}
              onChange={e => setRange(e.target.value)}
              placeholder="10.0.0.0/24 or 192.168.1.1-192.168.1.254"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">CIDR notation or hyphenated range.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dn-ports" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ports
            </Label>
            <Input
              id="dn-ports"
              value={portsRaw}
              onChange={e => setPortsRaw(e.target.value)}
              placeholder="443, 8443, 8080"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of TCP ports to probe.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dn-scanner" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scanner Node
            </Label>
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

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Schedule
            </Label>
            <SchedulePicker value={cron} onChange={setCron} />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch id="dn-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="dn-enabled" className="text-sm">Enabled</Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Create Network'}
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
// Network row + card
// ---------------------------------------------------------------------------

const NETWORK_ROW_GRID = 'grid-cols-[2fr_1.5fr_1fr_1.5fr_1.5fr_6rem_2.5rem]'

// StatusPill renders the enabled/disabled badge — extracted so the desktop
// row and the mobile card show the same visual treatment.
function StatusPill({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase tracking-wide">
        Enabled
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold bg-muted text-muted-foreground uppercase tracking-wide">
      Disabled
    </span>
  )
}

// PortChips renders the ports column / row as a wrapped list of mono chips —
// shared between desktop row and mobile card so chip sizing stays consistent.
function PortChips({ ports }: { ports: number[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ports.map(p => (
        <span key={p} className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
          {p}
        </span>
      ))}
    </div>
  )
}

// NetworkActionsMenu is the row's three-dot menu — extracted so the desktop
// row and the mobile card render the same Edit / Toggle / Delete entries
// without duplicating the JSX.
function NetworkActionsMenu({ network, onEdit, onDelete, onToggle, toggling }: {
  network: DiscoveryNetwork
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  toggling: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggle} disabled={toggling}>
          {network.enabled ? (
            <><PowerOff className="mr-2 h-4 w-4" />Disable</>
          ) : (
            <><Power className="mr-2 h-4 w-4" />Enable</>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface NetworkRowProps {
  network: DiscoveryNetwork
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  toggling: boolean
}

function NetworkRow({ network, canEdit, onEdit, onDelete, onToggle, toggling }: NetworkRowProps) {
  return (
    <div className={`grid ${NETWORK_ROW_GRID} items-center gap-5 px-5 py-4 border-b border-border/40 last:border-0`}>

      {/* Name + icon */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-md bg-muted">
          <Network className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{network.name}</p>
        </div>
      </div>

      {/* IP Range */}
      <div className="min-w-0">
        <span className="inline-block font-mono text-xs bg-muted px-2.5 py-1 rounded truncate max-w-full">
          {network.range}
        </span>
      </div>

      {/* Ports */}
      <PortChips ports={network.ports} />

      {/* Scanner */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 h-2 w-2 rounded-full ${network.scannerId ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
        <span className="text-sm text-muted-foreground truncate">
          {network.scannerName ?? <span className="italic">None</span>}
        </span>
      </div>

      {/* Schedule */}
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground truncate">{describeCron(network.cronExpression)}</span>
      </div>

      {/* Status */}
      <div>
        <StatusPill enabled={network.enabled} />
      </div>

      {/* Actions */}
      {canEdit ? (
        <NetworkActionsMenu
          network={network}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          toggling={toggling}
        />
      ) : (
        <div />
      )}
    </div>
  )
}

// NetworkCard is the mobile-only stacked layout. Networks have the densest
// rows on the discovery surface (range + ports + scanner + schedule), so
// the card uses labelled metadata rows to keep each value readable instead
// of squeezing them into a single grid line.
function NetworkCard({ network, canEdit, onEdit, onDelete, onToggle, toggling }: NetworkRowProps) {
  return (
    <div className="rounded-md border border-border/60 bg-card p-3 space-y-2">
      {/* Top row: icon + name on the left; status pill + actions on the right. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-md bg-muted">
            <Network className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold break-all min-w-0">{network.name}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusPill enabled={network.enabled} />
          {canEdit && (
            <NetworkActionsMenu
              network={network}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggle={onToggle}
              toggling={toggling}
            />
          )}
        </div>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Range:</dt>
          <dd className="min-w-0 break-all">
            <span className="inline-block font-mono text-xs bg-muted px-2.5 py-1 rounded">
              {network.range}
            </span>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Ports:</dt>
          <dd className="min-w-0">
            <PortChips ports={network.ports} />
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Scanner:</dt>
          <dd className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 h-2 w-2 rounded-full ${network.scannerId ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
            <span className="break-words">
              {network.scannerName ?? <span className="italic text-muted-foreground">None</span>}
            </span>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground shrink-0">Schedule:</dt>
          <dd className="flex items-center gap-1.5 min-w-0">
            <Clock className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
            <span className="break-words">{describeCron(network.cronExpression)}</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DiscoveryNetworksPage() {
  const queryClient = useQueryClient()
  const canEdit = can('discovery:edit')

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing]       = useState<DiscoveryNetwork | null>(null)
  const [deleting, setDeleting]     = useState<DiscoveryNetwork | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['discovery-networks'],
    queryFn: () => listDiscoveryNetworks(1, 100),
  })

  const { data: inboxData } = useQuery({
    queryKey: ['discovery-inbox-count'],
    queryFn: () => listDiscoveryInbox(1, 1),
  })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['discovery-networks'] })
  }

  // Toggle-enabled is a one-click action from the kebab; reuses the full
  // update endpoint since the API has no dedicated toggle route.
  const toggleMutation = useMutation({
    mutationFn: (n: DiscoveryNetwork) => updateDiscoveryNetwork(n.id, {
      name: n.name,
      range: n.range,
      ports: n.ports,
      scannerId: n.scannerId,
      cronExpression: n.cronExpression,
      enabled: !n.enabled,
    }),
    onSuccess: refresh,
  })

  const networks     = data?.items ?? []
  const activeCount  = networks.filter(n => n.enabled).length
  const totalCount   = data?.totalCount ?? networks.length
  const inboxTotal   = inboxData?.totalCount ?? null
  const uniquePorts  = new Set(networks.flatMap(n => n.ports)).size

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Discovery Networks</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Configure and monitor automated scanning of your network infrastructure<br />
            to maintain real-time visibility of TLS certificates.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowCreate(true)} className="h-12 px-4 text-base font-semibold">
            <Plus className="mr-1.5 h-4 w-4" />
            Create Network
          </Button>
        )}
      </div>

      {/* Stat cards */}
      {!isLoading && networks.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Active Networks"
            value={activeCount}
            signal={activeCount === 0 ? 'amber' : 'green'}
          />
          <StatCard
            label="Total Networks"
            value={totalCount}
            signal="neutral"
          />
          <StatCard
            label="Discovered Assets"
            value={inboxTotal ?? '—'}
            signal="neutral"
          />
          <StatCard
            label="Unique Ports"
            value={uniquePorts}
            signal="neutral"
          />
        </div>
      )}

      {/* Networks table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>
      ) : networks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <StrixEmpty message="No networks configured yet." />
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Column headers — hidden below md since the mobile card layout
              is self-labelling. */}
          <div className={`hidden md:grid ${NETWORK_ROW_GRID} gap-5 px-5 py-3 border-b border-border/40 bg-muted/40`}>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Network Name</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">IP Range</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ports</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scanner Node</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            {canEdit && <span />}
          </div>

          {/* Mobile: stacked cards. */}
          <div className="space-y-2 p-3 md:hidden">
            {networks.map(net => (
              <NetworkCard
                key={net.id}
                network={net}
                canEdit={canEdit}
                onEdit={() => setEditing(net)}
                onDelete={() => setDeleting(net)}
                onToggle={() => toggleMutation.mutate(net)}
                toggling={toggleMutation.isPending}
              />
            ))}
          </div>
          {/* Desktop: 7-column grid */}
          <div className="hidden md:block">
            {networks.map(net => (
              <NetworkRow
                key={net.id}
                network={net}
                canEdit={canEdit}
                onEdit={() => setEditing(net)}
                onDelete={() => setDeleting(net)}
                onToggle={() => toggleMutation.mutate(net)}
                toggling={toggleMutation.isPending}
              />
            ))}
          </div>
        </div>
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
