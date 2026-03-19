import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { setToken } from '@/api/client'

// The server redirects here as: /auth/callback#token=<jwt>
// Using the URL fragment keeps the token out of server logs and Referrer headers.
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fragment = window.location.hash.slice(1) // strip leading #
    const params = new URLSearchParams(fragment)
    const token = params.get('token')

    if (!token) {
      setError('No token received from the identity provider.')
      return
    }

    setToken(token)
    navigate('/', { replace: true })
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <Shield className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{error}</p>
          <a href="/login" className="text-sm underline text-muted-foreground">
            Back to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <Shield className="h-8 w-8 text-primary mx-auto animate-pulse" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  )
}
