import { User, KeyRound, Bell, Key } from 'lucide-react'
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
          description="Update your name and email address."
        />
        <HubCard
          to="/account/password"
          icon={<KeyRound className="h-4 w-4" />}
          title="Password"
          description="Change your local account login password. This is not applicable to SSO users."
        />
        <HubCard
          to="/account/notifications"
          icon={<Bell className="h-4 w-4" />}
          title="Notifications"
          description="Configure alert email preferences and narrow scope by tag."
        />
        <HubCard
          to="/account/api-keys"
          icon={<Key className="h-4 w-4" />}
          title="API Keys"
          description="Generate long-lived keys for CLI and automation access."
        />
      </div>
    </div>
  )
}
