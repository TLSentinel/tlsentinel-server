import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getMe, updateMe } from '@/api/users'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import type { User } from '@/types/api'

const FIELD_LABEL = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export default function AccountProfilePage() {
  const [user, setUser]           = useState<User | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  useEffect(() => {
    getMe().then(u => {
      setUser(u)
      setFirstName(u.firstName ?? '')
      setLastName(u.lastName ?? '')
      setEmail(u.email ?? '')
    })
  }, [])

  async function save() {
    if (!user) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const updated = await updateMe({
        notify: user.notify, // preserve existing value — managed on Notifications page
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
      })
      setUser(updated)
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
      <nav className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Link to="/account" className="hover:text-foreground">My Account</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Profile</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Update your name and email address.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your name and email address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acc-first" className={FIELD_LABEL}>First Name</Label>
              <Input id="acc-first" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-last" className={FIELD_LABEL}>Last Name</Label>
              <Input id="acc-last" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-email" className={FIELD_LABEL}>Email</Label>
            <Input id="acc-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">Profile saved.</p>}

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
