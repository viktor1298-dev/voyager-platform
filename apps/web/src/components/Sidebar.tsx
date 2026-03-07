'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { motion } from 'motion/react'
import { APP_VERSION } from '@/config/constants'
import { navItems } from '@/config/navigation'
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
  const clustersQuery = trpc.clusters.list.useQuery(undefined, { refetchInterval: 60000 })
  const sidebarClusters = (clustersQuery.data ?? []).slice(0, 6)

  const { data: unacknowledgedCount = 0 } = trpc.alerts.unacknowledgedCount.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  // Cmd+B keyboard shortcut to toggle collapsed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        if (isDesktop) {
          setCollapsed(!collapsed)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [collapsed, isDesktop, setCollapsed])

  const showLabels = !isDesktop || mobileOpen || !collapsed

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
        {/* Mobile close button */}
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

        {/* Main nav — flat 6 items */}
        <nav className="flex flex-col gap-0.5 px-2 flex-1 min-h-0 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.id)
            const Icon = item.icon
            const showAlertsBadge = item.id === '/alerts' && unacknowledgedCount > 0

            return (
              <Link
                key={item.id}
                href={item.id}
                onClick={() => setMobileOpen(false)}
                data-testid={`nav-item-${item.id.replace(/\//g, '') || 'dashboard'}`}
                className={`
                  relative flex items-center gap-3 px-3 py-2.5 rounded-lg
                  ${active
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }
                `}
                style={{ transition: 'color var(--duration-fast, 150ms) ease' }}
              >
                {/* Active background with layoutId for spring animation */}
                {active && (
                  <motion.div
                    layoutId="sidebar-active-bg"
                    className="absolute inset-0 bg-[var(--color-accent)]/10 rounded-lg sidebar-active-bar"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}

                <Icon className="sidebar-icon h-4 w-4 shrink-0 relative z-10" />
                {showLabels && (
                  <span className="sidebar-label text-[13px] font-medium relative z-10">
                    {item.label}
                  </span>
                )}
                {showAlertsBadge && (
                  <span
                    data-testid="alerts-badge"
                    className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 relative z-10"
                  >
                    {unacknowledgedCount > 99 ? '99+' : unacknowledgedCount}
                  </span>
                )}
              </Link>
            )
          })}

          {/* Cluster quick-switch footer */}
          {showLabels && sidebarClusters.length > 0 && (
            <div className="mt-2 border-t border-[var(--color-border)]/60 pt-2">
              <p className="px-2 mb-1 text-[12px] uppercase tracking-widest font-mono font-bold text-slate-700 dark:text-slate-100">
                Clusters
              </p>
              <div className="space-y-1">
                {sidebarClusters.map((cluster) => {
                  const env = getClusterEnvironment(cluster.name, cluster.provider)
                  const color = ENV_META[env].color
                  return (
                    <Link
                      key={cluster.id}
                      href={`/clusters/${cluster.id}`}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-accent)]/5"
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
        </nav>

        {/* Collapse toggle */}
        {isDesktop && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="mt-auto mx-2 mb-2 flex items-center justify-center h-8 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Version display */}
        {showLabels && (
          <div className="px-3 py-2 mt-0">
            <div className="text-[10px] text-[var(--color-text-muted)] font-mono text-left">
              Voyager {APP_VERSION}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
