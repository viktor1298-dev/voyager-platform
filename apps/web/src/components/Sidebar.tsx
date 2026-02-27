'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_VERSION } from '@/config/constants'
import { navItems } from '@/config/navigation'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { ENV_META, getClusterEnvironment } from '@/lib/cluster-meta'
import { trpc } from '@/lib/trpc'

export function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  isDesktop,
}: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  isDesktop: boolean
}) {
  const pathname = usePathname()
  const isAdmin = useIsAdmin()
  const clustersQuery = trpc.clusters.list.useQuery(undefined, { refetchInterval: 60000 })
  const sidebarClusters = (clustersQuery.data ?? []).slice(0, 6)

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <>
      {/* Mobile backdrop */}
      {!isDesktop && mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <aside
        data-testid="sidebar"
        className={`
          fixed left-0 top-14 bottom-0 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col py-3 z-50 transition-all duration-200
          ${isDesktop ? 'translate-x-0' : mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isDesktop ? (collapsed ? 'w-12' : 'w-48') : 'w-48'}
        `}
      >
        {!isDesktop && mobileOpen && (
          <div className="flex justify-end px-2 pb-1 shrink-0">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <SidebarContent
          showLabels={!isDesktop || mobileOpen || !collapsed}
          isActive={isActive}
          isAdmin={isAdmin === true}
          onLinkClick={() => setMobileOpen(false)}
          clusters={sidebarClusters}
        />
        {isDesktop && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="mt-auto mx-2 mb-2 flex items-center justify-center h-8 rounded-lg text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-white/[0.04] transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
        {(!collapsed || mobileOpen) && (
          <div className="px-3 py-2 mt-auto md:mt-0">
            <div className="text-[9px] text-[var(--color-text-dim)] font-mono text-left">
              Voyager {APP_VERSION}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

function SidebarContent({
  showLabels,
  isActive,
  isAdmin,
  onLinkClick,
  clusters,
}: {
  showLabels: boolean
  isActive: (path: string) => boolean
  isAdmin: boolean
  onLinkClick: () => void
  clusters: Array<{ id: string; name: string; provider: string | null }>
}) {
  const filteredItems = navItems.filter(
    (item) => !('adminOnly' in item && item.adminOnly) || isAdmin,
  )
  const mainItems = filteredItems.filter((item) => !item.section)
  const autoscalingItems = filteredItems.filter((item) => item.section === 'autoscaling')
  const accessControlItems = filteredItems.filter((item) => item.section === 'access-control')

  const { data: unacknowledgedCount = 0 } = trpc.alerts.unacknowledgedCount.useQuery(undefined, { refetchInterval: 30000 })

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const active = isActive(item.id)
    const Icon = item.icon
    const showAlertsBadge = item.id === '/alerts' && unacknowledgedCount > 0
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
        {showLabels && <span className="sidebar-label text-[13px] font-medium">{item.label}</span>}
        {showAlertsBadge && (
          <span data-testid="alerts-badge" className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unacknowledgedCount > 99 ? '99+' : unacknowledgedCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-2 flex-1 min-h-0 overflow-y-auto">
      <nav className="flex flex-col gap-1">{mainItems.map(renderNavItem)}</nav>

      {showLabels && autoscalingItems.length > 0 && (
        <div className="mt-1 border-t border-[var(--color-border)]/60 pt-2">
          <p className="px-2 mb-1 text-[10px] uppercase tracking-widest font-mono text-[var(--color-text-muted)]">
            Autoscaling
          </p>
          <nav className="flex flex-col gap-1">{autoscalingItems.map(renderNavItem)}</nav>
        </div>
      )}

      {showLabels && accessControlItems.length > 0 && (
        <div className="mt-1 border-t border-[var(--color-border)]/60 pt-2">
          <p className="px-2 mb-1 text-[10px] uppercase tracking-widest font-mono text-[var(--color-text-muted)]">
            Access Control
          </p>
          <nav className="flex flex-col gap-1">{accessControlItems.map(renderNavItem)}</nav>
        </div>
      )}

      {showLabels && clusters.length > 0 && (
        <div className="mt-2 border-t border-[var(--color-border)]/60 pt-2">
          <p className="px-2 mb-1 text-[10px] uppercase tracking-widest font-mono text-[var(--color-text-muted)]">
            Clusters
          </p>
          <div className="space-y-1">
            {clusters.map((cluster) => {
              const env = getClusterEnvironment(cluster.name, cluster.provider)
              const color = ENV_META[env].color
              return (
                <Link
                  key={cluster.id}
                  href="/clusters"
                  onClick={onLinkClick}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04]"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate">{cluster.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
