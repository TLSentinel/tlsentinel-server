import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEndpoint } from '@/api/endpoints'
import { listScanners } from '@/api/scanners'
import { resolve } from '@/api/utils'
import { ApiError } from '@/types/api'
import type { ScannerToken } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Globe, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EndpointType = 'host' | 'saml' | 'manual'

interface TypeOption {
  value: EndpointType
  label: string
  description: string
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    value: 'host',
    label: 'Host',
    description: 'TLS endpoint — monitors a server certificate via the scanner',
  },
  {
    value: 'saml',
    label: 'SAML Metadata',
    description: 'Identity provider — monitors certificates in federation metadata',
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Manually tracked — link a certificate directly, no scanning',
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EndpointFormPage() {
  const navigate = useNavigate()

  const [type, setType]             = useState<EndpointType>('host')
  const [name, setName]             = useState('')
  const [dnsName, setDnsName]       = useState('')
  const [port, setPort]             = useState('443')
  const [ipAddress, setIpAddress]   = useState('')
  const [url, setUrl]               = useState('')
  const [scannerID, setScannerID]   = useState('')
  const [notes, setNotes]           = useState('')

  const [scanners, setScanners]     = useState<ScannerToken[]>([])
  const [resolving, setResolving]   = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    listScanners().then(setScanners).catch(() => {})
  }, [])

  // Clear type-specific fields when switching type so nothing stale leaks through.
  function handleTypeChange(next: EndpointType) {
    setType(next)
    setError(null)
    setResolveError(null)
  }

  async function handleResolve() {
    const hostname = dnsName.trim()
    if (!hostname) return
    setResolving(true)
    setResolveError(null)
    try {
      const result = await resolve(hostname)
      if (result.addresses.length > 0) {
        setIpAddress(result.addresses[0])
      } else {
        setResolveError('No addresses returned for this hostname.')
      }
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : 'DNS resolution failed.')
    } finally {
      setResolving(false)
    }
  }

  async function handleSave() {
    setError(null)

    if (!name.trim()) {
      setError('Name is required.')
      return
    }

    if (type === 'host') {
      if (!dnsName.trim()) { setError('DNS Name is required.'); return }
      const parsedPort = parseInt(port, 10)
      if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        setError('Port must be between 1 and 65535.')
        return
      }
    }

    if (type === 'saml' && !url.trim()) {
      setError('Metadata URL is required.')
      return
    }

    setSaving(true)
    try {
      const sid = scannerID || undefined
      const notesVal = notes.trim() || undefined

      const endpoint = await createEndpoint({
        name: name.trim(),
        type,
        ...(type === 'host' && {
          dnsName: dnsName.trim(),
          port: parseInt(port, 10),
          ipAddress: ipAddress.trim() || undefined,
        }),
        ...(type === 'saml' && {
          url: url.trim(),
        }),
        scannerId: type !== 'manual' ? sid : undefined,
        notes: notesVal,
      })

      navigate(`/endpoints/${endpoint.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create endpoint.')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/endpoints')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">New Endpoint</h1>
      </div>

      {/* Common fields — name and notes apply to all types */}
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="ep-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ep-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production API, Okta IdP, Internal Root CA"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ep-notes">
            Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="ep-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={"Owner, support contact, runbook link…\n\nMarkdown is supported."}
            rows={5}
          />
        </div>
      </div>

      {/* Type selector */}
      <div>
        <p className="text-sm font-medium mb-3">Endpoint Type</p>
        <div className="grid grid-cols-3 gap-3">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTypeChange(opt.value)}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors',
                type === opt.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30',
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-snug">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Type-specific fields */}
      {type !== 'manual' && (
        <div className="space-y-5">
          {/* Host-specific fields */}
          {type === 'host' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ep-dns">
                  DNS Name <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="ep-dns"
                    value={dnsName}
                    onChange={(e) => { setDnsName(e.target.value); setResolveError(null) }}
                    placeholder="api.example.com"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResolve}
                    disabled={!dnsName.trim() || resolving}
                    className="shrink-0"
                  >
                    {resolving
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <Globe className="mr-1.5 h-3.5 w-3.5" />
                    }
                    Resolve
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ep-ip">
                  IP Address <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="ep-ip"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="1.2.3.4"
                />
                {resolveError && (
                  <p className="text-xs text-destructive">{resolveError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ep-port">Port</Label>
                <Input
                  id="ep-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-28"
                />
              </div>
            </>
          )}

          {/* SAML-specific fields */}
          {type === 'saml' && (
            <div className="space-y-1.5">
              <Label htmlFor="ep-url">
                Metadata URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ep-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://login.microsoftonline.com/.../federationmetadata.xml"
              />
              <p className="text-xs text-muted-foreground">
                The IdP federation metadata XML endpoint. Must be publicly accessible by the scanner.
              </p>
            </div>
          )}

          {/* Scanner — host and saml */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-scanner">Scanner</Label>
            <select
              id="ep-scanner"
              value={scannerID}
              onChange={(e) => setScannerID(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Default</option>
              {scanners.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Manual — informational only */}
      {type === 'manual' && (
        <p className="text-sm text-muted-foreground">
          No additional configuration needed. Once created, link a certificate from the endpoint detail page.
        </p>
      )}

      {/* Footer */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => navigate('/endpoints')} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Creating…' : 'Create Endpoint'}
        </Button>
      </div>
    </div>
  )
}
