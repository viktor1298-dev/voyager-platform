'use client'

import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProviderLogo } from '@/components/ProviderLogo'
import { getClusterIdFromRouteSegment, getClusterRouteSegment } from '@/components/cluster-route'
import { trpc } from '@/lib/trpc'

const CLUSTER_TABS = [
  { id: 'overview', label: 'Overview', path: '' },
  { id: 'nodes', label: 'Nodes', path: '/nodes' },
  { id: 'pods', label: 'Pods', path: '/pods' },
  { id: 'deployments', label: 'Deployments', path: '/deployments' },
  { id: 'services', label: 'Services', path: '/services' },
  { id: 'namespaces', label: 'Namespaces', path: '/namespaces' },
  { id: 'events', label: 'Events', path: '/events' },
  { id: 'logs', label: 'Logs', path: '/logs' },
  { id: 'metrics', label: 'Metrics', path: '/metrics' },
  { id: 'autoscaling', label: 'Autoscaling', path: '/autoscaling' },
] as const

// P3-014: providerIcon removed — replaced by ProviderLogo component with layoutId support

export default function ClusterLayout({ children }: { children: React.ReactNode }) {
  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const pathname = usePathname()
  const router = useRouter()

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId }, { staleTime: 30000 })
  const clusterRouteSegment = dbCluster.data
    ? getClusterRouteSegment({ id: dbCluster.data.id, name: dbCluster.data.name })
    : routeSegment
  const clusterName = (dbCluster.data?.name as string | undefined) ?? null
  const isClusterLoading = dbCluster.isLoading
  const isNotFound = !isClusterLoading && !dbCluster.data && dbCluster.error

  // Keyboard shortcuts: 1–9 for tabs, [ and ] for prev/next
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return
      // Skip if modifier keys are pressed
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const tabsCount = CLUSTER_TABS.length
      const currentTabIndex = CLUSTER_TABS.findIndex((tab) => {
        const base = `/clusters/${clusterRouteSegment}`
        const rest = pathname.replace(base, '')
        if (!rest || rest === '/') return tab.id === 'overview'
        const segment = rest.replace(/^\//, '').split('/')[0]
        return tab.id === (segment || 'overview')
      })

      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1
        if (idx < tabsCount) {
          e.preventDefault()
          const tab = CLUSTER_TABS[idx]
          if (tab) router.push(`/clusters/${clusterRouteSegment}${tab.path}`)
        }
      } else if (e.key === '[') {
        e.preventDefault()
        const prevIdx = (currentTabIndex - 1 + tabsCount) % tabsCount
        const tab = CLUSTER_TABS[prevIdx]
        if (tab) router.push(`/clusters/${clusterRouteSegment}${tab.path}`)
      } else if (e.key === ']') {
        e.preventDefault()
        const nextIdx = (currentTabIndex + 1) % tabsCount
        const tab = CLUSTER_TABS[nextIdx]
        if (tab) router.push(`/clusters/${clusterRouteSegment}${tab.path}`)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [clusterRouteSegment, pathname, router])

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

  // Show "Cluster not found" page when cluster doesn't exist
  if (isNotFound) {
    return (
      <AppLayout>
        <Breadcrumbs segmentLabels={{ [routeSegment]: 'Not Found' }} />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-[var(--color-status-error)]/10 p-4 mb-4">
            <svg className="h-8 w-8 text-[var(--color-status-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Cluster not found</h1>
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
      <Breadcrumbs
        segmentLabels={{ [routeSegment]: clusterName ?? 'Loading...' }}
      />

      {/* Cluster Header */}
      <div
        className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 mb-3"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* P3-010: Shared element transition from cluster list icon */}
          <ProviderLogo
            provider={((dbCluster.data as Record<string, unknown> | undefined)?.provider as string) ?? 'kubernetes'}
            size={20}
            layoutId={`cluster-icon-${clusterId}`}
          />
          <div className="min-w-0 flex-1">
            {isClusterLoading ? (
              <div className="space-y-1.5">
                <div className="h-6 w-48 rounded-md bg-white/[0.06] animate-pulse" />
                <div className="h-4 w-24 rounded-md bg-white/[0.04] animate-pulse" />
              </div>
            ) : (
              <>
                <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)] truncate">
                  {clusterName ?? 'Unknown Cluster'}
                </h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
                    {(dbCluster.data as Record<string, unknown> | undefined)?.provider as string ?? '—'}
                  </span>
                  {(dbCluster.data?.status as string | undefined) && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                      {dbCluster.data?.status as string}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 10-Tab Bar */}
      <div className="mb-3 border-b border-[var(--color-border)] overflow-x-auto">
        <nav
          className="flex items-end gap-0 min-w-max"
          aria-label="Cluster tabs"
        >
          {CLUSTER_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const href = `/clusters/${clusterRouteSegment}${tab.path}`
            return (
              <Link
                key={tab.id}
                href={href}
                data-testid={`cluster-tab-${tab.id}`}
                className={`relative px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {tab.label}
                {/* Active tab underline with layoutId spring animation */}
                {isActive && (
                  <motion.div
                    layoutId="cluster-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--color-accent)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Tab Content with AnimatePresence */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </AppLayout>
  )
}
