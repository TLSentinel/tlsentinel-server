import { User, KeyRound, Bell, Key, ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { HubCard } from '@/components/ui/hub-card'
import { getMe } from '@/api/users'

export default function AccountPage() {
  // Password and 2FA only apply to local accounts. SSO users authenticate
  // through their identity provider, which owns both their password and
  // their MFA story — so we render those two cards as disabled tiles
  // (HubCard renders dim and non-clickable when `to` is omitted) with
  // explanatory copy. The page-level redirects in AccountPasswordPage
  // and Account2FAPage are still in place as a safety net for direct
  // navigation; this just keeps SSO users from being silently bounced.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe })
  const isLocal = me?.provider === 'local'

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
          to={isLocal ? '/account/password' : undefined}
          tone="red"
          icon={<KeyRound className="h-6 w-6" />}
          title="Password"
          description={isLocal
            ? 'Change your local account login password.'
            : 'Not available for SSO accounts — manage your password at your identity provider.'}
        />
        <HubCard
          to={isLocal ? '/account/2fa' : undefined}
          tone="green"
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Two-Factor Authentication"
          description={isLocal
            ? 'Add a TOTP authenticator app for an extra step at login.'
            : 'Not available for SSO accounts — configure MFA at your identity provider.'}
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
