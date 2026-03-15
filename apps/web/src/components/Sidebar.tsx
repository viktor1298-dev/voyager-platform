'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { APP_VERSION } from '@/config/constants'
import { navItems } from '@/config/navigation'
import { EASING } from '@/lib/animation-constants'
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

  // P3-001: sidebar width values
  const desktopWidth = collapsed ? 56 : 224

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

      {/* P3-001: motion.aside with spring width animation */}
      <motion.aside
        data-testid="sidebar"
        animate={isDesktop ? { width: desktopWidth, x: 0 } : { x: mobileOpen ? 0 : -224 }}
        initial={false}
        transition={EASING.spring}
        style={{ width: isDesktop ? desktopWidth : 224 }}
        className="fixed left-0 top-14 bottom-0 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] flex flex-col py-3 z-50 overflow-hidden"
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
        <nav className="flex flex-col gap-0.5 px-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const active = isActive(itemotion.id)
            const Icon = itemotion.icon
            const showAlertsBadge = itemotion.id === '/alerts' && unacknowledgedCount > 0

            return (
              <Link
                key={itemotion.id}
                href={itemotion.id}
                onClick={() => setMobileOpen(false)}
                data-testid={`nav-item-${itemotion.id.replace(/\//g, '') || 'dashboard'}`}
                className={`
                  relative flex items-center py-2.5 rounded-lg
                  ${showLabels ? 'gap-3 px-3' : 'justify-center px-0'}
                  ${active
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }
                `}
                style={{ transition: 'color 150ms ease' }}
              >
                {/* P3-002: Active background with layoutId spring + left accent border */}
                {active && (
                  <motion.div
                    layoutId="sidebar-active-bg"
                    className="absolute inset-0 bg-[var(--color-accent)]/10 rounded-lg sidebar-active-bar"
                    transition={EASING.snappy}
                  />
                )}
                {/* P3-002: Left accent border bar */}
                {active && (
                  <motion.div
                    layoutId="sidebar-active-border"
                    className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--color-accent)]"
                    transition={EASING.snappy}
                  />
                )}

                <Icon className="sidebar-icon h-4 w-4 shrink-0 relative z-10" />
                <AnimatePresence initial={false}>
                  {showLabels && (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                      className="sidebar-label text-[13px] font-medium relative z-10 overflow-hidden whitespace-nowrap"
                    >
                      {itemotion.label}
                    </motion.span>
                  )}
                </AnimatePresence>
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
          <AnimatePresence initial={false}>
            {showLabels && sidebarClusters.length > 0 && (
              <motion.div
                key="cluster-footer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="mt-2 border-t border-[var(--color-border)]/60 pt-2"
              >
                <p className="px-2 mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">
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
              </motion.div>
            )}
          </AnimatePresence>
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
        <AnimatePresence initial={false}>
          {showLabels && (
            <motion.div
              key="version"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="px-3 py-2 mt-0"
            >
              <div className="text-[10px] text-[var(--color-text-muted)] font-mono text-left whitespace-nowrap">
                Voyager {APP_VERSION}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
    </>
  )
}
