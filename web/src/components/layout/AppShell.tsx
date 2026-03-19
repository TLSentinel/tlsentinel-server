import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Shield, Server, LogOut, LayoutDashboard, Settings, BookOpen, Clock } from 'lucide-react'
import { clearToken } from '@/api/client'
import { getVersion } from '@/api/version'
import { cn } from '@/lib/utils'
import type { BuildInfo } from '@/types/api'

// ---------------------------------------------------------------------------
// NavItem — a single sidebar link with active-state highlight.
// ---------------------------------------------------------------------------
interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
}

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

// ---------------------------------------------------------------------------
// AppShell — persistent sidebar + main content area.
// Child routes render inside <Outlet />.
// ---------------------------------------------------------------------------
export default function AppShell() {
  const navigate = useNavigate()
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)

  useEffect(() => {
    getVersion()
      .then(setBuildInfo)
      .catch(() => {
        // Version display is best-effort; silently ignore failures.
      })
  }, [])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-sidebar">
        {/* Brand */}
        <div className="flex items-center justify-center border-b px-4 py-1">
          <img src="/logo_light_horizontal.png" alt="TLSentinel" className="h-32 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
          <NavItem to="/active" icon={<Clock className="h-4 w-4" />} label="Active" />
          <NavItem to="/certificates" icon={<Shield className="h-4 w-4" />} label="Certificates" />
          <NavItem to="/hosts" icon={<Server className="h-4 w-4" />} label="Hosts" />
        </nav>

        {/* Bottom nav — settings + API docs */}
        <div className="border-t p-3 space-y-1">
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
          <a
            href="/api-docs/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <BookOpen className="h-4 w-4" />
            API Docs
          </a>
        </div>

        {/* Footer — version + logout */}
        <div className="border-t p-3 space-y-1">
          {buildInfo && (
            <p
              className="px-3 py-1 font-mono text-[11px] leading-tight text-sidebar-foreground/40"
              title={`Built: ${buildInfo.buildTime}`}
            >
              {buildInfo.version}
              {!buildInfo.version.includes(buildInfo.commit) && (
                <span className="ml-1.5 opacity-60">{buildInfo.commit}</span>
              )}
            </p>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
