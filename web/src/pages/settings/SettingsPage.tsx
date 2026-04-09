import { Bot, Users, Mail, Webhook, SlidersHorizontal, Info, Wrench, ScrollText, Tag } from 'lucide-react'
import { HubCard } from '@/components/ui/hub-card'

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
        <HubCard
          to="/settings/scanners"
          icon={<Bot className="h-4 w-4" />}
          title="Scanners"
          description="Manage scanner tokens, scan intervals, and concurrency settings."
        />
        <HubCard
          to="/settings/users"
          icon={<Users className="h-4 w-4" />}
          title="Users"
          description="Manage user accounts and role-based access control."
        />
        {/* Groups hidden until feature is ready */}
        <HubCard
          to="/settings/mail"
          icon={<Mail className="h-4 w-4" />}
          title="Email / SMTP"
          description="Send certificate expiry warnings and scan error alerts via email."
        />
        <HubCard
          to="/logs/audit"
          icon={<ScrollText className="h-4 w-4" />}
          title="Audit Log"
          description="Track user logins, certificate changes, and other administrative actions."
        />
        <HubCard
          to="/settings/tags"
          icon={<Tag className="h-4 w-4" />}
          title="Tags"
          description="Manage tag categories and tags to organize endpoints by environment, owner, application, and more."
        />
        <HubCard
          icon={<Webhook className="h-4 w-4" />}
          title="Webhooks"
          description="POST alerts to any HTTP endpoint on cert or scan events."
          soon
        />
        <HubCard
          to="/settings/maintenance"
          icon={<Wrench className="h-4 w-4" />}
          title="Maintenance"
          description="Purge scan history, prune orphaned certificates, and other database housekeeping tasks."
        />
        <HubCard
          to="/settings/general"
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title="General"
          description="Global scan intervals, expiry alert thresholds, and application preferences."
        />
        <HubCard
          to="/settings/about"
          icon={<Info className="h-4 w-4" />}
          title="About"
          description="Version info, license, and third-party library attributions."
        />
      </div>
    </div>
  )
}
