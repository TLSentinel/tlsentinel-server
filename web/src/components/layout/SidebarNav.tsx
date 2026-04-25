import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Server, LayoutDashboard, Wrench, Package, ChevronRight, BarChart2,
  ScrollText, SquareActivity, Radar, Inbox, Network, Landmark, KeyRound, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BuildInfo } from '@/types/api'

// SidebarNav is the inner content of the sidebar — brand block, nav tree, and
// version footer — extracted out of AppShell so it can be rendered both as a
// fixed desktop sidebar (md and up) and inside a Sheet drawer on mobile,
// without duplicating the nav structure.

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

interface SidebarNavProps {
  buildInfo: BuildInfo | null
}

export function SidebarNav({ buildInfo }: SidebarNavProps) {
  return (
    <>
      {/* Brand */}
      <div className="flex flex-col items-center justify-center gap-2 px-4 pt-4 pb-2">
        <img src="/logo.png" alt="TLSentinel" className="h-20 w-auto object-contain" />
        <span className="font-brand text-3xl uppercase tracking-[0.05em] text-sidebar-foreground">TLSentinel</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 font-display">
        <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
        <NavItem to="/monitor" icon={<SquareActivity className="h-4 w-4" />} label="Monitor" />
        <NavGroup
          icon={<Package className="h-4 w-4" />}
          label="Inventory"
          // /endpoints covers all three typed lists plus detail/new/edit.
          childPaths={['/endpoints', '/certificates', '/root-stores']}
        >
          {/* Labels are short so they fit the w-56 sidebar with uppercase
              tracking. Full names ("Host Endpoints" etc.) render in the
              page title; the Inventory group supplies the noun. */}
          <NavItem to="/endpoints/host"    icon={<Server className="h-4 w-4" />}     label="Host" />
          <NavItem to="/endpoints/saml"    icon={<KeyRound className="h-4 w-4" />}   label="SAML" />
          <NavItem to="/endpoints/manual"  icon={<FileText className="h-4 w-4" />}   label="Manual" />
          <NavItem to="/certificates"      icon={<ScrollText className="h-4 w-4" />} label="Certificates" />
          <NavItem to="/root-stores"       icon={<Landmark className="h-4 w-4" />}   label="Root Stores" />
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
    </>
  )
}
