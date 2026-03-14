'use client'

import { AppLayout } from '@/components/AppLayout'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { PageTransition } from '@/components/animations'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardEditBar } from '@/components/dashboard/DashboardEditBar'
import { WidgetLibraryDrawer } from '@/components/dashboard/WidgetLibraryDrawer'
import { SkeletonCard, SkeletonText } from '@/components/Skeleton'
import { LayoutGrid, Pencil } from 'lucide-react'
import { m, AnimatePresence } from 'motion/react'
import { ClusterHealthIndicator } from '@/components/ClusterHealthIndicator'
import {
  ENV_META,
  getClusterEnvironment,
  getClusterTags,
  normalizeHealth,
  type ClusterEnvironment,
} from '@/lib/cluster-meta'
import {
  getStatusColor,
  getStatusDotClass,
  getStatusGlow,
  getStatusGlowHover,
} from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { useClusterContext } from '@/stores/cluster-context'
import { LIVE_CLUSTER_REFETCH_MS, DB_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'
import { useDashboardLayout } from '@/stores/dashboard-layout'
import { AlertTriangle, Box, Database, Server } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface ClusterCardData {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  nodeCount: number
  source: 'live' | 'db'
  environment: ClusterEnvironment
  tags: string[]
}

const ENV_ORDER: ClusterEnvironment[] = ['prod', 'staging', 'dev']

const STATUS_META: Record<string, { label: string; color: string }> = {
  degraded: { label: 'Degraded', color: 'var(--color-status-error)' },
  warning: { label: 'Warning', color: 'var(--color-status-warning)' },
  healthy: { label: 'Healthy', color: 'var(--color-status-active)' },
}

type HealthGroup = 'healthy' | 'degraded' | 'critical'

const HEALTH_GROUP_ORDER: HealthGroup[] = ['critical', 'degraded', 'healthy']

const HEALTH_GROUP_META: Record<HealthGroup, { label: string; dotColor: string }> = {
  healthy: { label: 'Healthy', dotColor: 'var(--color-status-active)' },
  degraded: { label: 'Degraded', dotColor: 'var(--color-status-warning)' },
  critical: { label: 'Critical', dotColor: 'var(--color-status-error)' },
}

function getHealthGroup(status: string | null | undefined): HealthGroup {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') return 'healthy'
  if (s === 'warning' || s === 'degraded') return 'degraded'
  return 'critical'
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [filters, setFilters] = useState<FilterValue>({
    environment: 'all',
    status: 'all',
    provider: 'all',
    health: 'all',
    tags: [],
    q: '',
  })

  useEffect(() => {
    const env = searchParams.get('environment')
    if (env === 'prod' || env === 'staging' || env === 'dev' || env === 'all') {
      setFilters((prev) => ({ ...prev, environment: env }))
    } else if (!env) {
      setFilters((prev) => ({ ...prev, environment: 'all' }))
    }
  }, [searchParams])

  const setEnvironmentFilter = (environment: FilterValue['environment']) => {
    const next = new URLSearchParams(searchParams.toString())
    if (environment === 'all') next.delete('environment')
    else next.set('environment', environment)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
    setFilters((prev) => ({ ...prev, environment }))
  }

  const activeClusterId = useClusterContext((s) => s.activeClusterId)

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: activeClusterId ?? '' },
    {
      refetchInterval: LIVE_CLUSTER_REFETCH_MS,
      enabled: Boolean(activeClusterId),
    },
  )

  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: DB_CLUSTER_REFETCH_MS,
  })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  const clusterList: ClusterCardData[] = []

  if (liveData) {
    clusterList.push({
      id: activeClusterId ?? 'live',
      name: liveData.name,
      provider: liveData.provider,
      version: liveData.version,
      status: liveData.status,
      nodeCount: liveData.nodes.length,
      source: 'live',
      environment: getClusterEnvironment(liveData.name, liveData.provider),
      tags: getClusterTags({ name: liveData.name, provider: liveData.provider, source: 'live' }),
    })
  }

  for (const c of dbClusters) {
    const isLiveMinikube =
      liveData && (c.name === liveData.name || c.name === 'minikube-dev')
    if (!isLiveMinikube) {
      clusterList.push({
        id: c.id,
        name: c.name,
        provider: typeof c.provider === 'string' ? c.provider : 'unknown',
        version: typeof c.version === 'string' ? c.version : null,
        status: typeof c.status === 'string' ? c.status : null,
        nodeCount: c.nodeCount,
        source: 'db',
        environment: getClusterEnvironment(c.name, c.provider),
        tags: getClusterTags({ name: c.name, provider: c.provider, source: 'db' }),
      })
    }
  }

  const totalNodes =
    (liveData?.nodes.length ?? 0) +
    dbClusters
      .filter((c) => !(liveData && (c.name === liveData.name || c.name === 'minikube-dev')))
      .reduce((sum, c) => sum + c.nodeCount, 0)
  const runningPods = liveData?.runningPods ?? 0
  const warningEvents = liveData?.events.filter((e) => e.type === 'Warning').length ?? 0

  // IA-002: aggregate health counts for CompactStatsBar
  const healthCounts = useMemo(() => {
    const counts = { healthy: 0, degraded: 0, critical: 0 }
    for (const c of clusterList) counts[getHealthGroup(c.status)]++
    return counts
  }, [clusterList])

  const filterOptions = useMemo(() => {
    const statuses = new Set<string>()
    const providers = new Set<string>()
    const health = new Set<string>()
    const tags = new Set<string>()

    for (const cluster of clusterList) {
      statuses.add((cluster.status ?? 'unknown').toLowerCase())
      providers.add(cluster.provider)
      health.add(normalizeHealth(cluster.status))
      for (const tag of cluster.tags) tags.add(tag)
    }

    return {
      environments: ['prod', 'staging', 'dev'],
      statuses: Array.from(statuses).sort(),
      providers: Array.from(providers).sort(),
      health: Array.from(health),
      tags: Array.from(tags).sort(),
    }
  }, [clusterList])

  const visibleClusters = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return clusterList.filter((cluster) => {
      if (filters.environment !== 'all' && cluster.environment !== filters.environment) return false
      const statusValue = (cluster.status ?? 'unknown').toLowerCase()
      if (filters.status !== 'all' && statusValue !== filters.status) return false
      if (filters.provider !== 'all' && cluster.provider !== filters.provider) return false
      const healthValue = normalizeHealth(cluster.status)
      if (filters.health !== 'all' && healthValue !== filters.health) return false
      if (filters.tags.length > 0 && !filters.tags.every((tag) => cluster.tags.includes(tag))) return false
      if (
        q &&
        !`${cluster.name} ${cluster.provider} ${cluster.tags.join(' ')}`
          .toLowerCase()
          .includes(q)
      )
        return false
      return true
    })
  }, [clusterList, filters])

  const groupedByEnvironment = useMemo(() => {
    const grouped: Record<ClusterEnvironment, Record<HealthGroup, ClusterCardData[]>> = {
      prod: { healthy: [], degraded: [], critical: [] },
      staging: { healthy: [], degraded: [], critical: [] },
      dev: { healthy: [], degraded: [], critical: [] },
    }

    for (const cluster of visibleClusters) {
      grouped[cluster.environment][getHealthGroup(cluster.status)].push(cluster)
    }

    return grouped
  }, [visibleClusters])

  const envCounts = {
    all: clusterList.length,
    prod: clusterList.filter((c) => c.environment === 'prod').length,
    staging: clusterList.filter((c) => c.environment === 'staging').length,
    dev: clusterList.filter((c) => c.environment === 'dev').length,
  }

  const onFiltersChange = useCallback((next: FilterValue) => {
    setFilters(next)
  }, [])

  // M-P3-004: Dashboard widget customization
  const editMode = useDashboardLayout((s) => s.editMode)
  const setEditMode = useDashboardLayout((s) => s.setEditMode)
  const addWidget = useDashboardLayout((s) => s.addWidget)
  const resetToDefault = useDashboardLayout((s) => s.resetToDefault)
  const getLayoutForServer = useDashboardLayout((s) => s.getLayoutForServer)
  const applyServerLayout = useDashboardLayout((s) => s.applyServerLayout)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [widgetMode, setWidgetMode] = useState(false)

  const saveLayoutMutation = trpc.dashboardLayout.save.useMutation({
    onSuccess: () => toast.success('Layout saved'),
    onError: () => toast.error('Failed to save layout'),
  })

  const serverLayoutQuery = trpc.dashboardLayout.get.useQuery(undefined)
  useEffect(() => {
    if (serverLayoutQuery.data) applyServerLayout(serverLayoutQuery.data)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLayoutQuery.data])

  const handleSaveLayout = async () => {
    const layout = getLayoutForServer()
    await saveLayoutMutation.mutateAsync(layout)
    setEditMode(false)
    setDrawerOpen(false)
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    setDrawerOpen(false)
  }

  let cardIndex = 0

  return (
    <AppLayout>
      <PageTransition>
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWidgetMode((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                widgetMode
                  ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30'
                  : 'text-[var(--color-text-secondary)] hover:bg-white/[0.06] border border-[var(--color-border)]',
              )}
              data-testid="toggle-widget-mode-btn"
              title="Toggle widget dashboard mode"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Widgets</span>
            </button>
            {widgetMode && !editMode && (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[var(--color-text-secondary)] hover:bg-white/[0.06] border border-[var(--color-border)] transition-all"
                data-testid="customize-dashboard-btn"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Customize</span>
              </button>
            )}
          </div>
        </header>

        {/* M-P3-004: Widget dashboard mode */}
        {widgetMode && (
          <>
            {editMode && (
              <DashboardEditBar
                onAddWidget={() => setDrawerOpen(true)}
                onReset={resetToDefault}
                onCancel={handleCancelEdit}
                onSave={handleSaveLayout}
              />
            )}
            <DashboardGrid />
            <WidgetLibraryDrawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              onAdd={(type) => { addWidget(type); setDrawerOpen(false) }}
            />
          </>
        )}

        {/* Legacy hardcoded layout (hidden when widget mode active) */}
        {!widgetMode && (<>

        {/* DB-001: Compact stats bar — replaces 4 SummaryCard grid */}
        <CompactStatsBar
          totalNodes={totalNodes}
          runningPods={runningPods}
          totalPods={liveData?.totalPods ?? 0}
          clusterCount={clusterList.length}
          warningEvents={warningEvents}
          healthCounts={healthCounts}
          isLoading={isLoading}
        />

        <div className="flex flex-col gap-4 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">Clusters</h2>
              <p className="text-[11px] text-[var(--color-table-meta)] font-mono uppercase tracking-wider mt-0.5">
                {clusterList.filter((c) => c.source === 'live').length} live ·{' '}
                {clusterList.filter((c) => c.source === 'db').length} registered
              </p>
            </div>

            <div className="w-full sm:w-auto overflow-x-auto">
              <div className="flex min-w-max items-center gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]">
              {(['all', 'prod', 'staging', 'dev'] as const).map((filter) => {
                const isActive = filters.environment === filter || (filter === 'all' && filters.environment === 'all')
                const color = filter === 'all' ? 'var(--color-accent)' : ENV_META[filter].color
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setEnvironmentFilter(filter)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 min-h-[44px] rounded-md text-[11px] font-medium tracking-wide transition-all duration-200 cursor-pointer',
                      isActive
                        ? 'bg-white/[0.08] text-[var(--color-text-primary)] shadow-sm'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="capitalize">{filter}</span>
                    <span className="tabular-nums text-[var(--color-table-meta)]">{envCounts[filter]}</span>
                  </button>
                )
              })}
              </div>
            </div>
          </div>

          <FilterBar options={filterOptions} onChange={onFiltersChange} />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : liveQuery.error && listQuery.error ? (
          <p className="text-[var(--color-status-error)]">
            Failed to load clusters: {liveQuery.error?.message ?? listQuery.error?.message}
          </p>
        ) : visibleClusters.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">No clusters match the current filters.</p>
        ) : (
          <div className="space-y-6">
            {ENV_ORDER.map((environment) => {
              const clustersByHealth = groupedByEnvironment[environment]
              const totalInEnvironment = Object.values(clustersByHealth).reduce(
                (sum, clusters) => sum + clusters.length,
                0,
              )
              if (totalInEnvironment === 0) return null
              const meta = ENV_META[environment]

              return (
                <section key={environment} className="rounded-xl border border-[var(--color-border)] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{meta.sectionLabel}</h3>
                    <span className="text-[11px] text-[var(--color-text-dim)] tabular-nums">{totalInEnvironment}</span>
                    <div className="flex-1 h-px bg-[var(--color-border)]/40" />
                  </div>

                  <div className="space-y-4">
                    {HEALTH_GROUP_ORDER.map((healthGroup) => {
                      const clusters = clustersByHealth[healthGroup]
                      if (clusters.length === 0) return null
                      const healthMeta = HEALTH_GROUP_META[healthGroup]

                      return (
                        <div key={healthGroup} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: healthMeta.dotColor }} />
                            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-dim)]">
                              {healthMeta.label} ({clusters.length})
                            </span>
                            <div className="flex-1 h-px bg-[var(--color-border)]/30" />
                          </div>

                          {/* IA-009: AnimatePresence for filter reflow — REVIEW-004: wraps m.div children directly */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            <AnimatePresence mode="popLayout">
                              {clusters.map((cluster) => {
                                const idx = cardIndex++
                                return (
                                  <ClusterCard
                                    key={cluster.id}
                                    cluster={cluster}
                                    index={idx}
                                  />
                                )
                              })}
                            </AnimatePresence>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        </>)}
      </PageTransition>
    </AppLayout>
  )
}

function DashboardPageFallback() {
  return (
    <AppLayout>
      <PageTransition>
        <header className="mb-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Dashboard</h1>
        </header>

        {/* DB-001: compact stats bar skeleton */}
        <div className="mb-5 h-9 rounded-lg bg-[var(--color-bg-secondary)]/40 border border-[var(--color-border)] animate-pulse" />
        <div className="space-y-3">
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">Clusters</h2>
          <SkeletonText width="12rem" height="1.5rem" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardContent />
    </Suspense>
  )
}

// DB-002: Compact ClusterCard — single horizontal row, ~50% shorter
// IA-007: uses ClusterHealthIndicator (single subscription, no duplicates)
// IA-009: Motion animations
function ClusterCard({
  cluster,
  index,
}: {
  cluster: ClusterCardData
  index: number
}) {
  const status = cluster.status ?? 'unknown'
  const statusMeta = STATUS_META[normalizeHealth(status)]
  const envMeta = ENV_META[cluster.environment]

  return (
    <Link href={`/clusters/${cluster.id}`}>
      {/* IA-009: Motion card with whileHover y:-2 and layout prop */}
      <m.div
        layout
        className="cluster-card relative group rounded-lg cursor-pointer bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] flex flex-col px-3 py-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ y: -2, boxShadow: getStatusGlowHover(status) }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1], delay: index * 0.03 }}
        style={
          {
            '--status-color': getStatusColor(status),
            boxShadow: getStatusGlow(status),
          } as React.CSSProperties
        }
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-lg"
          style={{ backgroundColor: envMeta.color, opacity: 0.9 }}
        />

        {/* Row 1: Status dot + full cluster name */}
        <div className="flex items-start gap-1.5 ml-1">
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 animate-pulse-slow mt-[3px] ${getStatusDotClass(status)}`}
          />
          <span className="text-xs font-semibold text-[var(--color-text-primary)] whitespace-normal break-words leading-tight">
            {cluster.name}
          </span>
        </div>

        {/* Row 2: env badge + health indicator + version + node count */}
        <div className="flex items-center gap-1.5 ml-1 mt-1 flex-wrap">
          {/* Env badge */}
          <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0', envMeta.badgeClass)}>
            {envMeta.label}
          </span>

          {/* IA-007: ClusterHealthIndicator — single subscription, replaces HealthDot + HealthLatency + inline check */}
          {cluster.source === 'db' && (
            <ClusterHealthIndicator
              clusterId={cluster.id}
              size="sm"
              showLatency
              onCheck={() => {}}
            />
          )}

          {/* Node count */}
          <span className="text-[10px] font-mono text-[var(--color-text-muted)] shrink-0">
            {cluster.nodeCount}n
          </span>

          {/* K8s version */}
          <span className="text-[10px] font-mono text-[var(--color-text-dim)] shrink-0">
            {cluster.version ?? '—'}
          </span>

          {/* Status label */}
          <span className="text-[10px] text-[var(--color-text-dim)] shrink-0">{statusMeta.label}</span>
        </div>
      </m.div>
    </Link>
  )
}

// DB-001: Compact stats bar — replaces 4 large SummaryCard grid
// IA-002: enhanced with health aggregate counts
function CompactStatsBar({
  totalNodes,
  runningPods,
  totalPods,
  clusterCount,
  warningEvents,
  healthCounts,
  isLoading,
}: {
  totalNodes: number
  runningPods: number
  totalPods: number
  clusterCount: number
  warningEvents: number
  healthCounts?: { healthy: number; degraded: number; critical: number }
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <div className="mb-5 h-9 rounded-lg bg-[var(--color-bg-secondary)]/40 border border-[var(--color-border)] animate-pulse" />
    )
  }

  const stats = [
    { icon: <Server className="h-3 w-3" />, value: String(totalNodes), label: 'Nodes', color: 'var(--color-accent)' },
    { icon: <Box className="h-3 w-3" />, value: `${runningPods}/${totalPods}`, label: 'Pods', color: 'var(--color-status-active)' },
    { icon: <Database className="h-3 w-3" />, value: String(clusterCount), label: 'Clusters', color: 'var(--color-accent)' },
    {
      icon: <AlertTriangle className="h-3 w-3" />,
      value: String(warningEvents),
      label: 'Warnings',
      color: warningEvents > 0 ? 'var(--color-status-warning)' : 'var(--color-text-dim)',
    },
  ]

  return (
    <div className="mb-5 inline-flex items-center gap-3 bg-[var(--color-bg-secondary)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2 h-9 w-full overflow-x-auto">
      {stats.map((stat, i) => (
        <div key={stat.label} className="flex items-center gap-3 shrink-0">
          {i > 0 && <span className="text-[var(--color-border)] text-xs select-none">·</span>}
          <div className="inline-flex items-center gap-1.5">
            <span style={{ color: stat.color }}>{stat.icon}</span>
            <span className="text-xs font-mono font-semibold text-[var(--color-text-primary)]">
              {stat.value}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)] hidden sm:inline">{stat.label}</span>
          </div>
        </div>
      ))}
      {/* IA-002: health aggregate dots after Clusters */}
      {healthCounts && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[var(--color-border)] text-xs select-none">·</span>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-text-muted)] hidden sm:inline">Health</span>
            <span className="inline-flex items-center gap-1 text-xs font-mono">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-status-active)' }} />
              <span className="text-[var(--color-text-primary)] font-semibold">{healthCounts.healthy}</span>
              <span className="text-[var(--color-border)] mx-0.5">·</span>
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-status-warning)' }} />
              <span className="text-[var(--color-text-primary)] font-semibold">{healthCounts.degraded}</span>
              <span className="text-[var(--color-border)] mx-0.5">·</span>
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-status-error)' }} />
              <span className="text-[var(--color-text-primary)] font-semibold">{healthCounts.critical}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// IA-001: SystemHealthSection removed — data merged into ClusterCard (HealthDot tooltip + HealthLatency) and CompactStatsBar (IA-002)
