import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getMe, rotateCalendarToken } from '@/api/users'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'

export default function AccountCalendarPage() {
  const [token, setToken]       = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
  })

  useEffect(() => {
    if (me) setToken(me.calendarToken ?? null)
  }, [me])

  async function generate() {
    setRotating(true)
    try {
      const res = await rotateCalendarToken()
      setToken(res.calendarToken)
    } finally {
      setRotating(false)
    }
  }

  const feedUrl = token
    ? `${window.location.origin}/api/v1/calendar/u/${token}/all.ics`
    : ''

  return (
    <div className="space-y-6 max-w-2xl">
      <nav className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Link to="/account" className="hover:text-foreground">My Account</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Calendar Feed</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Calendar Feed</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Subscribe to a live .ics feed of certificate expiry events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Feed URL</CardTitle>
          <CardDescription>
            Paste this URL into Outlook, Google Calendar, or any iCal-compatible app as a subscribed calendar.
            It updates automatically and includes reminders at 30, 14, 7, and 1 day before expiry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {token ? (
            <>
              <div className="flex gap-2">
                <Input readOnly value={feedUrl} className="font-mono text-xs" />
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(feedUrl)}>
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Regenerating will invalidate the current URL — you'll need to re-subscribe in your calendar app.
              </p>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={generate} disabled={rotating}>
                  {rotating ? 'Regenerating…' : 'Regenerate'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No feed URL generated yet. Click below to create one.
              </p>
              <div className="flex justify-end">
                <Button onClick={generate} disabled={rotating}>
                  {rotating ? 'Generating…' : 'Generate Feed URL'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
