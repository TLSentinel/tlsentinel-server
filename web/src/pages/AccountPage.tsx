import { useState, useEffect } from 'react'
import { getMe, updateMe, changeMyPassword } from '@/api/users'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import type { User } from '@/types/api'

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [notify, setNotify]       = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError]   = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving]   = useState(false)
  const [passwordError, setPasswordError]     = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  useEffect(() => {
    getMe().then(u => {
      setUser(u)
      setFirstName(u.firstName ?? '')
      setLastName(u.lastName ?? '')
      setEmail(u.email ?? '')
      setNotify(u.notify)
    })
  }, [])

  async function saveProfile() {
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(false)
    try {
      await updateMe({
        notify,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
      })
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch {
      setProfileError('Failed to save profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function savePassword() {
    setPasswordError(null)
    setPasswordSuccess(false)
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    setPasswordSaving(true)
    try {
      await changeMyPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch {
      setPasswordError('Failed to update password.')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">My Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your profile and preferences.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your name, email address, and notification preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="acc-first">First Name</Label>
              <Input id="acc-first" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-last">Last Name</Label>
              <Input id="acc-last" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="acc-email">Email</Label>
            <Input id="acc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="acc-notify">Receive alert emails</Label>
              <p className="text-xs text-muted-foreground">
                {email.trim() ? 'Send certificate expiry alerts to your email.' : 'Requires an email address.'}
              </p>
            </div>
            <Switch
              id="acc-notify"
              checked={notify}
              onCheckedChange={setNotify}
              disabled={!email.trim()}
            />
          </div>

          {profileError && <p className="text-sm text-destructive">{profileError}</p>}
          {profileSuccess && <p className="text-sm text-green-600">Profile saved.</p>}

          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password — local accounts only */}
      {user?.provider === 'local' && <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change your login password.</CardDescription>
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

          {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-green-600">Password updated.</p>}

          <div className="flex justify-end">
            <Button onClick={savePassword} disabled={passwordSaving || !newPassword}>
              {passwordSaving ? 'Updating…' : 'Update Password'}
            </Button>
          </div>
        </CardContent>
      </Card>}

      {/* Calendar Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar Feed</CardTitle>
          <CardDescription>Subscribe to a live .ics feed of certificate expiry events in Outlook, Google Calendar, or any iCal-compatible app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste this URL into your calendar app as a subscribed calendar. It updates automatically and includes reminders at 30, 14, 7, and 1 day before expiry.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={`${window.location.origin}/calendar/your-token-here.ics`}
              className="font-mono text-xs"
            />
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/calendar/your-token-here.ics`)}>
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Personal calendar token coming soon — anyone with this URL can view your certificate feed.</p>
        </CardContent>
      </Card>
    </div>
  )
}
