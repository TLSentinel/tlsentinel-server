import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, RotateCcw, Save, Copy, Eye, Code2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  listNotificationTemplates,
  updateNotificationTemplate,
  resetNotificationTemplate,
  type NotificationTemplate,
  type TemplateVariable,
} from '@/api/notificationTemplates'

// ─── Constants ───────────────────────────────────────────────────────────────

const channelLabel: Record<string, string> = {
  email: 'Email',
  webhook: 'Webhook',
}

const sampleValues: Record<string, string> = {
  EndpointName:  'api.example.com',
  EndpointType:  'tls',
  CommonName:    'api.example.com',
  NotAfter:      'Thu, 31 Dec 2026 00:00:00 UTC',
  DaysRemaining: '14',
  Fingerprint:   'a3f9b1c2d4e56f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  EndpointHost:  'api.example.com:443',
  ErrorMessage:  'connection refused',
  ErrorSince:    '2026-04-09 10:30 UTC',
}

function renderPreview(template: string): string {
  return template.replace(/\{\{\.(\w+)\}\}/g, (_, key) => sampleValues[key] ?? `{{.${key}}}`)
}

// ─── Variable chip ────────────────────────────────────────────────────────────

function VariableChip({ variable }: { variable: TemplateVariable }) {
  const token = `{{.${variable.name}}}`
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(token).catch(() => {})}
      className="group flex items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors w-full"
      title={`Click to copy ${token}`}
    >
      <Copy className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
      <span>
        <span className="font-mono font-medium">{token}</span>
        <span className="text-muted-foreground ml-1.5">{variable.description}</span>
      </span>
    </button>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function TemplateEditor({
  template,
  onSaved,
  onReset,
}: {
  template: NotificationTemplate
  onSaved: (t: NotificationTemplate) => void
  onReset: (t: NotificationTemplate) => void
}) {
  const [subject, setSubject]   = useState(template.subject ?? '')
  const [body, setBody]         = useState(template.body)
  const [tab, setTab]           = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving]     = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [dirty, setDirty]       = useState(false)

  useEffect(() => {
    setSubject(template.subject ?? '')
    setBody(template.body)
    setDirty(false)
    setError(null)
    setTab('edit')
  }, [template.eventType, template.channel])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const saved = await updateNotificationTemplate(
        template.eventType,
        template.channel,
        template.subject !== null ? subject : null,
        body,
        template.format,
      )
      setDirty(false)
      onSaved(saved)
    } catch {
      setError('Failed to save template.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    setError(null)
    try {
      await resetNotificationTemplate(template.eventType, template.channel)
      const res = await fetch(
        `/api/v1/notification-templates/${template.eventType}/${template.channel}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` } },
      )
      if (res.ok) {
        const t: NotificationTemplate = await res.json()
        setSubject(t.subject ?? '')
        setBody(t.body)
        setDirty(false)
        onReset(t)
      }
    } catch {
      setError('Failed to reset template.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-4">
      {/* Editor / Preview */}
      <div className="space-y-3">
        {/* Subject */}
        {template.subject !== null && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Subject</label>
            <Input
              value={subject}
              onChange={e => { setSubject(e.target.value); setDirty(true) }}
              placeholder="Email subject line"
              className="font-mono text-sm"
            />
          </div>
        )}

        {/* Edit / Preview tabs */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Body</label>
            <div className="flex items-center rounded-md border p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setTab('edit')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                  tab === 'edit' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code2 className="h-3 w-3" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                  tab === 'preview' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
            </div>
          </div>

          {tab === 'edit' ? (
            <Textarea
              value={body}
              onChange={e => { setBody(e.target.value); setDirty(true) }}
              className="font-mono text-sm min-h-96 resize-y"
              spellCheck={false}
            />
          ) : (
            <div className="rounded-md border overflow-hidden bg-white" style={{ minHeight: '24rem' }}>
              <iframe
                srcDoc={renderPreview(body)}
                className="w-full"
                style={{ minHeight: '24rem', border: 'none', display: 'block' }}
                sandbox="allow-same-origin"
                title="Template preview"
                onLoad={e => {
                  const iframe = e.currentTarget
                  const height = iframe.contentDocument?.documentElement.scrollHeight
                  if (height) iframe.style.height = height + 'px'
                }}
              />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={resetting || !template.isCustom}
            className="gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resetting ? 'Resetting…' : 'Reset to default'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Variables panel */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Variables</p>
        <p className="text-xs text-muted-foreground mb-2">Click to copy</p>
        <div className="rounded-md border bg-muted/30 p-1">
          {template.variables.map(v => (
            <VariableChip key={v.name} variable={v} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<NotificationTemplate | null>(null)

  useEffect(() => {
    listNotificationTemplates()
      .then(data => {
        setTemplates(data)
        if (data.length > 0) setSelected(data[0])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleSaved(updated: NotificationTemplate) {
    setTemplates(prev => prev.map(t =>
      t.eventType === updated.eventType && t.channel === updated.channel ? updated : t
    ))
    setSelected(updated)
  }

  function handleReset(updated: NotificationTemplate) {
    setTemplates(prev => prev.map(t =>
      t.eventType === updated.eventType && t.channel === updated.channel ? updated : t
    ))
    setSelected(updated)
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Notification Templates</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Notification Templates</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Customise the subject and body of outbound notifications. Use{' '}
          <code className="text-xs font-mono bg-muted px-1 rounded">{'{{.Variable}}'}</code>{' '}
          placeholders to insert dynamic values. The Preview tab shows a rendered sample.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
          {/* Template picker */}
          <div className="space-y-1">
            {templates.map(t => {
              const isActive = selected?.eventType === t.eventType && selected?.channel === t.channel
              return (
                <button
                  key={`${t.eventType}|${t.channel}`}
                  type="button"
                  onClick={() => setSelected(t)}
                  className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left transition-colors ${
                    isActive
                      ? 'bg-muted font-medium'
                      : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>{t.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-xs py-0">
                      {channelLabel[t.channel] ?? t.channel}
                    </Badge>
                    {t.isCustom && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Customised" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Editor */}
          {selected && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{selected.label}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {channelLabel[selected.channel] ?? selected.channel}
                  </Badge>
                  {selected.isCustom && (
                    <Badge variant="secondary" className="text-xs">Customised</Badge>
                  )}
                </div>
                <CardDescription>
                  Changes take effect on the next notification run.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplateEditor
                  key={`${selected.eventType}|${selected.channel}`}
                  template={selected}
                  onSaved={handleSaved}
                  onReset={handleReset}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
