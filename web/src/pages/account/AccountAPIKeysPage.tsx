import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus, Trash2, Copy, Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { listAPIKeys, createAPIKey, deleteAPIKey, type APIKey } from '@/api/apiKeys'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AccountAPIKeysPage() {
  const [keys, setKeys]           = useState<APIKey[]>([])
  const [loading, setLoading]     = useState(true)
  const [newName, setNewName]     = useState('')
  const [creating, setCreating]   = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // One-time reveal dialog
  const [revealToken, setRevealToken] = useState<string | null>(null)
  const [copied, setCopied]           = useState(false)

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<APIKey | null>(null)
  const [deleting, setDeleting]         = useState(false)

  useEffect(() => {
    listAPIKeys()
      .then(setKeys)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createAPIKey(newName.trim())
      setKeys(prev => [created, ...prev])
      setNewName('')
      setRevealToken(created.token)
    } catch {
      setCreateError('Failed to create API key.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteAPIKey(deleteTarget.id)
      setKeys(prev => prev.filter(k => k.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      // keep dialog open on error
    } finally {
      setDeleting(false)
    }
  }

  function handleCopy() {
    if (!revealToken) return
    navigator.clipboard.writeText(revealToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/account" className="hover:text-foreground">Account</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">API Keys</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Long-lived keys for CLI and automation access. Each key carries your permissions — revoke individually if compromised.
        </p>
      </div>

      {/* Create */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New API Key</CardTitle>
          <CardDescription>Give it a name that describes where it will be used.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Home lab, GitLab CI"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="max-w-sm"
            />
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
          {createError && <p className="mt-2 text-sm text-destructive">{createError}</p>}
        </CardContent>
      </Card>

      {/* Key list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <ul className="divide-y">
              {keys.map(k => (
                <li key={k.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{k.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{k.prefix}…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {formatDate(k.createdAt)}
                      {k.lastUsedAt ? ` · Last used ${formatDate(k.lastUsedAt)}` : ' · Never used'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(k)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* One-time reveal dialog */}
      <Dialog open={!!revealToken} onOpenChange={() => { setRevealToken(null); setCopied(false) }}>
        <DialogContent className="sm:max-w-3xl">
          <div className="flex items-center gap-4">
            <img
              src="/strix.png"
              alt="Strix the owl"
              className="w-16 shrink-0 opacity-80 select-none"
              draggable={false}
            />
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">API Key Created</DialogTitle>
              <DialogDescription>
                Copy your key now — it won't be shown again.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono whitespace-nowrap overflow-x-auto">
              {revealToken}
            </code>
            <Button variant="outline" size="icon" className="shrink-0" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => { setRevealToken(null); setCopied(false) }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> will be immediately invalidated. Any tools using it will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
