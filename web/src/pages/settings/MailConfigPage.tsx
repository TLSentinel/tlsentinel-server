import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getMailConfig, saveMailConfig, testMailConfig } from '@/api/mail'
import { ApiError } from '@/types/api'

type AuthType = 'none' | 'plain' | 'login'
type TLSMode = 'none' | 'starttls' | 'tls'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          variant={value === opt.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MailConfigPage() {
  // Form state — mirrors MailConfig
  const [enabled, setEnabled] = useState(false)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [authType, setAuthType] = useState<AuthType>('plain')
  const [smtpUsername, setSmtpUsername] = useState('')
  const [password, setPassword] = useState('')
  // 'keep' = a password is already stored; show placeholder and "Change" link.
  // 'change' = show the actual input field.
  const [passwordMode, setPasswordMode] = useState<'keep' | 'change'>('change')
  const [fromAddress, setFromAddress] = useState('')
  const [fromName, setFromName] = useState('')
  const [tlsMode, setTlsMode] = useState<TLSMode>('starttls')

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // -------------------------------------------------------------------------
  // Load config on mount
  // -------------------------------------------------------------------------
  const { data: mailConfig, isLoading } = useQuery({
    queryKey: ['mail-config'],
    queryFn: getMailConfig,
  })

  useEffect(() => {
    if (!mailConfig) return
    setEnabled(mailConfig.enabled)
    setSmtpHost(mailConfig.smtpHost)
    setSmtpPort(mailConfig.smtpPort || 587)
    setAuthType((mailConfig.authType as AuthType) || 'plain')
    setSmtpUsername(mailConfig.smtpUsername)
    setFromAddress(mailConfig.fromAddress)
    setFromName(mailConfig.fromName)
    setTlsMode((mailConfig.tlsMode as TLSMode) || 'starttls')
    if (mailConfig.passwordSet) {
      setPasswordMode('keep')
    }
  }, [mailConfig])

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setTestResult(null)
    try {
      await saveMailConfig({
        enabled,
        smtpHost: smtpHost.trim(),
        smtpPort,
        authType,
        smtpUsername: authType !== 'none' ? smtpUsername.trim() : '',
        smtpPassword: authType !== 'none' && passwordMode === 'change' ? password : '',
        fromAddress: fromAddress.trim(),
        fromName: fromName.trim(),
        tlsMode,
      })
      // After a successful save with a new password, flip back to 'keep' mode.
      if (passwordMode === 'change' && password) {
        setPasswordMode('keep')
        setPassword('')
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save mail config.')
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Test
  // -------------------------------------------------------------------------
  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      await testMailConfig(testRecipient.trim() || undefined)
      const to = testRecipient.trim() || fromAddress
      setTestResult({ ok: true, message: `Test email sent to ${to}.` })
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof ApiError ? err.message : 'Test email failed.',
      })
    } finally {
      setTesting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
    )
  }

  const authRequired = authType !== 'none'

  return (
    <div className="space-y-6 max-w-2xl">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Settings</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Email / SMTP</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Email / SMTP</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure outbound mail for certificate expiry and scan alerts.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Enable email alerts</p>
            <p className="text-sm text-muted-foreground">
              When disabled, no emails will be sent regardless of other settings.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Server */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Server
          </h2>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>TLS Mode</Label>
            <ToggleGroup<TLSMode>
              value={tlsMode}
              options={[
                { value: 'starttls', label: 'STARTTLS' },
                { value: 'tls', label: 'TLS / SSL' },
                { value: 'none', label: 'None' },
              ]}
              onChange={setTlsMode}
            />
          </div>
        </div>

        {/* Authentication */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Authentication
          </h2>

          <div className="space-y-1.5">
            <Label>Auth Type</Label>
            <ToggleGroup<AuthType>
              value={authType}
              options={[
                { value: 'plain', label: 'PLAIN' },
                { value: 'login', label: 'LOGIN' },
                { value: 'none', label: 'None' },
              ]}
              onChange={setAuthType}
            />
          </div>

          {authRequired && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">Username</Label>
                <Input
                  id="smtp-user"
                  value={smtpUsername}
                  onChange={(e) => setSmtpUsername(e.target.value)}
                  placeholder="alerts@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp-pass">Password</Label>
                {passwordMode === 'keep' ? (
                  <div className="flex items-center gap-3">
                    <Input
                      id="smtp-pass"
                      type="password"
                      value="placeholder"
                      disabled
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPasswordMode('change')
                        setPassword('')
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Input
                      id="smtp-pass"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="flex-1"
                      autoFocus
                    />
                    {passwordMode === 'change' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPasswordMode('keep')
                          setPassword('')
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* From */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sender
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from-address">From Address</Label>
              <Input
                id="from-address"
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="certmonitor@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from-name">Display Name</Label>
              <Input
                id="from-name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="TLSentinel"
              />
            </div>
          </div>
        </div>

        {/* Errors */}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        {/* Test result */}
        {testResult && (
          <div
            className={[
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              testResult.ok
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-destructive/30 bg-destructive/5 text-destructive',
            ].join(' ')}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            {testResult.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {/* Test email */}
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Send Test Email</p>
            <p className="text-sm text-muted-foreground">
              Verify your SMTP settings by sending a test message. Defaults to the from address if left blank.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder={fromAddress || 'recipient@example.com'}
              className="flex-1"
              disabled={!enabled}
            />
            <Button
              type="button"
              variant="outline"
              disabled={testing || !enabled}
              onClick={handleTest}
              title={!enabled ? 'Enable mail to send a test email' : undefined}
            >
              {testing ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
