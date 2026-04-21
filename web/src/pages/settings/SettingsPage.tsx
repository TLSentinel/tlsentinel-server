import { Bot, Users, Mail, Webhook, SlidersHorizontal, Info, Wrench, ScrollText, Tag, Bell, KeyRound } from 'lucide-react'
import { HubCard } from '@/components/ui/hub-card'
import { can } from '@/api/client'

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl">
        <HubCard
          to="/settings/scanners"
          tone="blue"
          icon={<Bot className="h-6 w-6" />}
          title="Scanners"
          description="Manage scanner tokens, scan intervals, and concurrency settings."
        />
        <HubCard
          to="/settings/users"
          tone="indigo"
          icon={<Users className="h-6 w-6" />}
          title="Users"
          description="Manage user accounts and role-based access control."
        />
        {can('apikeys:admin') && (
          <HubCard
            to="/settings/api-keys"
            tone="amber"
            icon={<KeyRound className="h-6 w-6" />}
            title="API Keys"
            description="View and revoke API keys across all users."
          />
        )}
        <HubCard
          to="/settings/mail"
          tone="red"
          icon={<Mail className="h-6 w-6" />}
          title="Email / SMTP"
          description="Send certificate expiry warnings and scan error alerts via email."
        />
        <HubCard
          to="/settings/notification-templates"
          tone="orange"
          icon={<Bell className="h-6 w-6" />}
          title="Notification Templates"
          description="Customise the subject and body of expiry alerts and scan notifications."
        />
        <HubCard
          to="/logs/audit"
          tone="slate"
          icon={<ScrollText className="h-6 w-6" />}
          title="Audit Log"
          description="Track user logins, certificate changes, and other administrative actions."
        />
        <HubCard
          to="/settings/tags"
          tone="green"
          icon={<Tag className="h-6 w-6" />}
          title="Tags"
          description="Manage tag categories and tags to organize endpoints."
        />
        <HubCard
          tone="purple"
          icon={<Webhook className="h-6 w-6" />}
          title="Webhooks"
          description="POST alerts to any HTTP endpoint on cert or scan events."
          soon
        />
        <HubCard
          to="/settings/maintenance"
          tone="teal"
          icon={<Wrench className="h-6 w-6" />}
          title="Maintenance"
          description="Purge scan history, prune orphaned certificates, and other database housekeeping tasks."
        />
        <HubCard
          to="/settings/general"
          tone="pink"
          icon={<SlidersHorizontal className="h-6 w-6" />}
          title="General"
          description="Global scan intervals, expiry alert thresholds, and application preferences."
        />
        <HubCard
          to="/settings/about"
          tone="violet"
          icon={<Info className="h-6 w-6" />}
          title="About"
          description="Version info, license, and third-party library attributions."
        />
      </div>
    </div>
  )
}
