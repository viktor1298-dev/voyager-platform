'use client'

import { APP_VERSION } from '@/config/constants'
import { navItems } from '@/config/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}) {
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const showLabels = !collapsed || mobileOpen

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
          onKeyDown={() => {}}
        />
      )}

      <aside
        className={`
          fixed left-0 top-14 bottom-0 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col py-3 z-40 transition-all duration-200
          hidden md:flex
          ${collapsed ? 'w-12' : 'w-48'}
        `}
      >
        <SidebarContent
          collapsed={collapsed}
          showLabels={!collapsed}
          isActive={isActive}
          onLinkClick={() => {}}
        />
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="mt-auto mx-2 mb-2 flex items-center justify-center h-8 rounded-lg text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/[0.04] transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        {!collapsed && (
          <div className="px-3 py-2">
            <div className="text-[9px] text-[var(--color-text-dim)] font-mono text-left">
              Voyager {APP_VERSION}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`
          fixed left-0 top-14 bottom-0 w-48 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col py-3 z-50 transition-transform duration-200 md:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <SidebarContent
          collapsed={false}
          showLabels
          isActive={isActive}
          onLinkClick={() => setMobileOpen(false)}
        />
        <div className="px-3 py-2 mt-auto">
          <div className="text-[9px] text-[var(--color-text-dim)] font-mono text-left">
            Voyager {APP_VERSION}
          </div>
        </div>
      </aside>
    </>
  )
}

function SidebarContent({
  collapsed,
  showLabels,
  isActive,
  onLinkClick,
}: {
  collapsed: boolean
  showLabels: boolean
  isActive: (path: string) => boolean
  onLinkClick: () => void
}) {
  return (
    <nav className="flex flex-col gap-1 px-2">
      {navItems.map((item) => {
        const active = isActive(item.id)
        const Icon = item.icon
        return (
          <Link
            key={item.id}
            href={item.id}
            onClick={onLinkClick}
            className={`
              sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg
              ${
                active
                  ? 'bg-white/[0.08] text-[var(--color-text-primary)] sidebar-active-bar'
                  : 'text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-[var(--color-text-secondary)] sidebar-hover-bar'
              }
            `}
            style={{ transition: 'all var(--duration-fast) ease' }}
          >
            <Icon className="sidebar-icon h-4 w-4 shrink-0" />
            {showLabels && (
              <span className="sidebar-label text-[13px] font-medium">{item.label}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
