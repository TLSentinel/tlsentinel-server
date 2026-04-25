import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { login } from '@/api/auth'
import { setToken } from '@/api/client'
import { ApiError } from '@/types/api'
import { FIELD_LABEL } from '@/lib/utils'
import { ErrorAlert } from '@/components/ErrorAlert'

async function fetchAuthConfig(): Promise<{ oidcEnabled: boolean; providerHint?: string }> {
  const res = await fetch('/api/v1/auth/config')
  if (!res.ok) return { oidcEnabled: false }
  return res.json()
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [providerHint, setProviderHint] = useState<string | undefined>()

  useEffect(() => {
    fetchAuthConfig().then((cfg) => {
      setOidcEnabled(cfg.oidcEnabled)
      setProviderHint(cfg.providerHint)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Trim incidental whitespace (e.g. mobile autocomplete trailing space)
      // before hitting the API. The server also normalizes, so this is purely
      // a UX guard — the request and any client-side error message both see
      // the same value the user "really" typed.
      const res = await login({ username: username.trim(), password })
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
          <form onSubmit={handleSubmit} className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  )
}
