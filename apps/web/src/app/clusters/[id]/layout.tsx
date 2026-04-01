'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Home } from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProviderLogo } from '@/components/ProviderLogo'
import { getClusterIdFromRouteSegment, getClusterRouteSegment } from '@/components/cluster-route'
import { GroupedTabBar } from '@/components/clusters/GroupedTabBar'
import { getAllTabPaths } from '@/components/clusters/cluster-tabs-config'
import { ConnectionStatusBadge } from '@/components/ConnectionStatusBadge'
import { useCachedResources } from '@/hooks/useCachedResources'
import { useResourceSSE } from '@/hooks/useResourceSSE'
import { SYNC_INTERVAL_MS } from '@/config/constants'
import { trpc } from '@/lib/trpc'

export default function ClusterLayout({ children }: { children: React.ReactNode }) {
  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  // Instant cached data via HTTP (before SSE connects)
  useCachedResources(clusterId)
  // Real-time resource updates — SSE connection covers ALL tabs
  const { connectionState } = useResourceSSE(clusterId)

  const pathname = usePathname()
  const router = useRouter()
  const contentRef = useRef<HTMLDivElement>(null)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId }, { staleTime: SYNC_INTERVAL_MS })
  const clusterRouteSegment = dbCluster.data
    ? getClusterRouteSegment({ id: dbCluster.data.id, name: dbCluster.data.name })
    : routeSegment
  const clusterName = (dbCluster.data?.name as string | undefined) ?? null
  const isClusterLoading = dbCluster.isLoading
  const isNotFound = !isClusterLoading && !dbCluster.data && dbCluster.error

  // Determine active tab from pathname
  const getActiveTab = () => {
    // Strip the /clusters/[id] prefix
    const base = `/clusters/${clusterRouteSegment}`
    const rest = pathname.replace(base, '')
    if (!rest || rest === '/') return 'overview'
    const segment = rest.replace(/^\//, '').split('/')[0]
    return segment || 'overview'
  }
  const activeTab = getActiveTab()

  // Keyboard shortcuts: [ and ] for prev/next tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )
        return
      // Skip if modifier keys are pressed
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key !== '[' && e.key !== ']') return

      const allTabs = getAllTabPaths()
      const tabsCount = allTabs.length
      const currentTabIndex = allTabs.findIndex((tab) => tab.id === activeTab)

      if (e.key === '[') {
        e.preventDefault()
        const prevIdx = (currentTabIndex - 1 + tabsCount) % tabsCount
        const tab = allTabs[prevIdx]
        if (tab) router.push(`/clusters/${clusterRouteSegment}${tab.path}`)
      } else if (e.key === ']') {
        e.preventDefault()
        const nextIdx = (currentTabIndex + 1) % tabsCount
        const tab = allTabs[nextIdx]
        if (tab) router.push(`/clusters/${clusterRouteSegment}${tab.path}`)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [clusterRouteSegment, activeTab, router])

  // Focus main content area after tab navigation for accessibility
  useEffect(() => {
    contentRef.current?.focus({ preventScroll: true })
  }, [activeTab])

  // Show "Cluster not found" page when cluster doesn't exist
  if (isNotFound) {
    return (
      <AppLayout>
        <Breadcrumbs segmentLabels={{ [routeSegment]: 'Not Found' }} />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-[var(--color-status-error)]/10 p-4 mb-4">
            <svg
              className="h-8 w-8 text-[var(--color-status-error)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            Cluster not found
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-6 max-w-md">
            The cluster you're looking for doesn't exist or you don't have permission to view it.
          </p>
          <button
            type="button"
            onClick={() => router.push('/clusters')}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            ← Back to Clusters
          </button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {/* Breadcrumb-fused cluster header — zero extra height */}
      <nav className="mb-4 flex flex-wrap items-center justify-between gap-1.5 text-xs font-mono">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link
            href="/"
            className="text-[var(--color-text-muted)] transition-colors duration-150 hover:text-[var(--color-accent)]"
          >
            <Home className="h-3 w-3" />
          </Link>
          <ChevronRight className="h-3 w-3 text-[var(--color-text-dim)]" />
          <Link
            href="/clusters"
            className="text-[var(--color-text-muted)] transition-colors duration-150 hover:text-[var(--color-accent)]"
          >
            Clusters
          </Link>
          <ChevronRight className="h-3 w-3 text-[var(--color-text-dim)]" />
          {/* P3-010: Shared element transition from cluster list icon */}
          <ProviderLogo
            provider={
              ((dbCluster.data as Record<string, unknown> | undefined)?.provider as string) ??
              'kubernetes'
            }
            size={14}
            layoutId={`cluster-icon-${clusterId}`}
          />
          {isClusterLoading ? (
            <div className="h-4 w-48 rounded bg-white/[0.06] animate-pulse" />
          ) : (
            <span
              className="font-bold text-[var(--color-text-primary)] truncate max-w-[min(48vw,20rem)]"
              title={clusterName ?? undefined}
            >
              {clusterName ?? 'Unknown Cluster'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isClusterLoading && (
            <>
              <span className="text-[var(--color-text-dim)]">
                {((dbCluster.data as Record<string, unknown> | undefined)?.provider as string) ??
                  '—'}
              </span>
              {(dbCluster.data?.status as string | undefined) &&
                (() => {
                  const status = dbCluster.data?.status as string
                  const isDisconnected = /disconnected|unreachable|error/i.test(status)
                  return (
                    <>
                      <span
                        className={`px-1.5 py-0.5 rounded-md border ${
                          isDisconnected
                            ? 'bg-[var(--color-status-error)]/10 text-[var(--color-status-error)] border-[var(--color-status-error)]/30'
                            : 'bg-white/[0.05] text-[var(--color-text-secondary)] border-[var(--color-border)]'
                        }`}
                      >
                        {status}
                      </span>
                      {isDisconnected && (
                        <button
                          type="button"
                          onClick={() => router.push(`/clusters/${clusterRouteSegment}/settings`)}
                          className="font-medium px-2 py-0.5 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/20 transition-colors cursor-pointer"
                        >
                          Reconnect
                        </button>
                      )}
                    </>
                  )
                })()}
              <ConnectionStatusBadge state={connectionState} />
            </>
          )}
        </div>
      </nav>

      {/* Grouped Tab Bar */}
      <GroupedTabBar clusterRouteSegment={clusterRouteSegment} activeTab={activeTab} />

      {/* Tab Content with AnimatePresence */}
      <ErrorBoundary
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              This tab encountered an error.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        }
      >
        <AnimatePresence mode="sync">
          <motion.div
            ref={contentRef}
            tabIndex={-1}
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="outline-none"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </ErrorBoundary>
    </AppLayout>
  )
}
