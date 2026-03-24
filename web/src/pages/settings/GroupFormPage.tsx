import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getGroup, getGroupHostIDs, createGroup, updateGroup } from '@/api/groups'
import { listHosts } from '@/api/hosts'
import type { HostListItem } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Add Hosts dialog — debounced server-side search
// ---------------------------------------------------------------------------

interface AddHostsDialogProps {
  open: boolean
  onClose: () => void
  selectedIDs: Set<string>
  onAdd: (host: HostListItem) => void
}

function AddHostsDialog({ open, onClose, selectedIDs, onAdd }: AddHostsDialogProps) {
  const [search, setSearch]     = useState('')
  const [results, setResults]   = useState<HostListItem[]>([])
  const [loading, setLoading]   = useState(false)
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) { setSearch(''); setResults([]); return }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!search.trim()) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await listHosts(1, 50, search.trim())
        setResults(res.items.filter(h => !selectedIDs.has(h.id)))
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, selectedIDs])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Hosts</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search by name or DNS…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
            {!search.trim() ? (
              <p className="text-sm text-muted-foreground text-center py-6">Type to search hosts.</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No hosts found.</p>
            ) : results.map(h => (
              <button
                key={h.id}
                onClick={() => { onAdd(h); setSearch(''); setResults([]) }}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-left transition-colors hover:bg-muted/50"
              >
                <div>
                  <span className="font-medium">{h.name}</span>
                  <span className="ml-2 text-muted-foreground font-mono text-xs">{h.dnsName}:{h.port}</span>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GroupFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()

  const [name, setName]                   = useState('')
  const [description, setDescription]     = useState('')
  const [selectedHosts, setSelectedHosts] = useState<HostListItem[]>([])
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [loading, setLoading]             = useState(isEdit)

  const load = useCallback(async () => {
    try {
      if (!isEdit) return
      const [group, hostIDs, hostList] = await Promise.all([
        getGroup(id!),
        getGroupHostIDs(id!),
        listHosts(1, 200),
      ])
      setName(group.name)
      setDescription(group.description ?? '')
      setSelectedHosts(hostList.items.filter(h => hostIDs.includes(h.id)))
    } finally {
      setLoading(false)
    }
  }, [id, isEdit])

  useEffect(() => { load() }, [load])

  function addHost(host: HostListItem) {
    setSelectedHosts(prev => prev.some(h => h.id === host.id) ? prev : [...prev, host])
  }

  function removeHost(hostID: string) {
    setSelectedHosts(prev => prev.filter(h => h.id !== hostID))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const req = {
        name: name.trim(),
        description: description.trim() || null,
        hostIds: selectedHosts.map(h => h.id),
      }
      if (isEdit) {
        await updateGroup(id!, req)
      } else {
        await createGroup(req)
      }
      navigate('/settings/groups')
    } catch {
      setError(`Failed to ${isEdit ? 'update' : 'create'} group.`)
      setSaving(false)
    }
  }

  const selectedIDs = new Set(selectedHosts.map(h => h.id))

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings/groups')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">{isEdit ? 'Edit Group' : 'New Group'}</h1>
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="g-name">Name</Label>
            <Input
              id="g-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apps Team"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-desc">
              Description <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="g-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this group monitor?"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Hosts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Hosts
            {selectedHosts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">{selectedHosts.length}</span>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Hosts
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {selectedHosts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hosts assigned. Click Add Hosts to get started.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="w-[52px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedHosts.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{h.dnsName}:{h.port}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeHost(h.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove {h.name}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => navigate('/settings/groups')} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Group'}
        </Button>
      </div>

      <AddHostsDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedIDs={selectedIDs}
        onAdd={addHost}
      />
    </div>
  )
}
