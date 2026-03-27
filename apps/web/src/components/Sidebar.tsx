'use client'

import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { APP_VERSION } from '@/config/constants'
import { navItems } from '@/config/navigation'
import { badgePopVariants, EASING } from '@/lib/animation-constants'
import { ENV_META, getClusterEnvironment } from '@/lib/cluster-meta'
import { trpc } from '@/lib/trpc'
import { useAnomalyCount } from '@/hooks/useAnomalyCount'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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

  // DB-003: anomaly count for Alerts badge
  const anomalyCount = useAnomalyCount()

  // SB-010: Clusters accordion open state — open when on any /clusters/* route
  const isClustersRoute = pathname.startsWith('/clusters')
  const [clustersOpen, setClustersOpen] = useState(isClustersRoute)

  // Keep accordion open when navigating into clusters
  useEffect(() => {
    if (isClustersRoute) setClustersOpen(true)
  }, [isClustersRoute])

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  // SB-009: track if toggle was keyboard-triggered for near-instant duration
  const keyboardToggleRef = useRef(false)

  // SB-009: Cmd+B keyboard shortcut — near-instant (duration-50), not full spring
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        if (isDesktop) {
          keyboardToggleRef.current = true
          setCollapsed(!collapsed)
          // Reset flag after the transition would fire
          setTimeout(() => {
            keyboardToggleRef.current = false
          }, 100)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [collapsed, isDesktop, setCollapsed])

  const showLabels = !isDesktop || mobileOpen || !collapsed

  // SB-002 / SB-006: collapsed state as data attribute + CSS transition for width
  const collapsibleState = isDesktop && collapsed ? 'icon' : 'expanded'

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

      {/*
        SB-002: data-collapsible propagated from aside so child group selectors work.
        SB-006: CSS transition-[width] duration-200 ease-out instead of Motion spring for width.
                Keep Motion only for layoutId active indicator (SB-007 preserved).
      */}
      <aside
        data-testid="sidebar"
        data-collapsible={collapsibleState}
        className={[
          'group fixed left-0 top-14 bottom-0',
          'bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]',
          'flex flex-col py-3 z-50 overflow-hidden',
          // SB-006: hardware-accelerated CSS width transition
          'transition-[width] duration-200 ease-out',
          // Desktop width based on collapsed state
          isDesktop ? (collapsed ? 'w-14' : 'w-56') : 'w-56',
          // SB-009: Mobile translation uses CSS transition too
          !isDesktop ? (mobileOpen ? 'translate-x-0' : '-translate-x-full') : '',
          !isDesktop ? 'transition-transform duration-200 ease-out' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          !isDesktop
            ? { transform: mobileOpen ? 'translateX(0)' : 'translateX(-224px)' }
            : undefined
        }
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

        {/* Main nav — flat items + clusters accordion */}
        {/* SB-003: TooltipProvider wraps nav so tooltips work in collapsed mode */}
        <TooltipProvider delayDuration={300}>
          <nav
            className="flex flex-col gap-0.5 px-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            aria-label="Main navigation"
          >
            {navItems.map((item) => {
              const active = isActive(item.id)
              const Icon = item.icon
              const showAlertsBadge = item.id === '/alerts' && unacknowledgedCount > 0
              // DB-003: anomaly badge on Alerts nav item
              const showAnomalyBadge =
                item.id === '/alerts' && anomalyCount.total > 0 && unacknowledgedCount === 0
              const isClustersItem = item.id === '/clusters'

              // SB-010: clusters parent is active when on any /clusters/* route
              const isNavActive = isClustersItem ? isClustersRoute : active

              const navLink = (
                <Link
                  key={item.id}
                  href={isClustersItem ? '#' : item.id}
                  onClick={(e) => {
                    if (isClustersItem) {
                      e.preventDefault()
                      setClustersOpen((prev) => !prev)
                    } else {
                      setMobileOpen(false)
                    }
                  }}
                  data-testid={`nav-item-${item.id.replace(/\//g, '') || 'dashboard'}`}
                  aria-current={isNavActive ? 'page' : undefined}
                  aria-expanded={isClustersItem ? clustersOpen : undefined}
                  className={[
                    'relative flex items-center py-2.5 rounded-lg',
                    // SB-002: respond to data-collapsible via group selectors
                    'gap-3 px-3',
                    'group-data-[collapsible=icon]:gap-0',
                    'group-data-[collapsible=icon]:justify-center',
                    'group-data-[collapsible=icon]:px-0',
                    'group-data-[collapsible=icon]:mx-auto',
                    'group-data-[collapsible=icon]:w-10',
                    'group-data-[collapsible=icon]:h-10',
                    isNavActive
                      ? 'text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  ].join(' ')}
                  style={{ transition: 'color 150ms ease' }}
                >
                  {/* P3-002 / SB-007: Active background with layoutId spring + left accent border */}
                  {isNavActive && (
                    <motion.div
                      layoutId="sidebar-active-bg"
                      className="absolute inset-0 bg-[var(--color-accent)]/10 rounded-lg sidebar-active-bar"
                      transition={EASING.snappy}
                    />
                  )}
                  {/* SB-008: Reduce active border bar from 3px -> 2px */}
                  {isNavActive && (
                    <motion.div
                      layoutId="sidebar-active-border"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-accent)]"
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
                        className="sidebar-label text-[13px] font-medium relative z-10 overflow-hidden whitespace-nowrap flex-1"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {showAlertsBadge && showLabels && (
                      <motion.span
                        key="alerts-badge"
                        variants={badgePopVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        data-testid="alerts-badge"
                        className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 relative z-10"
                      >
                        {unacknowledgedCount > 99 ? '99+' : unacknowledgedCount}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* Show small indicator dot when collapsed with alerts */}
                  <AnimatePresence>
                    {showAlertsBadge && !showLabels && (
                      <motion.span
                        key="alerts-badge-dot"
                        variants={badgePopVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        data-testid="alerts-badge"
                        className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 z-10"
                        aria-label={`${unacknowledgedCount} unacknowledged alerts`}
                      />
                    )}
                  </AnimatePresence>
                  {/* DB-003: anomaly badge — shown when there are open anomalies and no unacknowledged alerts */}
                  <AnimatePresence>
                    {showAnomalyBadge && (
                      <motion.span
                        key="anomaly-badge"
                        variants={badgePopVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        data-testid="anomaly-badge"
                        className={[
                          'ml-auto min-w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold px-1 relative z-10',
                          anomalyCount.critical > 0
                            ? 'bg-red-500 text-white'
                            : 'bg-amber-500 text-white',
                        ].join(' ')}
                      >
                        {anomalyCount.total > 99 ? '99+' : anomalyCount.total}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* SB-005: ChevronDown for clusters accordion — rotates when open */}
                  {isClustersItem && showLabels && (
                    <motion.div
                      animate={{ rotate: clustersOpen ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                      className="relative z-10 ml-auto"
                    >
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </motion.div>
                  )}
                </Link>
              )

              // SB-003: Wrap in Tooltip when collapsed (desktop icon mode)
              const wrappedNavLink =
                isDesktop && collapsed ? (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="text-xs">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={item.id}>{navLink}</div>
                )

              return (
                <div key={item.id}>
                  {wrappedNavLink}

                  {/* SB-005 / SB-011: Inline accordion sub-nav for Clusters */}
                  {isClustersItem && (
                    <AnimatePresence initial={false}>
                      {clustersOpen && showLabels && (
                        <motion.div
                          key="clusters-subnav"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                          className="overflow-hidden"
                        >
                          {/* SB-011: cluster sub-nav — cluster name + current tab context */}
                          <div className="mt-0.5 space-y-0.5">
                            {sidebarClusters.length > 0 ? (
                              sidebarClusters.map((cluster) => {
                                const env = getClusterEnvironment(cluster.name, cluster.provider)
                                const color = ENV_META[env].color
                                const clusterPath = `/clusters/${cluster.id}`
                                const isClusterActive = pathname.startsWith(clusterPath)

                                return (
                                  <Link
                                    key={cluster.id}
                                    href={clusterPath}
                                    onClick={() => setMobileOpen(false)}
                                    className={[
                                      'flex items-center gap-2 pl-9 pr-3 py-2.5 min-h-[44px] rounded-md text-[13px]',
                                      'transition-colors duration-150',
                                      isClusterActive
                                        ? 'text-[var(--color-text-primary)] bg-[var(--color-accent)]/5'
                                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-accent)]/5',
                                    ].join(' ')}
                                  >
                                    <span
                                      className="h-1.5 w-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: color }}
                                    />
                                    <span className="truncate">{cluster.name}</span>
                                  </Link>
                                )
                              })
                            ) : (
                              <p className="pl-9 pr-3 py-1.5 text-[11px] text-[var(--color-text-muted)]">
                                No clusters
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              )
            })}
          </nav>
        </TooltipProvider>

        {/* Collapse toggle */}
        {isDesktop && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="mt-auto mx-2 mb-2 flex items-center justify-center h-11 min-h-[44px] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
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
              <div className="text-xs text-[var(--color-text-secondary)] font-mono text-left whitespace-nowrap opacity-70">
                Voyager {APP_VERSION}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </>
  )
}
