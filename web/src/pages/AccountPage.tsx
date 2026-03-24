import { User, KeyRound, CalendarDays, Users } from 'lucide-react'
import { HubCard } from '@/components/ui/hub-card'

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Account</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your profile, security, and personal preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-3xl">
        <HubCard
          to="/account/profile"
          icon={<User className="h-4 w-4" />}
          title="Profile"
          description="Update your name, email address, and notification preferences."
        />
        <HubCard
          to="/account/password"
          icon={<KeyRound className="h-4 w-4" />}
          title="Password"
          description="Change your local account login password. This is not applicable to SSO users."
        />
        <HubCard
          to="/account/calendar"
          icon={<CalendarDays className="h-4 w-4" />}
          title="Calendar Feed"
          description="Subscribe to a live .ics feed of certificate expiry events in Outlook or Google Calendar."
        />
        <HubCard
          icon={<Users className="h-4 w-4" />}
          title="Groups"
          description="Manage your group memberships and notification subscriptions."
          soon
        />
      </div>
    </div>
  )
}
