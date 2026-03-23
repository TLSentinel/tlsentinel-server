import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getMe, changeMyPassword } from '@/api/users'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

export default function AccountPasswordPage() {
  const [isLocal, setIsLocal]             = useState<boolean | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [success, setSuccess]                 = useState(false)

  useEffect(() => {
    getMe().then(u => setIsLocal(u.provider === 'local'))
  }, [])

  // Redirect SSO users away — they can't change their password here.
  if (isLocal === false) return <Navigate to="/account" replace />
  if (isLocal === null) return null

  async function save() {
    setError(null)
    setSuccess(false)
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSaving(true)
    try {
      await changeMyPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to update password. Check your current password and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link to="/account" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          My Account
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Password</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Change your login password.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>You'll need your current password to set a new one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acc-current">Current Password</Label>
            <Input id="acc-current" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-new">New Password</Label>
            <Input id="acc-new" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-confirm">Confirm New Password</Label>
            <Input id="acc-confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">Password updated.</p>}

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || !newPassword}>
              {saving ? 'Updating…' : 'Update Password'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
