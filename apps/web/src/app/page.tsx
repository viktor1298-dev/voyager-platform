'use client'

import { AppLayout } from '@/components/AppLayout'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { PageTransition } from '@/components/animations'
import { AnomalyWidget } from '@/components/anomalies/AnomalyWidget'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonCard, SkeletonRow, SkeletonText } from '@/components/Skeleton'
import {
  ENV_META,
  getClusterEnvironment,
  getClusterTags,
  normalizeHealth,
  type ClusterEnvironment,
} from '@/lib/cluster-meta'
import { normalizeLiveHealthStatus, healthBadgeLabel } from '@/lib/cluster-status'
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
import { AlertTriangle, Bell, Container, LayoutGrid, List, RefreshCw, Server, Table2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'

interface ClusterCardData {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  healthStatus: string | null
  nodeCount: number
  source: 'live' | 'db'
  environment: ClusterEnvironment
  tags: string[]
  cpuPercent?: number | null
}

const ENV_ORDER: ClusterEnvironment[] = ['prod', 'staging', 'dev']

type HealthGroup = 'healthy' | 'degraded' | 'critical'

const HEALTH_GROUP_ORDER: HealthGroup[] = ['critical', 'degraded', 'healthy']

const HEALTH_GROUP_META: Record<HealthGroup, { label: string; dotColor: string }> = {
  healthy: { label: 'Healthy', dotColor: 'var(--color-status-active)' },
  degraded: { label: 'Degraded', dotColor: 'var(--color-status-warning)' },
  critical: { label: 'Critical', dotColor: 'var(--color-status-error)' },
}

function getHealthGroup(status: string | null | undefined): HealthGroup {
  const normalized = normalizeLiveHealthStatus(status)
  if (normalized === 'healthy') return 'healthy'
  if (normalized === 'degraded') return 'degraded'
  return 'critical'
}

// P1-007: Resource utilization mini-bar
function ResourceBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-[var(--color-text-dim)] min-w-[28px] text-right">{pct}%</span>
    </div>
  )
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // P1-002: Card/table view toggle
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')

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

  const queryClient = useQueryClient()
  const isFetching = useIsFetching()
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())
  const [secondsAgo, setSecondsAgo] = useState(0)
  const lastRefreshedRef = useRef(lastRefreshedAt)
  lastRefreshedRef.current = lastRefreshedAt

  // Update secondsAgo every second
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshedRef.current.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Update lastRefreshedAt when fetching completes
  const wasFetchingRef = useRef(false)
  useEffect(() => {
    if (wasFetchingRef.current && isFetching === 0) {
      setLastRefreshedAt(new Date())
      setSecondsAgo(0)
    }
    wasFetchingRef.current = isFetching > 0
  }, [isFetching])

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

  // P1-007: metrics for resource bars
  const statsQuery = trpc.metrics.currentStats.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  const clusterList: ClusterCardData[] = []

  if (liveData) {
    const matchingDbCluster = dbClusters.find(c => c.name === liveData.name || c.name === 'minikube-dev')
    clusterList.push({
      id: activeClusterId ?? 'live',
      name: liveData.name,
      provider: liveData.provider,
      version: liveData.version,
      status: liveData.status,
      healthStatus: liveData.status,
      nodeCount: liveData.nodes.length,
      source: 'live',
      environment: getClusterEnvironment(liveData.name, liveData.provider),
      tags: getClusterTags({ name: liveData.name, provider: liveData.provider, source: 'live' }),
      cpuPercent: statsQuery.data?.cpuPercent ?? null,
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
        healthStatus: typeof (c as Record<string, unknown>).healthStatus === 'string' ? ((c as Record<string, unknown>).healthStatus as string) : (typeof c.status === 'string' ? c.status : null),
        nodeCount: c.nodeCount,
        source: 'db',
        environment: getClusterEnvironment(c.name, c.provider),
        tags: getClusterTags({ name: c.name, provider: c.provider, source: 'db' }),
        cpuPercent: null,
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
      statuses.add((cluster.healthStatus ?? cluster.status ?? 'unknown').toLowerCase())
      providers.add(cluster.provider)
      health.add(normalizeHealth(cluster.healthStatus ?? cluster.status))
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
      const statusValue = (cluster.healthStatus ?? cluster.status ?? 'unknown').toLowerCase()
      if (filters.status !== 'all' && statusValue !== filters.status) return false
      if (filters.provider !== 'all' && cluster.provider !== filters.provider) return false
      const healthValue = normalizeHealth(cluster.healthStatus ?? cluster.status)
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
      grouped[cluster.environment][getHealthGroup(cluster.healthStatus ?? cluster.status)].push(cluster)
    }

    return grouped
  }, [visibleClusters])

  const onFiltersChange = useCallback((next: FilterValue) => {
    // BUG-001 fix: env tabs are the sole controller of `filters.environment`.
    // FilterBar's onChange fires with stale URL-parsed env before the router
    // updates searchParams, which caused it to reset environment back to 'all'.
    // Solution: always preserve the current environment from state.
    setFilters((prev) => ({ ...next, environment: prev.environment }))
  }, [])

  let cardIndex = 0

  return (
    <AppLayout>
      <PageTransition>
        <header className="mb-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Dashboard</h1>
        </header>

        <div className="flex items-center justify-end gap-2 mb-1.5">
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
            Updated {secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`}
          </span>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries()}
            disabled={isFetching > 0}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title="Refresh all data"
          >
            <RefreshCw className={cn('h-3 w-3', isFetching > 0 && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          <SummaryCard
            icon={<Server className="h-3.5 w-3.5" />}
            label="Total Nodes"
            value={String(totalNodes)}
            color={totalNodes > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)'}
            gradient={totalNodes > 0 ? 'var(--gradient-text-default)' : 'none'}
            isLoading={isLoading}
          />
          <SummaryCard
            icon={<Container className="h-3.5 w-3.5" />}
            label="Running Pods"
            value={`${runningPods}/${liveData?.totalPods ?? 0}`}
            color={(runningPods > 0 && (liveData?.totalPods ?? 0) > 0) ? 'var(--color-status-active)' : 'var(--color-text-muted)'}
            gradient={(runningPods > 0 && (liveData?.totalPods ?? 0) > 0) ? 'var(--gradient-text-healthy)' : 'none'}
            isLoading={isLoading}
          />
          <SummaryCard
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Clusters"
            value={String(clusterList.length)}
            color={clusterList.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)'}
            gradient={clusterList.length > 0 ? 'var(--gradient-text-default)' : 'none'}
            isLoading={isLoading}
          />
          <SummaryCard
            icon={warningEvents > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            label="Warning Events"
            value={String(warningEvents)}
            color={warningEvents > 0 ? 'var(--color-status-warning)' : 'var(--color-text-muted)'}
            gradient={warningEvents > 0 ? 'var(--gradient-text-warning)' : 'none'}
            isLoading={isLoading}
          />
          <AnomalyWidget compact />
        </div>

        {/* P1-001: Consolidated cluster header + filter in one section */}
        <div className="mb-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">Clusters</h2>
              <p className="text-[11px] text-[var(--color-table-meta)] font-mono uppercase tracking-wider mt-0.5">
                {visibleClusters.length}/{clusterList.length} visible
              </p>
            </div>

            {/* P1-002: Card/Table view toggle */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  title="Card view"
                  aria-label="Card view"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer min-h-[36px]',
                    viewMode === 'card'
                      ? 'bg-white/[0.08] text-[var(--color-text-primary)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  title="Table view"
                  aria-label="Table view"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer min-h-[36px]',
                    viewMode === 'table'
                      ? 'bg-white/[0.08] text-[var(--color-text-primary)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
              </div>
            </div>
          </div>

          {/* P1-001: Single consolidated filter bar with env tabs integrated */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 px-3 py-2.5 space-y-2">
            {/* Env tabs row */}
            <div className="flex items-center gap-1">
              {(['all', 'prod', 'staging', 'dev'] as const).map((filter) => {
                const isActive = filters.environment === filter || (filter === 'all' && filters.environment === 'all')
                const color = filter === 'all' ? 'var(--color-accent)' : ENV_META[filter].color
                const envCounts = {
                  all: clusterList.length,
                  prod: clusterList.filter((c) => c.environment === 'prod').length,
                  staging: clusterList.filter((c) => c.environment === 'staging').length,
                  dev: clusterList.filter((c) => c.environment === 'dev').length,
                }
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setEnvironmentFilter(filter)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-md text-[11px] font-medium tracking-wide transition-all duration-200 cursor-pointer',
                      isActive
                        ? 'bg-white/[0.08] text-[var(--color-text-primary)]'
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
            {/* Separator */}
            <div className="h-px bg-[var(--color-border)]/40" />
            {/* Main filters */}
            <FilterBar
              options={{ ...filterOptions, environments: [] }}
              onChange={onFiltersChange}
            />
          </div>
        </div>

        {/* P1-004: Loading skeleton */}
        {isLoading ? (
          viewMode === 'card' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="space-y-0 divide-y divide-[var(--color-border)]/50">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="px-4">
                    <SkeletonRow />
                  </div>
                ))}
              </div>
            </div>
          )
        ) : liveQuery.error && listQuery.error ? (
          <p className="text-[var(--color-status-error)]">
            Failed to load clusters: {liveQuery.error?.message ?? listQuery.error?.message}
          </p>
        ) : visibleClusters.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">No clusters match the current filters.</p>
        ) : viewMode === 'table' ? (
          /* P1-002: Table view */
          <ClusterTable clusters={visibleClusters} />
        ) : (
          /* Card view */
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
      </PageTransition>
    </AppLayout>
  )
}

// P1-002: Compact cluster table view
function ClusterTable({ clusters }: { clusters: ClusterCardData[] }) {
  const router = useRouter()
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50">
            {['Name', 'Provider', 'Health', 'Environment', 'Version', 'Nodes', 'CPU'].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)] font-mono"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]/40">
          {clusters.map((cluster) => {
            const status = cluster.healthStatus ?? cluster.status ?? 'unknown'
            const normalizedStatus = normalizeLiveHealthStatus(status)
            const statusLabel = healthBadgeLabel(normalizedStatus)
            const envMeta = ENV_META[cluster.environment]
            const statusColor = getStatusColor(status)

            return (
              <tr
                key={cluster.id}
                onClick={() => router.push(`/clusters/${cluster.id}`)}
                className="cursor-pointer hover:bg-white/[0.03] transition-all duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-border-hover),0_2px_8px_rgba(0,0,0,0.15)]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${getStatusDotClass(status)}`} />
                    <span className="text-sm font-bold text-[var(--color-text-primary)]">{cluster.name}</span>
                    {cluster.source === 'live' && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]">LIVE</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <ProviderLogo provider={cluster.provider} />
                    <span className="text-[11px] font-mono uppercase text-[var(--color-text-secondary)]">{cluster.provider}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}
                  >
                    {statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('text-[10px] font-mono px-2 py-0.5 rounded-md border', envMeta.badgeClass)}>
                    {envMeta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] font-mono text-[var(--color-text-secondary)]">{cluster.version ?? '—'}</td>
                <td className="px-4 py-3 text-[11px] font-mono tabular-nums text-[var(--color-text-secondary)]">{cluster.nodeCount}</td>
                <td className="px-4 py-3 min-w-[80px]">
                  {cluster.cpuPercent != null ? (
                    <ResourceBar
                      value={cluster.cpuPercent}
                      max={100}
                      color={cluster.cpuPercent > 80 ? 'var(--color-status-warning)' : 'var(--color-status-active)'}
                    />
                  ) : (
                    <span className="text-[var(--color-text-dim)]">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DashboardPageFallback() {
  return (
    <AppLayout>
      <PageTransition>
        <header className="mb-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Dashboard</h1>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
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
  const status = cluster.healthStatus ?? cluster.status ?? 'unknown'
  const normalizedStatus = normalizeLiveHealthStatus(status)
  const statusLabel = healthBadgeLabel(normalizedStatus)
  const envMeta = ENV_META[cluster.environment]

  return (
    <Link href={`/clusters/${cluster.id}`}>
      <div
        className="cluster-card relative group rounded-xl min-h-[90px] cursor-pointer bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 overflow-hidden"
        style={
          {
            '--status-color': getStatusColor(status),
            boxShadow: getStatusGlow(status),
            transition: 'all var(--duration-normal) ease',
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
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
          style={{ backgroundColor: envMeta.color, opacity: 0.9 }}
        />

        <div className="flex-1 min-w-0 p-4 pl-5 pb-2 sm:pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 animate-pulse-slow ${getStatusDotClass(status)}`}
            />
            <span className="text-sm font-bold text-[var(--color-text-primary)] truncate">{cluster.name}</span>
            {cluster.source === 'db' && <HealthDot clusterId={cluster.id} />}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-[var(--color-text-secondary)] font-mono">
            <span>K8s {cluster.version ?? '—'}</span>
            <span>·</span>
            <span>Nodes: {cluster.nodeCount}</span>
            {cluster.source === 'live' && (
              <>
                <span>·</span>
                <span>Pods: {runningPods}/{totalPods}</span>
              </>
            )}
          </div>

          {/* P1-007: Resource utilization bar for live clusters */}
          {cluster.source === 'live' && cluster.cpuPercent != null && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-[var(--color-text-dim)] font-mono uppercase tracking-wide">
                <span>CPU</span>
              </div>
              <ResourceBar
                value={cluster.cpuPercent}
                max={100}
                color={cluster.cpuPercent > 80 ? 'var(--color-status-warning)' : 'var(--color-accent)'}
              />
              {totalPods > 0 && (
                <>
                  <div className="flex items-center justify-between text-[9px] text-[var(--color-text-dim)] font-mono uppercase tracking-wide">
                    <span>Pods</span>
                  </div>
                  <ResourceBar
                    value={runningPods}
                    max={totalPods}
                    color="var(--color-status-active)"
                  />
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex w-full sm:w-auto flex-row flex-wrap sm:flex-col items-start sm:items-end justify-between gap-1 sm:gap-2 shrink-0 px-4 pb-4 sm:p-4 sm:pl-0">
          <span
            className={cn('text-[10px] font-mono px-2 py-0.5 rounded-md border', envMeta.badgeClass)}
          >
            {ENV_META[cluster.environment].label}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-accent)] border border-[var(--color-border)]">
              {cluster.provider}
            </span>
            <ProviderLogo provider={cluster.provider ?? 'default'} />
          </div>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{
              color: getStatusColor(status),
              background: `color-mix(in srgb, ${getStatusColor(status)} 12%, transparent)`,
            }}
          >{statusLabel}</span>
        </div>
      </div>
    </Link>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  color,
  gradient,
  isLoading,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  gradient: string
  isLoading?: boolean
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 border border-[var(--color-border)] hover:border-[var(--color-border-hover)] w-full flex items-center justify-between gap-2"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        transition: 'all var(--duration-normal) ease',
        boxShadow: 'var(--shadow-card)',
        minHeight: '64px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--glow-accent-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
      }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono truncate">
          {label}
        </span>
        {isLoading ? (
          <SkeletonText width="2.5rem" height="1.5rem" />
        ) : (
          <div
            className={cn('text-xl font-extrabold tracking-tight leading-tight animate-count-up', gradient !== 'none' && 'gradient-text', gradient === 'none' && 'opacity-50')}
            style={gradient !== 'none' ? { backgroundImage: gradient } : { color }}
          >
            {value}
          </div>
        )}
      </div>
      <span className="shrink-0 opacity-60" style={{ color }}>{icon}</span>
    </div>
  )
}
