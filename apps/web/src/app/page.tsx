'use client'

import { AppLayout } from '@/components/AppLayout'
import { ClusterHealthIndicator } from '@/components/ClusterHealthIndicator'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { SkeletonCard, SkeletonText } from '@/components/Skeleton'
import { PageTransition } from '@/components/animations'
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
import { AlertTriangle, Box, CheckCircle2, ChevronDown, Database, LayoutGrid, Pencil, Server, ShieldAlert, TriangleAlert, XCircle } from 'lucide-react'
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

function getStatusSummary(status: string | null | undefined) {
  const group = getHealthGroup(status)
  if (group === 'healthy') return 'Serving traffic normally'
  if (group === 'degraded') return 'Needs operator attention'
  return 'Review cluster health details'
}

function getSourceSummary(source: ClusterCardData['source']) {
  return source === 'live' ? 'Live stream connected' : 'Inventory snapshot'
}

function getCapabilityBadges(cluster: ClusterCardData) {
  const badges = [cluster.provider]
  if (cluster.version) badges.push(`K8s ${cluster.version}`)
  if (cluster.nodeCount >= 5) badges.push('Multi-node')
  if (cluster.source === 'live') badges.push('Realtime')
  return badges.slice(0, 3)
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
            <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--color-text-dim)]">
              Operations overview
            </p>
            <h1 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-lg">
              Dashboard
            </h1>
            <p className="max-w-2xl text-sm text-[var(--color-text-dim)]">
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
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/75 px-3 py-1 text-[11px] font-medium text-[var(--color-text-dim)]">
                    <ShieldAlert className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    <span>Clusters</span>
                    <span className="text-[var(--color-text-dim)]">{clusterList.filter((c) => c.source === 'live').length} live</span>
                    <span className="text-[var(--color-border)]">•</span>
                    <span className="text-[var(--color-text-dim)]">{clusterList.filter((c) => c.source === 'db').length} registered</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
                      Fleet inventory and health breakdown
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-dim)]">
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
                              : 'border border-transparent text-[var(--color-text-dim)] hover:border-[var(--color-border)] hover:bg-white/[0.04] hover:text-[var(--color-text-primary)]',
                          )}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full border border-white/25"
                            style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.9)' : color }}
                          />
                          <span className="capitalize">{filter}</span>
                          <span className={cn('tabular-nums', isActive ? 'text-white/85' : 'text-[var(--color-text-dim)]')}>
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
              <div className="space-y-7 3xl:space-y-8">
                {ENV_ORDER.map((environment) => {
                  const clustersByHealth = groupedByEnvironment[environment]
                  const totalInEnvironment = Object.values(clustersByHealth).reduce((sum, clusters) => sum + clusters.length, 0)
                  if (totalInEnvironment === 0) return null
                  const meta = ENV_META[environment]
                  const environmentSummary = HEALTH_GROUP_ORDER.map((healthGroup) => ({
                    key: healthGroup,
                    value: clustersByHealth[healthGroup].length,
                    meta: HEALTH_GROUP_META[healthGroup],
                  }))

                  return (
                    <section
                      key={environment}
                      className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-bg-card)]/78 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)] backdrop-blur sm:p-5 2xl:p-6"
                    >
                      <div className="mb-5 flex flex-wrap items-center gap-3 2xl:mb-6">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{meta.sectionLabel}</h3>
                        <span className="rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-text-dim)]">
                          {totalInEnvironment} clusters
                        </span>
                        <div className="h-px min-w-[80px] flex-1 bg-[var(--color-border)]/40" />
                      </div>

                      <div className="grid gap-5 3xl:grid-cols-[280px_minmax(0,1fr)] 3xl:items-start">
                        <aside className="rounded-2xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/50 p-4 2xl:p-5">
                          <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--color-text-dim)]">
                            {meta.label} environment
                          </p>
                          <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
                            {totalInEnvironment} active clusters in this lane
                          </p>
                          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                            Wide view groups clusters by health so operators can scan problem areas first without losing environment context.
                          </p>

                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 3xl:grid-cols-1">
                            {environmentSummary.map((item) => (
                              <div
                                key={item.key}
                                className="rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-card)]/72 px-3 py-3"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/70"
                                  >
                                    <item.meta.icon className="h-3.5 w-3.5" style={{ color: item.meta.dotColor }} />
                                  </span>
                                  <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--color-text-dim)]">
                                    {item.meta.label}
                                  </span>
                                </div>
                                <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)] tabular-nums">
                                  {item.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        </aside>

                        <div className="grid gap-4 2xl:grid-cols-2 3xl:grid-cols-3 3xl:gap-5">
                          {HEALTH_GROUP_ORDER.map((healthGroup) => {
                            const clusters = clustersByHealth[healthGroup]
                            if (clusters.length === 0) return null
                            const healthMeta = HEALTH_GROUP_META[healthGroup]
                            const GroupIcon = healthMeta.icon

                            return (
                              <div
                                key={healthGroup}
                                className="flex h-full min-h-[220px] flex-col rounded-2xl border border-[var(--color-border)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.018))] p-3.5 2xl:p-4"
                              >
                                <div className="mb-3 flex items-center gap-2.5">
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/70">
                                    <GroupIcon className="h-3.5 w-3.5" style={{ color: healthMeta.dotColor }} />
                                  </span>
                                  <span className="text-[11px] font-semibold tracking-[0.04em] text-[var(--color-text-dim)]">
                                    {healthMeta.label}
                                  </span>
                                  <span className="text-[11px] font-medium tabular-nums text-[var(--color-text-dim)]">
                                    {clusters.length}
                                  </span>
                                  <div className="h-px flex-1 bg-[var(--color-border)]/30" />
                                </div>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-1 4xl:grid-cols-2">
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
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--color-text-muted)]">
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
  const sourceSummary = getSourceSummary(cluster.source)
  const statusSummary = getStatusSummary(cluster.status)
  const capabilityBadges = getCapabilityBadges(cluster)

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
              <p className="mt-1 text-[12px] font-medium text-[var(--color-text-dim)]">
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--color-text-dim)]">
                Status summary
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{statusSummary}</p>
            </div>
            <span className="rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-card)]/80 px-2.5 py-1 text-[10px] font-medium tracking-[0.02em] text-[var(--color-text-dim)]">
              {sourceSummary}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Nodes', value: String(cluster.nodeCount) },
            { label: 'Source', value: cluster.source === 'live' ? 'Live' : 'DB' },
            { label: 'Version', value: cluster.version ? cluster.version : 'N/A' },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/36 px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold tracking-[0.04em] text-[var(--color-text-dim)]">
                {metric.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{metric.value}</p>
            </div>
          ))}
        </div>

        {/* Fix #3: tag chips are display-only — no hover change, no pointer, select-none */}
        <div className="mt-4 flex flex-wrap gap-2 pl-2">
          {capabilityBadges.map((badge) => (
            <span
              key={badge}
              className="pointer-events-none inline-flex select-none items-center rounded-full border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/55 px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-[var(--color-text-dim)]"
            >
              {badge}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 pl-2 text-[11px] font-medium text-[var(--color-text-dim)]">
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
            {cluster.nodeCount} {cluster.nodeCount === 1 ? 'node' : 'nodes'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
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
  const [expanded, setExpanded] = useState(false)

  if (isLoading) {
    return <div className="mb-5 h-14 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 animate-pulse" />
  }

  /* Fix #6: normalize icon sizes — all KPI icons use h-3.5 w-3.5 consistently */
  const stats = [
    {
      icon: <Server className="h-3.5 w-3.5" />,
      value: String(totalNodes),
      label: 'Nodes',
      accent: 'var(--color-accent)',
      helper: 'Active compute capacity',
    },
    {
      icon: <Box className="h-3.5 w-3.5" />,
      value: `${runningPods}/${totalPods}`,
      label: 'Pods',
      accent: 'var(--color-status-active)',
      helper: 'Running vs observed',
    },
    {
      icon: <Database className="h-3.5 w-3.5" />,
      value: String(clusterCount),
      label: 'Clusters',
      accent: 'var(--color-accent)',
      helper: 'Fleet-wide inventory',
    },
    {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      value: String(warningEvents),
      label: 'Warnings',
      accent: warningEvents > 0 ? 'var(--color-status-warning)' : 'var(--color-text-secondary)',
      helper: warningEvents > 0 ? 'Needs operator attention' : 'No active warning spike',
    },
  ]

  return (
    <section className="mb-5">
      {/* Collapsed: compact KPI strip — always visible */}
      <div className="rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-secondary)]/40 backdrop-blur">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
          aria-expanded={expanded}
          aria-controls="operations-pulse-panel"
          data-testid="operations-pulse-toggle"
        >
          <div className="flex items-center gap-4 overflow-x-auto">
            <span className="shrink-0 text-[11px] font-semibold tracking-[0.04em] text-[var(--color-text-dim)]">
              Operations pulse
            </span>
            <div className="flex items-center gap-3">
              {stats.map((stat) => (
                <span key={stat.label} className="inline-flex shrink-0 items-center gap-1.5 text-xs">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md"
                    style={{ color: stat.accent, backgroundColor: `${stat.accent}18` }}
                  >
                    {stat.icon}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">{stat.value}</span>
                  <span className="text-[var(--color-text-dim)]">{stat.label}</span>
                </span>
              ))}
            </div>
            {healthCounts && (
              <div className="hidden items-center gap-2 lg:flex">
                <span className="mx-1 h-4 w-px bg-[var(--color-border)]/60" />
                {(
                  [
                    { key: 'healthy', label: 'Healthy', value: healthCounts.healthy, tone: 'var(--color-status-active)' },
                    { key: 'degraded', label: 'Warning', value: healthCounts.degraded, tone: 'var(--color-status-warning)' },
                    { key: 'critical', label: 'Critical', value: healthCounts.critical, tone: 'var(--color-status-error)' },
                  ] as const
                ).map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium"
                    style={{ color: item.tone }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.tone }} />
                    <span className="tabular-nums">{item.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-[var(--color-text-dim)] transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </button>

        {/* Expanded: detailed KPI cards */}
        <AnimatePresence>
          {expanded && (
            <m.div
              id="operations-pulse-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-[var(--color-border)]/50 px-4 pb-4 pt-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-card)]/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Fix #6: normalized icon container — h-8 w-8 rounded-xl consistently */}
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border"
                          style={{ color: stat.accent, borderColor: `${stat.accent}44`, backgroundColor: `${stat.accent}18` }}
                        >
                          {stat.icon}
                        </span>
                        <span className="text-[10px] font-semibold tracking-[0.04em] text-[var(--color-text-dim)]">
                          {stat.label}
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">{stat.value}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-dim)]">{stat.helper}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
