import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { login } from '@/api/auth'
import { loginWithTOTP } from '@/api/totp'
import { setToken } from '@/api/client'
import { ApiError } from '@/types/api'
import { FIELD_LABEL } from '@/lib/utils'
import { ErrorAlert } from '@/components/ErrorAlert'

async function fetchAuthConfig(): Promise<{ oidcEnabled: boolean; providerHint?: string }> {
  const res = await fetch('/api/v1/auth/config')
  if (!res.ok) return { oidcEnabled: false }
  return res.json()
}

type Step = 'credentials' | 'totp'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [providerHint, setProviderHint] = useState<string | undefined>()

  // Second-factor state — populated after a successful password check that
  // returns a `challengeToken`. We keep the user's challenge token in memory
  // only; reloading the page sends them back to step 1, which is fine.
  const [step, setStep] = useState<Step>('credentials')
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const codeInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetchAuthConfig().then((cfg) => {
      setOidcEnabled(cfg.oidcEnabled)
      setProviderHint(cfg.providerHint)
    })
  }, [])

  // Auto-focus the code field when entering the TOTP step.
  useEffect(() => {
    if (step === 'totp') {
      codeInputRef.current?.focus()
    }
  }, [step])

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Trim incidental whitespace (e.g. mobile autocomplete trailing space)
      // before hitting the API. The server also normalizes, so this is purely
      // a UX guard — the request and any client-side error message both see
      // the same value the user "really" typed.
      const res = await login({ username: username.trim(), password })
      if (res.totpRequired && res.challengeToken) {
        setChallengeToken(res.challengeToken)
        setStep('totp')
        return
      }
      setToken(res.token)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Invalid username or password.' : err.message)
      } else {
        setError('Unable to reach the server. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleTOTP(e: React.FormEvent) {
    e.preventDefault()
    if (!challengeToken) return
    setError(null)
    setLoading(true)

    try {
      const trimmed = code.trim()
      const res = await loginWithTOTP({
        challengeToken,
        code: trimmed,
        isRecovery: useRecovery,
      })
      setToken(res.token)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        // The server returns 401 for both "wrong code" and "challenge expired" —
        // we can't tell them apart from the status alone, so fall back to a
        // generic message. The user can use the Cancel link to retry from
        // scratch if they think the challenge expired.
        setError(useRecovery
          ? 'That recovery code is not valid or has already been used.'
          : 'That code is not valid. Try again.')
      } else {
        setError('Unable to reach the server. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function cancelTOTP() {
    setStep('credentials')
    setChallengeToken(null)
    setCode('')
    setUseRecovery(false)
    setError(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border border-border gap-6 py-8 shadow-sm">
        <CardHeader className="text-center gap-3">
          <div className="flex justify-center">
            <img src="/logo.png" alt="TLSentinel" className="h-36 w-auto" />
          </div>
          <h1 className="font-brand text-4xl uppercase tracking-[0.15em]">TLSentinel</h1>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 'credentials' ? (
            <>
              <form onSubmit={handleCredentials} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className={FIELD_LABEL}>Username</Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className={FIELD_LABEL}>Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && <ErrorAlert>{error}</ErrorAlert>}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              {oidcEnabled && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className={`bg-card px-2 ${FIELD_LABEL}`}>or</span>
                    </div>
                  </div>

                  {providerHint === 'microsoft' ? (
                    <button
                      className="w-full cursor-pointer"
                      onClick={() => { window.location.href = '/api/v1/auth/oidc/login' }}
                    >
                      <img
                        src="/ms-signin-light.svg"
                        alt="Sign in with Microsoft"
                        className="mx-auto h-10 w-auto"
                      />
                    </button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => { window.location.href = '/api/v1/auth/oidc/login' }}
                    >
                      Sign in with SSO
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <form onSubmit={handleTOTP} className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                {useRecovery
                  ? 'Enter one of your recovery codes.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className={FIELD_LABEL}>
                  {useRecovery ? 'Recovery code' : 'Authentication code'}
                </Label>
                <Input
                  id="code"
                  ref={codeInputRef}
                  type="text"
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  // Recovery codes are 4-group base32 (XXXX-XXXX-XXXX-XXXX); 6 digits
                  // for TOTP. Don't enforce maxLength — let the server validate.
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={useRecovery ? 'font-mono tracking-wider' : 'text-center text-lg tracking-[0.4em]'}
                />
              </div>

              {error && <ErrorAlert>{error}</ErrorAlert>}

              <Button type="submit" className="w-full" disabled={loading || code.trim() === ''}>
                {loading ? 'Verifying…' : 'Verify'}
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    setUseRecovery((v) => !v)
                    setCode('')
                    setError(null)
                  }}
                >
                  {useRecovery ? 'Use authenticator code instead' : 'Use a recovery code instead'}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={cancelTOTP}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
