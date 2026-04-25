import { User, KeyRound, Bell, Key, ShieldCheck } from 'lucide-react'
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl">
        <HubCard
          to="/account/profile"
          tone="blue"
          icon={<User className="h-6 w-6" />}
          title="Profile"
          description="Update your name and email address."
        />
        <HubCard
          to="/account/password"
          tone="red"
          icon={<KeyRound className="h-6 w-6" />}
          title="Password"
          description="Change your local account login password. This is not applicable to SSO users."
        />
        <HubCard
          to="/account/2fa"
          tone="green"
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Two-Factor Authentication"
          description="Add a TOTP authenticator app for an extra step at login. Local accounts only."
        />
        <HubCard
          to="/account/notifications"
          tone="orange"
          icon={<Bell className="h-6 w-6" />}
          title="Notifications"
          description="Configure alert email preferences and narrow scope by tag."
        />
        <HubCard
          to="/account/api-keys"
          tone="amber"
          icon={<Key className="h-6 w-6" />}
          title="API Keys"
          description="Generate long-lived keys for CLI and automation access."
        />
      </div>
    </div>
  )
}
