import { Link } from 'react-router-dom'
import { User, KeyRound, CalendarDays, ChevronRight } from 'lucide-react'

interface AccountCardProps {
  icon: React.ReactNode
  title: string
  description: string
  to: string
}

function AccountCard({ icon, title, description, to }: AccountCardProps) {
  return (
    <Link to={to}>
      <div className="group rounded-lg border p-5 space-y-3 transition-colors cursor-pointer hover:border-foreground/30 hover:bg-accent/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            {icon}
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  )
}

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
        <AccountCard
          to="/account/profile"
          icon={<User className="h-4 w-4" />}
          title="Profile"
          description="Update your name, email address, and notification preferences."
        />
        <AccountCard
          to="/account/password"
          icon={<KeyRound className="h-4 w-4" />}
          title="Password"
          description="Change your login password."
        />
        <AccountCard
          to="/account/calendar"
          icon={<CalendarDays className="h-4 w-4" />}
          title="Calendar Feed"
          description="Subscribe to a live .ics feed of certificate expiry events in Outlook or Google Calendar."
        />
      </div>
    </div>
  )
}
