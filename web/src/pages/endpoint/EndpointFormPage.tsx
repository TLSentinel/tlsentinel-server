import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createEndpoint, getEndpoint, updateEndpoint, linkCertificate } from '@/api/endpoints'
import { listScanners } from '@/api/scanners'
import { resolve } from '@/api/utils'
import { listTagCategories, getEndpointTags, setEndpointTags } from '@/api/tags'
import { ApiError } from '@/types/api'
import type { ScannerToken, CategoryWithTags } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, FolderOpen, Globe, Loader2, Tag, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { categoryColor } from '@/lib/tag-colors'
import { useQuery } from '@tanstack/react-query'

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
// Page — handles both create (/endpoints/new) and edit (/endpoints/:id/edit)
// ---------------------------------------------------------------------------

export default function EndpointFormPage() {
  const navigate          = useNavigate()
  const { id }            = useParams<{ id: string }>()
  const [searchParams]    = useSearchParams()
  const cloneId           = !id ? (searchParams.get('clone') ?? undefined) : undefined
  const isEdit            = Boolean(id)
  const isClone           = Boolean(cloneId)

  const [loadError, setLoadError]   = useState<string | null>(null)
  const [formReady, setFormReady]   = useState(!isEdit && !isClone)

  const [type, setType]             = useState<EndpointType>('host')
  const [name, setName]             = useState('')
  const [dnsName, setDnsName]       = useState('')
  const [port, setPort]             = useState('443')
  const [ipAddress, setIpAddress]   = useState('')
  const [url, setUrl]               = useState('')
  const [scannerID, setScannerID]   = useState('')
  const [enabled, setEnabled]       = useState(true)
  const [scanExempt, setScanExempt] = useState(false)
  const [notes, setNotes]           = useState('')

  const [pem, setPem]                   = useState('')
  const [fileName, setFileName]         = useState<string | null>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [resolving, setResolving]         = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // Load scanners and tag categories via useQuery
  const { data: scannersData } = useQuery({
    queryKey: ['scanners'],
    queryFn: listScanners,
  })
  const scanners: ScannerToken[] = scannersData ?? []

  const { data: categoriesData } = useQuery({
    queryKey: ['tag-categories'],
    queryFn: listTagCategories,
  })
  const categories: CategoryWithTags[] = categoriesData ?? []

  // Load existing endpoint in edit mode
  useEffect(() => {
    if (!id) return
    getEndpoint(id)
      .then((ep) => {
        setType(ep.type as EndpointType)
        setName(ep.name)
        setDnsName(ep.dnsName ?? '')
        setPort(String(ep.port ?? 443))
        setIpAddress(ep.ipAddress ?? '')
        setUrl(ep.url ?? '')
        setScannerID(ep.scannerId ?? '')
        setEnabled(ep.enabled)
        setScanExempt(ep.scanExempt ?? false)
        setNotes(ep.notes ?? '')
        setPem('')  // PEM field always starts blank; only filled to replace/set a cert
        setFormReady(true)
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load endpoint.'))
    getEndpointTags(id).then(tags => {
      setSelectedTagIds(new Set(tags.map(t => t.id)))
    }).catch(() => {})
  }, [id])

  // Pre-fill from a source endpoint in clone mode
  useEffect(() => {
    if (!cloneId) return
    getEndpoint(cloneId)
      .then((ep) => {
        setType(ep.type as EndpointType)
        setName(`Copy of ${ep.name}`)
        setDnsName(ep.dnsName ?? '')
        setPort(String(ep.port ?? 443))
        setIpAddress(ep.ipAddress ?? '')
        setUrl(ep.url ?? '')
        setScannerID(ep.scannerId ?? '')
        setEnabled(true)
        setNotes(ep.notes ?? '')
        setPem('')
        setFormReady(true)
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load source endpoint.'))
    getEndpointTags(cloneId).then(tags => {
      setSelectedTagIds(new Set(tags.map(t => t.id)))
    }).catch(() => {})
  }, [cloneId])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPem((ev.target?.result as string) ?? '')
      setError(null)
    }
    reader.onerror = () => setError('Failed to read file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleTypeChange(next: EndpointType) {
    if (isEdit) return  // type is locked on edit
    setType(next)
    setError(null)
    setResolveError(null)
    if (next !== 'manual') { setPem(''); setFileName(null) }
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
      const sid      = scannerID || undefined
      const notesVal = notes.trim() || undefined

      const pemVal = pem.trim()

      if (isEdit && id) {
        await updateEndpoint(id, {
          name: name.trim(),
          type,
          enabled,
          scanExempt,
          scannerId: type !== 'manual' ? sid : undefined,
          notes: notesVal,
          ...(type === 'host' && {
            dnsName:   dnsName.trim(),
            port:      parseInt(port, 10),
            ipAddress: ipAddress.trim() || undefined,
          }),
          ...(type === 'saml' && {
            url: url.trim(),
          }),
        })
        if (type === 'manual' && pemVal) {
          await linkCertificate(id, pemVal)
        }
        await setEndpointTags(id, Array.from(selectedTagIds))
        navigate(`/endpoints/${id}`)
      } else {
        const endpoint = await createEndpoint({
          name: name.trim(),
          type,
          ...(type === 'host' && {
            dnsName:   dnsName.trim(),
            port:      parseInt(port, 10),
            ipAddress: ipAddress.trim() || undefined,
          }),
          ...(type === 'saml' && {
            url: url.trim(),
          }),
          scannerId: type !== 'manual' ? sid : undefined,
          notes: notesVal,
        })
        if (type === 'manual' && pemVal) {
          await linkCertificate(endpoint.id, pemVal)
        }
        if (selectedTagIds.size > 0) {
          await setEndpointTags(endpoint.id, Array.from(selectedTagIds))
        }
        navigate(`/endpoints/${endpoint.id}`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : isEdit ? 'Failed to save endpoint.' : 'Failed to create endpoint.')
      setSaving(false)
    }
  }

  function handleCancel() {
    navigate(isEdit && id ? `/endpoints/${id}` : '/endpoints')
  }

  const pageTitle = isEdit ? 'Edit Endpoint' : isClone ? 'Clone Endpoint' : 'New Endpoint'

  // Loading state
  if ((isEdit || isClone) && !formReady && !loadError) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">{pageTitle}</h1>
        </div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">{pageTitle}</h1>
        </div>
        <p className="text-sm text-destructive">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">{pageTitle}</h1>
      </div>

      {/* Common fields */}
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

      {/* Tags */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <Label>Tags <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Selected tag chips */}
            {Array.from(selectedTagIds).map(tagId => {
              const tag = categories.flatMap(c => c.tags).find(t => t.id === tagId)
              if (!tag) return null
              const cat = categories.find(c => c.id === tag.categoryId)
              return (
                <span
                  key={tagId}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryColor(tag.categoryId)}`}
                >
                  <span className="opacity-60">{cat?.name}:</span>
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => setSelectedTagIds(prev => { const n = new Set(prev); n.delete(tagId); return n })}
                    className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${tag.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
            {/* Add tags button */}
            <button
              type="button"
              onClick={() => setShowTagPicker(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
            >
              <Tag className="h-3 w-3" />
              <Plus className="h-3 w-3" />
              Add tags
            </button>
          </div>
        </div>
      )}

      {/* Tag picker dialog */}
      <Dialog open={showTagPicker} onOpenChange={setShowTagPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-80 overflow-y-auto py-1">
            {categories.map(cat => (
              <div key={cat.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.name}</p>
                <div className="space-y-1">
                  {cat.tags.map(tag => {
                    const selected = selectedTagIds.has(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setSelectedTagIds(prev => {
                          const next = new Set(prev)
                          if (next.has(tag.id)) next.delete(tag.id)
                          else next.add(tag.id)
                          return next
                        })}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                          selected
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted',
                        )}
                      >
                        <span className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}>
                          {selected && (
                            <svg viewBox="0 0 8 6" className="h-2.5 w-2.5 fill-current">
                              <path d="M1 3l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTagPicker(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Type selector — clickable on create, read-only on edit */}
      <div>
        <p className="text-sm font-medium mb-3">Endpoint Type</p>
        <div className="grid grid-cols-3 gap-3">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTypeChange(opt.value)}
              disabled={isEdit}
              className={cn(
                'flex flex-col items-start rounded-lg border p-4 text-left transition-colors',
                type === opt.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border',
                isEdit
                  ? 'cursor-default opacity-60'
                  : 'hover:border-muted-foreground/40 hover:bg-muted/30',
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-snug">{opt.description}</p>
            </button>
          ))}
        </div>
        {isEdit && (
          <p className="mt-2 text-xs text-muted-foreground">Type cannot be changed after creation.</p>
        )}
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

      {/* Manual — PEM field */}
      {type === 'manual' && (
        <div className="space-y-1.5">
          <Label htmlFor="ep-pem">
            Certificate <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="ep-pem"
            value={pem}
            onChange={(e) => { setPem(e.target.value); setFileName(null) }}
            placeholder={"-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"}
            rows={6}
            className="font-mono text-xs"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pem,.crt,.cer,.cert,.der"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {fileName ?? 'Browse file…'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Paste or browse for a PEM-encoded certificate to link it now, or leave blank to link one later from the edit page.
          </p>
        </div>
      )}

      {/* Enabled / Scan Exempt toggles — edit mode only */}
      {isEdit && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="ep-scan-exempt"
              checked={scanExempt}
              onCheckedChange={setScanExempt}
            />
            <div>
              <Label htmlFor="ep-scan-exempt" className="cursor-pointer">Exclude from scanning</Label>
              <p className="text-xs text-muted-foreground">No scanner will probe this endpoint. Certs can still be linked manually.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="ep-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="ep-enabled" className="cursor-pointer">Enabled</Label>
          </div>
        </div>
      )}

      {/* Footer */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving
            ? (isEdit ? 'Saving…' : 'Creating…')
            : (isEdit ? 'Save Changes' : 'Create Endpoint')
          }
        </Button>
      </div>
    </div>
  )
}
