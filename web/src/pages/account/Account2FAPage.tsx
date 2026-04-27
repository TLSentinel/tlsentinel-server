import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { ShieldCheck, ShieldAlert, AlertTriangle, Copy, Check, RefreshCw } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FIELD_LABEL } from '@/lib/utils'
import { Breadcrumb } from '@/components/Breadcrumb'

import { getMe } from '@/api/users'
import {
  getTOTPStatus,
  beginTOTPSetup,
  confirmTOTPSetup,
  disableTOTP,
  regenerateTOTPRecoveryCodes,
} from '@/api/totp'
import type { TOTPStatus } from '@/types/api'

export default function Account2FAPage() {
  const [isLocal, setIsLocal] = useState<boolean | null>(null)
  const [status, setStatus] = useState<TOTPStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // Setup flow
  const [setupURI, setSetupURI] = useState<string | null>(null)
  const [setupSecret, setSetupSecret] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Recovery codes — shown right after a successful enable / regenerate
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  // Disable / regenerate dialogs
  const [disableOpen, setDisableOpen] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)

  useEffect(() => {
    void (async () => {
      const me = await getMe()
      setIsLocal(me.provider === 'local')
      if (me.provider === 'local') {
        const s = await getTOTPStatus()
        setStatus(s)
      }
      setLoading(false)
    })()
  }, [])

  // SSO accounts get MFA from their identity provider — bounce them out so
  // they don't see a control they can't actually use.
  if (isLocal === false) return <Navigate to="/account" replace />
  if (loading || isLocal === null || status === null) return null

  async function startSetup() {
    setSetupError(null)
    setVerifyCode('')
    try {
      const setup = await beginTOTPSetup()
      setSetupURI(setup.uri)
      setSetupSecret(setup.secret)
      const dataUrl = await QRCode.toDataURL(setup.uri, { margin: 1, width: 240 })
      setQrDataUrl(dataUrl)
    } catch {
      setSetupError('Failed to start setup. Try again.')
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault()
    setSetupError(null)
    setSubmitting(true)
    try {
      const res = await confirmTOTPSetup(verifyCode.trim())
      setRecoveryCodes(res.recoveryCodes)
      // Clear the in-flight setup state — we're now enabled.
      setSetupURI(null)
      setSetupSecret(null)
      setQrDataUrl(null)
      setVerifyCode('')
      const s = await getTOTPStatus()
      setStatus(s)
    } catch {
      setSetupError('Invalid code. Make sure your phone clock is correct and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function cancelSetup() {
    setSetupURI(null)
    setSetupSecret(null)
    setQrDataUrl(null)
    setVerifyCode('')
    setSetupError(null)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumb items={[
        { label: 'My Account', to: '/account' },
        { label: 'Two-Factor Authentication' },
      ]} />

      <div>
        <h1 className="text-2xl font-semibold">Two-Factor Authentication</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Add a second factor to your account. After signing in with your password, you'll be asked for a 6-digit code from your authenticator app.
        </p>
      </div>

      {/* Active status card */}
      {status.enabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              Two-Factor Authentication is on
            </CardTitle>
            <CardDescription>
              {status.remainingRecoveryCodes} recovery code{status.remainingRecoveryCodes === 1 ? '' : 's'} remaining.
              {status.remainingRecoveryCodes <= 2 && ' Regenerate a new set soon — running out locks you out if you lose your device.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setRegenOpen(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate recovery codes
            </Button>
            <Button variant="destructive" onClick={() => setDisableOpen(true)}>
              Disable two-factor
            </Button>
          </CardContent>
        </Card>
      ) : setupURI ? (
        <Card>
          <CardHeader>
            <CardTitle>Scan the QR code</CardTitle>
            <CardDescription>
              Open your authenticator app (Google Authenticator, Authy, 1Password, …) and scan the code below. Then type the 6-digit code your app shows to confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-6">
              {qrDataUrl && <img src={qrDataUrl} alt="TOTP QR code" className="h-60 w-60 rounded bg-white p-2" />}
              {setupSecret && (
                <details className="w-full">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Can't scan? Show secret for manual entry.</summary>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 break-all rounded border bg-background px-2 py-1.5 font-mono text-xs">{setupSecret}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => navigator.clipboard.writeText(setupSecret)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </details>
              )}
            </div>

            <form onSubmit={confirmSetup} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="totp-verify" className={FIELD_LABEL}>6-digit code</Label>
                <Input
                  id="totp-verify"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoFocus
                  required
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="font-mono tracking-[0.3em] text-lg"
                />
              </div>

              {setupError && <p className="text-sm text-destructive">{setupError}</p>}

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={cancelSetup} disabled={submitting}>Cancel</Button>
                <Button type="submit" disabled={submitting || verifyCode.length !== 6}>
                  {submitting ? 'Verifying…' : 'Verify and enable'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Two-Factor Authentication is off
            </CardTitle>
            <CardDescription>
              Strongly recommended. Without it, anyone who learns your password can sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startSetup}>
              Set up two-factor
            </Button>
          </CardContent>
        </Card>
      )}

      <RecoveryCodesDialog codes={recoveryCodes} onClose={() => setRecoveryCodes(null)} />
      <DisableDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        onDisabled={async () => {
          setDisableOpen(false)
          const s = await getTOTPStatus()
          setStatus(s)
        }}
      />
      <RegenerateDialog
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        onRegenerated={async (codes) => {
          setRegenOpen(false)
          setRecoveryCodes(codes)
          const s = await getTOTPStatus()
          setStatus(s)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// One-time recovery-codes reveal
// ---------------------------------------------------------------------------

function RecoveryCodesDialog({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  if (!codes) return null

  const text = codes.join('\n')
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  function download() {
    const blob = new Blob([text + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tlsentinel-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={!!codes} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save your recovery codes</DialogTitle>
          <DialogDescription>
            Each code works once and lets you sign in if you lose your authenticator device. Store them somewhere safe — they will not be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 font-mono text-sm">
          {codes.map(c => <span key={c} className="select-all">{c}</span>)}
        </div>
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>You won't be able to view these codes again. Generating a new set invalidates this one.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={download}>Download .txt</Button>
          <Button onClick={copy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Copied' : 'Copy all'}
          </Button>
          <Button variant="default" onClick={onClose}>I saved them</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Disable dialog — requires password + current code (or recovery code)
// ---------------------------------------------------------------------------

function DisableDialog({
  open,
  onClose,
  onDisabled,
}: {
  open: boolean
  onClose: () => void
  onDisabled: () => void
}) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) { setPassword(''); setCode(''); setError(null); setSubmitting(false) }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await disableTOTP(password, code.trim())
      onDisabled()
    } catch {
      setError('Invalid password or code.')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disable two-factor authentication</DialogTitle>
          <DialogDescription>
            Confirm with your password and a current code (or a recovery code).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dis-pw" className={FIELD_LABEL}>Password</Label>
            <Input id="dis-pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dis-code" className={FIELD_LABEL}>Code or recovery code</Label>
            <Input id="dis-code" type="text" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={submitting || !password || !code}>
              {submitting ? 'Disabling…' : 'Disable'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Regenerate-recovery-codes dialog
// ---------------------------------------------------------------------------

function RegenerateDialog({
  open,
  onClose,
  onRegenerated,
}: {
  open: boolean
  onClose: () => void
  onRegenerated: (codes: string[]) => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) { setCode(''); setError(null); setSubmitting(false) }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await regenerateTOTPRecoveryCodes(code.trim())
      onRegenerated(res.recoveryCodes)
    } catch {
      setError('Invalid code.')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regenerate recovery codes</DialogTitle>
          <DialogDescription>
            Confirm with a current code from your authenticator. The previous set of recovery codes will be invalidated.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="regen-code" className={FIELD_LABEL}>6-digit code</Label>
            <Input
              id="regen-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              required
              className="font-mono tracking-[0.3em] text-lg"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || code.length !== 6}>
              {submitting ? 'Generating…' : 'Generate new codes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
