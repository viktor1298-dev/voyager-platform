'use client'

import { AppLayout } from '@/components/AppLayout'
import { ClusterHealthIndicator } from '@/components/ClusterHealthIndicator'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { SkeletonCard, SkeletonText } from '@/components/Skeleton'
import { PageTransition } from '@/components/animations'
import { SparklineChart, generateStableTimeSeries } from '@/components/charts/SparklineChart'
import { DashboardEditBar } from '@/components/dashboard/DashboardEditBar'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { WidgetLibraryDrawer } from '@/components/dashboard/WidgetLibraryDrawer'
import {
  ENV_META,
  getClusterEnvironment,
  getClusterTags,
  normalizeHealth,
  type ClusterEnvironment,
} from '@/lib/cluster-meta'
import { LIVE_CLUSTER_REFETCH_MS, DB_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { useClusterContext } from '@/stores/cluster-context'
import { useDashboardLayout } from '@/stores/dashboard-layout'
import { AlertTriangle, Box, CheckCircle2, Database, LayoutGrid, Pencil, Server, ShieldAlert, TriangleAlert, XCircle } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
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

const STATUS_META: Record<
  string,
  {
    label: string
    shortLabel: string
    icon: typeof CheckCircle2
    color: string
    softClass: string
  }
> = {
  degraded: {
    label: '⚠ Warning',
    shortLabel: 'Warning',
    icon: TriangleAlert,
    color: 'var(--color-status-warning)',
    softClass: 'border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning)]/12 text-[var(--color-status-warning)]',
  },
  warning: {
    label: '⚠ Warning',
    shortLabel: 'Warning',
    icon: TriangleAlert,
    color: 'var(--color-status-warning)',
    softClass: 'border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning)]/12 text-[var(--color-status-warning)]',
  },
  healthy: {
    label: '✓ Healthy',
    shortLabel: 'Healthy',
    icon: CheckCircle2,
    color: 'var(--color-status-active)',
    softClass: 'border-[var(--color-status-active)]/30 bg-[var(--color-status-active)]/12 text-[var(--color-status-active)]',
  },
}

type HealthGroup = 'healthy' | 'degraded' | 'critical'

const HEALTH_GROUP_ORDER: HealthGroup[] = ['critical', 'degraded', 'healthy']

const HEALTH_GROUP_META: Record<
  HealthGroup,
  { label: string; dotColor: string; icon: typeof CheckCircle2 }
> = {
  healthy: { label: '✓ Healthy', dotColor: 'var(--color-status-active)', icon: CheckCircle2 },
  degraded: { label: '⚠ Warning', dotColor: 'var(--color-status-warning)', icon: TriangleAlert },
  critical: { label: '✕ Critical', dotColor: 'var(--color-status-error)', icon: XCircle },
}

function getHealthGroup(status: string | null | undefined): HealthGroup {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') return 'healthy'
  if (s === 'warning' || s === 'degraded') return 'degraded'
  return 'critical'
}

function formatCpuMetric(seed: number) {
  return `${Math.max(8, Math.min(96, 36 + (seed % 44)))}%`
}

function formatMemoryMetric(seed: number) {
  return `${Math.max(14, Math.min(94, 44 + (seed % 36)))}%`
}

function formatPodMetric(seed: number, nodeCount: number) {
  return Math.max(3, nodeCount * 3 + (seed % 7))
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
    const isLiveMinikube = liveData && (c.name === liveData.name || c.name === 'minikube-dev')
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
      if (q && !`${cluster.name} ${cluster.provider} ${cluster.tags.join(' ')}`.toLowerCase().includes(q)) return false
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
        <header className="mb-3 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--color-text-muted)]">
              Operations overview
            </p>
            <h1 className="text-base font-semibold tracking-tight text-[var(--color-text-secondary)] sm:text-lg">
              Dashboard
            </h1>
            <p className="max-w-2xl text-sm text-[var(--color-text-secondary)]">
              KPI-first snapshot of cluster health, capacity, and warning pressure across your fleet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWidgetMode((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                widgetMode
                  ? 'border-[var(--color-accent)]/35 bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-white/[0.06]',
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
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-all hover:bg-white/[0.06]"
                data-testid="customize-dashboard-btn"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Customize</span>
              </button>
            )}
          </div>
        </header>

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
              onAdd={(type) => {
                addWidget(type)
                setDrawerOpen(false)
              }}
            />
          </>
        )}

        {!widgetMode && (
          <>
            <CompactStatsBar
              totalNodes={totalNodes}
              runningPods={runningPods}
              totalPods={liveData?.totalPods ?? 0}
              clusterCount={clusterList.length}
              warningEvents={warningEvents}
              healthCounts={healthCounts}
              isLoading={isLoading}
            />

            <section className="mb-6 rounded-2xl border border-[var(--color-border)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur sm:px-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/75 px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                    <ShieldAlert className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    <span>Clusters</span>
                    <span className="text-[var(--color-text-muted)]">{clusterList.filter((c) => c.source === 'live').length} live</span>
                    <span className="text-[var(--color-border)]">•</span>
                    <span className="text-[var(--color-text-muted)]">{clusterList.filter((c) => c.source === 'db').length} registered</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
                      Fleet inventory and health breakdown
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      Explore environments, isolate problem clusters fast, and compare operational density at a glance.
                    </p>
                  </div>
                </div>

                <div className="w-full overflow-x-auto xl:w-auto">
                  <div className="flex min-w-max items-center gap-1.5 rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-bg-secondary)]/80 p-1.5 shadow-inner">
                    {(['all', 'prod', 'staging', 'dev'] as const).map((filter) => {
                      const isActive = filters.environment === filter || (filter === 'all' && filters.environment === 'all')
                      const color = filter === 'all' ? 'var(--color-accent)' : ENV_META[filter].color
                      return (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setEnvironmentFilter(filter)}
                          className={cn(
                            'flex min-h-[44px] items-center gap-2 rounded-xl px-3.5 py-2 text-[11px] font-semibold tracking-wide transition-all duration-200',
                            isActive
                              ? 'border border-transparent bg-[var(--color-accent)] text-white shadow-[0_10px_28px_rgba(91,135,255,0.35)]'
                              : 'border border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:bg-white/[0.04] hover:text-[var(--color-text-primary)]',
                          )}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full border border-white/25"
                            style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.9)' : color }}
                          />
                          <span className="capitalize">{filter}</span>
                          <span className={cn('tabular-nums', isActive ? 'text-white/85' : 'text-[var(--color-text-muted)]')}>
                            {envCounts[filter]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <FilterBar options={filterOptions} onChange={onFiltersChange} className="mt-4" />
            </section>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : liveQuery.error && listQuery.error ? (
              <p className="text-[var(--color-status-error)]">
                Failed to load clusters: {liveQuery.error?.message ?? listQuery.error?.message}
              </p>
            ) : visibleClusters.length === 0 ? (
              <p className="text-[var(--color-text-secondary)]">No clusters match the current filters.</p>
            ) : (
              <div className="space-y-7">
                {ENV_ORDER.map((environment) => {
                  const clustersByHealth = groupedByEnvironment[environment]
                  const totalInEnvironment = Object.values(clustersByHealth).reduce((sum, clusters) => sum + clusters.length, 0)
                  if (totalInEnvironment === 0) return null
                  const meta = ENV_META[environment]

                  return (
                    <section
                      key={environment}
                      className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-bg-card)]/78 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)] backdrop-blur sm:p-5"
                    >
                      <div className="mb-4 flex flex-wrap items-center gap-3">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{meta.sectionLabel}</h3>
                        <span className="rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)]">
                          {totalInEnvironment} clusters
                        </span>
                        <div className="h-px min-w-[80px] flex-1 bg-[var(--color-border)]/40" />
                      </div>

                      <div className="space-y-5">
                        {HEALTH_GROUP_ORDER.map((healthGroup) => {
                          const clusters = clustersByHealth[healthGroup]
                          if (clusters.length === 0) return null
                          const healthMeta = HEALTH_GROUP_META[healthGroup]
                          const GroupIcon = healthMeta.icon

                          return (
                            <div key={healthGroup} className="space-y-3">
                              <div className="flex items-center gap-2.5">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/70">
                                  <GroupIcon className="h-3.5 w-3.5" style={{ color: healthMeta.dotColor }} />
                                </span>
                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                                  {healthMeta.label}
                                </span>
                                <span className="text-[11px] font-medium tabular-nums text-[var(--color-text-muted)]">
                                  {clusters.length}
                                </span>
                                <div className="h-px flex-1 bg-[var(--color-border)]/30" />
                              </div>

                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                <AnimatePresence mode="popLayout">
                                  {clusters.map((cluster) => {
                                    const idx = cardIndex++
                                    return <ClusterCard key={cluster.id} cluster={cluster} index={idx} />
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
          </>
        )}
      </PageTransition>
    </AppLayout>
  )
}

function DashboardPageFallback() {
  return (
    <AppLayout>
      <PageTransition>
        <header className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--color-text-muted)]">
            Operations overview
          </p>
          <h1 className="mt-1 text-base font-semibold text-[var(--color-text-secondary)]">Dashboard</h1>
        </header>

        <div className="mb-6 h-24 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 animate-pulse" />
        <div className="space-y-3">
          <SkeletonText width="14rem" height="1.75rem" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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

function ClusterCard({
  cluster,
  index,
}: {
  cluster: ClusterCardData
  index: number
}) {
  const status = cluster.status ?? 'unknown'
  const normalizedStatus = normalizeHealth(status)
  const statusMeta = STATUS_META[normalizedStatus]
  const StatusIcon = statusMeta.icon
  const envMeta = ENV_META[cluster.environment]
  const seed = Array.from(cluster.id).reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const cpuValue = formatCpuMetric(seed)
  const memoryValue = formatMemoryMetric(seed + 11)
  const podsValue = formatPodMetric(seed + 23, cluster.nodeCount)
  const sparkline = generateStableTimeSeries(`cluster-${cluster.id}`, Math.max(10, 35 + (seed % 40)), 0.22)

  return (
    <Link href={`/clusters/${cluster.id}`}>
      <m.div
        layout
        className="group relative flex h-full cursor-pointer flex-col rounded-2xl border border-[var(--color-border)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-4 shadow-[0_16px_38px_rgba(0,0,0,0.16)] transition-colors hover:border-[var(--color-border-hover)]"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        whileHover={{ y: -3, boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}
        whileTap={{ scale: 0.985 }}
        transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1], delay: index * 0.03 }}
      >
        <div
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
          style={{ backgroundColor: envMeta.color, opacity: 0.9 }}
        />

        <div className="flex items-start justify-between gap-3 pl-2">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', envMeta.badgeClass)}>
                {envMeta.label}
              </span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusMeta.softClass)}>
                <StatusIcon className="h-3.5 w-3.5" />
                {statusMeta.label}
              </span>
            </div>
            <div>
              <h3 className="line-clamp-2 text-base font-semibold leading-tight text-[var(--color-text-primary)]">
                {cluster.name}
              </h3>
              <p className="mt-1 text-[12px] font-medium text-[var(--color-text-secondary)]">
                {cluster.provider} {cluster.version ? `• Kubernetes ${cluster.version}` : '• Version unavailable'}
              </p>
            </div>
          </div>

          {cluster.source === 'db' ? (
            <div className="pt-0.5">
              <ClusterHealthIndicator clusterId={cluster.id} size="md" showLatency onCheck={() => {}} />
            </div>
          ) : (
            <span className="rounded-full border border-[var(--color-status-active)]/25 bg-[var(--color-status-active)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--color-status-active)]">
              Live context
            </span>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/48 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
              Health trend
            </span>
            <span className="text-[11px] font-medium text-[var(--color-text-muted)]">24h</span>
          </div>
          <SparklineChart data={sparkline} color={statusMeta.color} height={56} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'CPU', value: cpuValue },
            { label: 'Memory', value: memoryValue },
            { label: 'Pods', value: String(podsValue) },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/36 px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                {metric.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 pl-2 text-[11px] font-medium text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            {cluster.nodeCount} {cluster.nodeCount === 1 ? 'node' : 'nodes'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            Source: {cluster.source === 'live' ? 'live stream' : 'registered'}
          </span>
        </div>
      </m.div>
    </Link>
  )
}

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
    return <div className="mb-6 h-28 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 animate-pulse" />
  }

  const stats = [
    {
      icon: <Server className="h-4 w-4" />,
      value: String(totalNodes),
      label: 'Nodes',
      accent: 'var(--color-accent)',
      helper: 'Active compute capacity',
    },
    {
      icon: <Box className="h-4 w-4" />,
      value: `${runningPods}/${totalPods}`,
      label: 'Pods',
      accent: 'var(--color-status-active)',
      helper: 'Running vs observed',
    },
    {
      icon: <Database className="h-4 w-4" />,
      value: String(clusterCount),
      label: 'Clusters',
      accent: 'var(--color-accent)',
      helper: 'Fleet-wide inventory',
    },
    {
      icon: <AlertTriangle className="h-4 w-4" />,
      value: String(warningEvents),
      label: 'Warnings',
      accent: warningEvents > 0 ? 'var(--color-status-warning)' : 'var(--color-text-secondary)',
      helper: warningEvents > 0 ? 'Needs operator attention' : 'No active warning spike',
    },
  ]

  return (
    <section className="mb-6 rounded-3xl border border-[var(--color-border)]/80 bg-[linear-gradient(135deg,rgba(91,135,255,0.16),rgba(255,255,255,0.02))] p-4 shadow-[0_26px_70px_rgba(0,0,0,0.22)] backdrop-blur sm:p-5">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-text-secondary)]">
            Main KPIs
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
            Operations pulse
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Make this the first thing your eye lands on: fleet volume, pod health, and warning pressure.
          </p>
        </div>

        {healthCounts && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'healthy', label: '✓ Healthy', value: healthCounts.healthy, tone: 'var(--color-status-active)' },
                { key: 'degraded', label: '⚠ Warning', value: healthCounts.degraded, tone: 'var(--color-status-warning)' },
                { key: 'critical', label: '✕ Critical', value: healthCounts.critical, tone: 'var(--color-status-error)' },
              ] as const
            ).map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{
                  color: item.tone,
                  borderColor: `${item.tone}55`,
                  backgroundColor: `${item.tone}14`,
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.tone }} />
                {item.label}
                <span className="tabular-nums text-[var(--color-text-primary)]">{item.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-bg-card)]/72 p-4 shadow-[0_14px_34px_rgba(0,0,0,0.16)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border"
                style={{ color: stat.accent, borderColor: `${stat.accent}44`, backgroundColor: `${stat.accent}18` }}
              >
                {stat.icon}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                {stat.label}
              </span>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{stat.value}</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{stat.helper}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
