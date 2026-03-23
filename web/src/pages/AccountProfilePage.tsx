import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getMe, updateMe } from '@/api/users'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft } from 'lucide-react'
import type { User } from '@/types/api'

export default function AccountProfilePage() {
  const [_user, setUser]          = useState<User | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [notify, setNotify]       = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  useEffect(() => {
    getMe().then(u => {
      setUser(u)
      setFirstName(u.firstName ?? '')
      setLastName(u.lastName ?? '')
      setEmail(u.email ?? '')
      setNotify(u.notify)
    })
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await updateMe({
        notify,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to save profile.')
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
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Update your name, email address, and notification preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your name and email address.</CardDescription>
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

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">Profile saved.</p>}

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
