import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { LogOut, Settings, User, HelpCircle, Menu } from 'lucide-react'
import { clearToken, getIdentity, can } from '@/api/client'
import type { TokenIdentity } from '@/api/client'
import { getVersion } from '@/api/version'
import type { BuildInfo } from '@/types/api'
import { GlobalSearch } from './GlobalSearch'
import { SidebarNav } from './SidebarNav'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { VisuallyHidden } from 'radix-ui'

// ---------------------------------------------------------------------------
// AppShell — persistent sidebar + main content area.
// Child routes render inside <Outlet />.
//
// Sidebar behaviour by viewport:
//   ≥ md (768px): fixed-width sidebar always visible (`hidden md:flex`)
//   <  md       : sidebar collapses; hamburger in TopBar opens it as a Sheet
//                 drawer that slides in from the left.
// Both surfaces render the same <SidebarNav /> so the nav tree has a single
// source of truth.
// ---------------------------------------------------------------------------
function initials(first?: string, last?: string, username?: string): string {
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  if (username) return username.slice(0, 2).toUpperCase()
  return '??'
}

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
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

  // Auto-close the mobile drawer whenever the route changes — tapping any
  // nav item dismisses it without each NavLink having to know about it.
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <div className="flex h-screen bg-background">
        {/* Desktop sidebar — hidden on phones, identical to the previous
            shipping layout from md: up. */}
        <aside className="hidden w-56 flex-col bg-sidebar md:flex">
          <SidebarNav buildInfo={buildInfo} />
        </aside>

        {/* Mobile drawer — same SidebarNav rendered inside the Sheet. */}
        <SheetContent side="left" className="md:hidden">
          <VisuallyHidden.Root>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden.Root>
          <SidebarNav buildInfo={buildInfo} />
        </SheetContent>

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
    </Sheet>
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
      {/* Mobile hamburger — only visible below md, where the sidebar collapses
          into the Sheet. SheetTrigger flips the controlled `open` state held
          by AppShell. */}
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>

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
