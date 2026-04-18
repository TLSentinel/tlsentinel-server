import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { Server, LogOut, LayoutDashboard, Settings, BookOpen, Clock, User, Wrench, CalendarDays, Package, ChevronRight, BarChart2, ScrollText, SquareActivity, Radar, Inbox, Network } from 'lucide-react'
import { clearToken, getIdentity, can } from '@/api/client'
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
// NavGroup — collapsible sidebar section with nested NavItems.
// Auto-expands when any child route is active.
// ---------------------------------------------------------------------------
interface NavGroupProps {
  icon: React.ReactNode
  label: string
  childPaths: string[]
  children: React.ReactNode
}

function NavGroup({ icon, label, childPaths, children }: NavGroupProps) {
  const location = useLocation()
  const isChildActive = childPaths.some(p => location.pathname.startsWith(p))
  const [open, setOpen] = useState(isChildActive)

  useEffect(() => {
    if (isChildActive) setOpen(true)
  }, [isChildActive])

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isChildActive
            ? 'text-sidebar-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform text-sidebar-foreground/40', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AppShell — persistent sidebar + main content area.
// Child routes render inside <Outlet />.
// ---------------------------------------------------------------------------
function initials(first?: string, last?: string, username?: string): string {
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  if (username) return username.slice(0, 2).toUpperCase()
  return '??'
}

export default function AppShell() {
  const navigate = useNavigate()
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const identity = getIdentity()

  useEffect(() => {
    getVersion()
      .then(setBuildInfo)
      .catch(() => {
        // Version display is best-effort; silently ignore failures.
      })
  }, [])

  // Close popover when clicking outside.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    if (popoverOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popoverOpen])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col bg-sidebar">
        {/* Brand */}
        <div className="flex items-center justify-center px-4 py-1">
          <img src="/logo_light_horizontal.png" alt="TLSentinel" className="h-32 w-auto object-contain" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
          <NavGroup icon={<SquareActivity className="h-4 w-4" />} label="Monitor" childPaths={['/active', '/calendar']}>
            <NavItem to="/active" icon={<Clock className="h-4 w-4" />} label="Active" />
            <NavItem to="/calendar" icon={<CalendarDays className="h-4 w-4" />} label="Calendar" />
          </NavGroup>
          <NavItem to="/reports" icon={<BarChart2 className="h-4 w-4" />} label="Reports" />
          <NavGroup icon={<Package className="h-4 w-4" />} label="Inventory" childPaths={['/certificates', '/endpoints']}>
            <NavItem to="/certificates" icon={<ScrollText className="h-4 w-4" />} label="Certificates" />
            <NavItem to="/endpoints" icon={<Server className="h-4 w-4" />} label="Endpoints" />
          </NavGroup>
          <NavGroup icon={<Radar className="h-4 w-4" />} label="Discovery" childPaths={['/discovery']}>
            <NavItem to="/discovery/inbox" icon={<Inbox className="h-4 w-4" />} label="Inbox" />
            <NavItem to="/discovery/networks" icon={<Network className="h-4 w-4" />} label="Networks" />
          </NavGroup>
          <NavItem to="/toolbox" icon={<Wrench className="h-4 w-4" />} label="Toolbox" />
        </nav>

        {/* Bottom nav — settings (admin only) + API docs */}
        <div className="p-3 space-y-1">
          {can('settings:view') && <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />}
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

        {/* Footer — user avatar + version */}
        <div className="p-3 space-y-1">
          {buildInfo && (
            <p
              className="px-3 py-1 font-mono text-[11px] leading-tight text-sidebar-foreground/40"
              title={`Built: ${buildInfo.buildTime}`}
            >
              {buildInfo.version}
            </p>
          )}

          {/* Avatar button + popover */}
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setPopoverOpen(v => !v)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
                {initials(identity?.given_name, identity?.family_name, identity?.sub)}
              </span>
              <span className="truncate">
                {identity?.given_name
                  ? `${identity.given_name}${identity.family_name ? ' ' + identity.family_name : ''}`
                  : identity?.sub ?? 'Account'}
              </span>
            </button>

            {popoverOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-52 rounded-xl bg-popover shadow-lg text-popover-foreground text-sm overflow-hidden">
                <div className="px-3 py-2 bg-muted">
                  {(identity?.given_name || identity?.family_name) && (
                    <p className="font-medium truncate">
                      {[identity.given_name, identity.family_name].filter(Boolean).join(' ')}
                    </p>
                  )}
                  <p className="text-muted-foreground truncate text-xs">{identity?.sub}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground/60">{identity?.role}</p>
                </div>
                <div className="p-1">
                  <Link
                    to="/account"
                    onClick={() => setPopoverOpen(false)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <User className="h-4 w-4" />
                    My Account
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
