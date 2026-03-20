import { Link } from 'react-router-dom'
import { Bot, Users, Mail, Webhook, SlidersHorizontal, ChevronRight, Info, Wrench, ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Setting card — clickable link card or coming-soon placeholder
// ---------------------------------------------------------------------------

interface SettingCardProps {
  icon: React.ReactNode
  title: string
  description: string
  to?: string
  soon?: boolean
}

function SettingCard({ icon, title, description, to, soon }: SettingCardProps) {
  const inner = (
    <div
      className={[
        'group rounded-lg border p-5 space-y-3 transition-colors',
        to
          ? 'cursor-pointer hover:border-foreground/30 hover:bg-accent/30'
          : 'opacity-60',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          {icon}
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {soon
          ? <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
          : <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        }
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )

  return to ? <Link to={to}>{inner}</Link> : inner
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Administration and application configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-3xl">
        <SettingCard
          to="/settings/scanners"
          icon={<Bot className="h-4 w-4" />}
          title="Scanners"
          description="Manage scanner tokens, scan intervals, and concurrency settings."
        />
        <SettingCard
          to="/settings/users"
          icon={<Users className="h-4 w-4" />}
          title="Users"
          description="Manage user accounts and role-based access control."
        />
        <SettingCard
          to="/settings/mail"
          icon={<Mail className="h-4 w-4" />}
          title="Email / SMTP"
          description="Send certificate expiry warnings and scan error alerts via email."
        />
        <SettingCard
          icon={<ScrollText className="h-4 w-4" />}
          title="Audit Log"
          description="Track user logins, certificate changes, and other administrative actions."
          soon
        />
        <SettingCard
          icon={<Webhook className="h-4 w-4" />}
          title="Webhooks"
          description="POST alerts to Slack, PagerDuty, or any HTTP endpoint on cert or scan events."
          soon
        />
        <SettingCard
          icon={<Wrench className="h-4 w-4" />}
          title="Maintenance"
          description="Purge scan history, prune orphaned certificates, and other database housekeeping tasks."
          soon
        />
        <SettingCard
          to="/settings/general"
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title="General"
          description="Global scan intervals, expiry alert thresholds, and application preferences."
        />
        <SettingCard
          to="/settings/about"
          icon={<Info className="h-4 w-4" />}
          title="About"
          description="Version info, license, and third-party library attributions."
        />
      </div>
    </div>
  )
}
