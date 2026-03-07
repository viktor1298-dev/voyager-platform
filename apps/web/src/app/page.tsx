'use client'

import { AppLayout } from '@/components/AppLayout'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { PageTransition } from '@/components/animations'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardEditBar } from '@/components/dashboard/DashboardEditBar'
import { WidgetLibraryDrawer } from '@/components/dashboard/WidgetLibraryDrawer'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonCard, SkeletonText, Shimmer } from '@/components/Skeleton'
import { HeartPulse, RefreshCw, Clock, Zap, LayoutGrid, Pencil } from 'lucide-react'
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
import { LIVE_CLUSTER_REFETCH_MS, DB_CLUSTER_REFETCH_MS, HEALTH_STATUS_REFETCH_MS } from '@/lib/cluster-constants'
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
          isLoading={isLoading}
        />

        <SystemHealthSection />

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

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {clusters.map((cluster) => {
                              const idx = cardIndex++
                              return (
                                <ClusterCard
                                  key={cluster.id}
                                  cluster={cluster}
                                  index={idx}
                                  runningPods={runningPods}
                                  totalPods={liveData?.totalPods ?? 0}
                                />
                              )
                            })}
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

function HealthDot({ clusterId }: { clusterId: string }) {
  const statusQuery = trpc.health.status.useQuery({}, {
    refetchInterval: HEALTH_STATUS_REFETCH_MS,
  })
  const entry = statusQuery.data?.find((s) => s.clusterId === clusterId)
  if (!entry || entry.status === 'unknown') return null

  const colors: Record<string, string> = {
    healthy: 'var(--color-status-active)',
    degraded: 'var(--color-status-warning)',
    critical: 'var(--color-status-error)',
  }
  const color = colors[entry.status] ?? 'var(--color-text-dim)'
  const checkedAt = entry.checkedAt ? new Date(entry.checkedAt).toLocaleString() : 'Never'
  const tooltip = `Health: ${entry.status} | Last check: ${checkedAt}${entry.responseTimeMs != null ? ` | ${entry.responseTimeMs}ms` : ''}`

  return (
    <span
      className="h-1.5 w-1.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      title={tooltip}
    />
  )
}

// DB-002: Compact ClusterCard — single horizontal row, ~50% shorter
function ClusterCard({
  cluster,
  index,
  runningPods,
  totalPods,
}: {
  cluster: ClusterCardData
  index: number
  runningPods: number
  totalPods: number
}) {
  const status = cluster.status ?? 'unknown'
  const statusMeta = STATUS_META[normalizeHealth(status)]
  const envMeta = ENV_META[cluster.environment]

  return (
    <Link href={`/clusters/${cluster.id}`}>
      <div
        className="cluster-card relative group rounded-lg cursor-pointer bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] animate-slide-up flex items-center gap-2 overflow-hidden px-3 py-2"
        style={
          {
            '--status-color': getStatusColor(status),
            boxShadow: getStatusGlow(status),
            transition: 'all var(--duration-normal) ease',
            animationDelay: `${index * 30}ms`,
            animationFillMode: 'forwards',
          } as React.CSSProperties
        }
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = getStatusGlowHover(status)
          e.currentTarget.style.transform =
            'scale(var(--card-hover-scale)) translateY(var(--card-hover-y))'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = getStatusGlow(status)
          e.currentTarget.style.transform = 'none'
        }}
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-lg"
          style={{ backgroundColor: envMeta.color, opacity: 0.9 }}
        />

        {/* Status dot */}
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 animate-pulse-slow ml-1 ${getStatusDotClass(status)}`}
        />

        {/* Name */}
        <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate flex-1 min-w-0">
          {cluster.name}
        </span>
        {cluster.source === 'db' && <HealthDot clusterId={cluster.id} />}

        {/* Env badge */}
        <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0', envMeta.badgeClass)}>
          {envMeta.label}
        </span>

        {/* Status label */}
        <span className="text-[9px] text-[var(--color-text-dim)] shrink-0 hidden sm:block">{statusMeta.label}</span>

        {/* Node count */}
        <span className="text-[9px] font-mono text-[var(--color-text-muted)] shrink-0">
          {cluster.nodeCount}n
        </span>

        {/* K8s version */}
        <span className="text-[9px] font-mono text-[var(--color-text-dim)] shrink-0 hidden md:block">
          {cluster.version ?? '—'}
        </span>
      </div>
    </Link>
  )
}

// DB-001: Compact stats bar — replaces 4 large SummaryCard grid
function CompactStatsBar({
  totalNodes,
  runningPods,
  totalPods,
  clusterCount,
  warningEvents,
  isLoading,
}: {
  totalNodes: number
  runningPods: number
  totalPods: number
  clusterCount: number
  warningEvents: number
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
    </div>
  )
}

// ─── System Health Section (merged from /system-health) ──────────────────────

const STATUS_COLORS_HEALTH: Record<string, string> = {
  healthy: 'var(--color-status-active)',
  degraded: 'var(--color-status-warning)',
  critical: 'var(--color-status-error)',
  unknown: 'var(--color-text-dim)',
}

const STATUS_LABELS_HEALTH: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
  unknown: 'Unknown',
}

function timeAgoHealth(ts: string | Date | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function SystemHealthSection() {
  const [checkingClusterId, setCheckingClusterId] = useState<string | null>(null)

  const statusQuery = trpc.health.status.useQuery({}, { refetchInterval: 60_000 })
  const utils = trpc.useUtils()

  const handleCheck = useCallback(
    async (clusterId: string) => {
      setCheckingClusterId(clusterId)
      try {
        await utils.health.check.fetch({ clusterId })
        utils.health.status.invalidate()
      } finally {
        setCheckingClusterId(null)
      }
    },
    [utils],
  )

  const statuses = statusQuery.data ?? []

  if (!statusQuery.isLoading && statuses.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <HeartPulse className="h-4 w-4 text-[var(--color-accent)]" />
        <h2 className="text-sm font-bold text-[var(--color-text-primary)]">System Health</h2>
        <span className="text-[10px] font-mono text-[var(--color-text-dim)] uppercase tracking-wider ml-1">
          {statuses.length} clusters
        </span>
      </div>

      {statusQuery.isLoading ? (
        <div className="flex gap-3">
          <Shimmer className="h-24 w-48 rounded-xl" />
          <Shimmer className="h-24 w-48 rounded-xl" />
          <Shimmer className="h-24 w-48 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {statuses.map((s) => {
            const color = STATUS_COLORS_HEALTH[s.status] ?? STATUS_COLORS_HEALTH.unknown
            const label = STATUS_LABELS_HEALTH[s.status] ?? 'Unknown'
            return (
              <div
                key={s.clusterId}
                className="relative rounded-xl p-3 border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-all duration-200"
                style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))' }}
              >
                <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ backgroundColor: color, opacity: 0.7 }} />
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="h-2 w-2 rounded-full animate-pulse-slow shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">{s.clusterName}</span>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-muted)] font-mono mb-2">
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgoHealth(s.checkedAt)}
                  </span>
                  {s.responseTimeMs !== null && (
                    <span className="flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5" />
                      {s.responseTimeMs}ms
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--color-border)]" style={{ color }}>{label}</span>
                  <button
                    type="button"
                    className="text-[var(--color-accent)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer disabled:opacity-50"
                    disabled={checkingClusterId !== null}
                    title="Check now"
                    onClick={() => handleCheck(s.clusterId)}
                  >
                    <RefreshCw className={`h-3 w-3 ${checkingClusterId === s.clusterId ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
