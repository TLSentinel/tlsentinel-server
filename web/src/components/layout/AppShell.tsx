import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { Server, LogOut, LayoutDashboard, Settings, User, Wrench, Package, ChevronRight, BarChart2, ScrollText, SquareActivity, Radar, Inbox, Network, HelpCircle, Landmark } from 'lucide-react'
import { clearToken, getIdentity, can } from '@/api/client'
import type { TokenIdentity } from '@/api/client'
import { getVersion } from '@/api/version'
import { cn } from '@/lib/utils'
import type { BuildInfo } from '@/types/api'
import { GlobalSearch } from './GlobalSearch'

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
          'flex items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors',
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
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors',
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
        <div className="flex flex-col items-center justify-center gap-2 px-4 pt-4 pb-2">
          <img src="/logo.png" alt="TLSentinel" className="h-20 w-auto object-contain" />
          <span className="font-brand text-3xl uppercase tracking-[0.05em] text-sidebar-foreground">TLSentinel</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3 font-display">
          <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
          <NavItem to="/monitor" icon={<SquareActivity className="h-4 w-4" />} label="Monitor" />
          <NavGroup icon={<Package className="h-4 w-4" />} label="Inventory" childPaths={['/certificates', '/endpoints', '/root-stores']}>
            <NavItem to="/certificates" icon={<ScrollText className="h-4 w-4" />} label="Certificates" />
            <NavItem to="/endpoints" icon={<Server className="h-4 w-4" />} label="Endpoints" />
            <NavItem to="/root-stores" icon={<Landmark className="h-4 w-4" />} label="Root Stores" />
          </NavGroup>
          <NavGroup icon={<Radar className="h-4 w-4" />} label="Discovery" childPaths={['/discovery']}>
            <NavItem to="/discovery/inbox" icon={<Inbox className="h-4 w-4" />} label="Inbox" />
            <NavItem to="/discovery/networks" icon={<Network className="h-4 w-4" />} label="Networks" />
          </NavGroup>
          <NavItem to="/reports" icon={<BarChart2 className="h-4 w-4" />} label="Reports" />
          <NavItem to="/toolbox" icon={<Wrench className="h-4 w-4" />} label="Toolbox" />
        </nav>

        {/* Footer — version */}
        <div className="p-3">
          {buildInfo && (
            <p
              className="px-3 py-1 font-mono text-[11px] leading-tight text-sidebar-foreground/40"
              title={`Built: ${buildInfo.buildTime}`}
            >
              {buildInfo.version}
            </p>
          )}
        </div>
      </aside>

      {/* Main pane (top bar + content) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          identity={identity}
          popoverOpen={popoverOpen}
          setPopoverOpen={setPopoverOpen}
          popoverRef={popoverRef}
          onLogout={handleLogout}
        />
        <main className="flex-1 overflow-auto px-6 pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TopBar — global search + help + user menu
//
// A bell/notifications icon lived here previously as a placeholder. Removed
// until the notifications layer (see FEATURES.md → Notification System) lands,
// so the UI doesn't imply an in-app channel that doesn't exist yet.
// ---------------------------------------------------------------------------
interface TopBarProps {
  identity: TokenIdentity | null
  popoverOpen: boolean
  setPopoverOpen: (v: boolean | ((p: boolean) => boolean)) => void
  popoverRef: React.RefObject<HTMLDivElement | null>
  onLogout: () => void
}

function TopBar({ identity, popoverOpen, setPopoverOpen, popoverRef, onLogout }: TopBarProps) {
  const fullName = identity?.given_name
    ? `${identity.given_name}${identity.family_name ? ' ' + identity.family_name : ''}`
    : identity?.sub ?? 'Account'

  return (
    <header className="flex items-center gap-3 px-6 py-4">
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1">
        <Link
          to="/help"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </Link>

        {can('settings:view') && (
          <Link
            to="/settings"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}

        <div className="mx-2 h-8 w-px bg-border" />

        {/* User menu */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setPopoverOpen(v => !v)}
            className="flex items-center gap-3 rounded-lg py-1 pl-3 pr-1 transition-colors hover:bg-muted"
          >
            <div className="text-right leading-tight hidden sm:block">
              <p className="text-sm font-semibold">{fullName}</p>
              {identity?.role && (
                <p className="text-xs capitalize text-muted-foreground">{identity.role}</p>
              )}
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
              {initials(identity?.given_name, identity?.family_name, identity?.sub)}
            </span>
          </button>

          {popoverOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl bg-popover shadow-lg text-popover-foreground text-sm overflow-hidden z-50">
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
                  onClick={onLogout}
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
    </header>
  )
}
