'use client'

import { AppLayout } from '@/components/AppLayout'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { PageTransition } from '@/components/animations'
import { AnomalyWidget } from '@/components/anomalies/AnomalyWidget'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonCard, SkeletonText } from '@/components/Skeleton'
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
import { AlertTriangle, Bell, Container, LayoutGrid, Server } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

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
  const normalized = normalizeLiveHealthStatus(status)
  if (normalized === 'healthy') return 'healthy'
  if (normalized === 'degraded') return 'degraded'
  return 'critical' // 'error' and 'unknown' → critical
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
    // Find matching DB cluster to use its persisted healthStatus
    const matchingDbCluster = dbClusters.find(c => c.name === liveData.name || c.name === 'minikube-dev')
    clusterList.push({
      id: activeClusterId ?? 'live',
      name: liveData.name,
      provider: liveData.provider,
      version: liveData.version,
      status: liveData.status,
      healthStatus: matchingDbCluster
        ? (typeof (matchingDbCluster as Record<string, unknown>).healthStatus === 'string'
            ? (matchingDbCluster as Record<string, unknown>).healthStatus as string
            : liveData.status)
        : liveData.status,
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
        healthStatus: typeof (c as Record<string, unknown>).healthStatus === 'string' ? ((c as Record<string, unknown>).healthStatus as string) : (typeof c.status === 'string' ? c.status : null),
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

  const envCounts = {
    all: clusterList.length,
    prod: clusterList.filter((c) => c.environment === 'prod').length,
    staging: clusterList.filter((c) => c.environment === 'staging').length,
    dev: clusterList.filter((c) => c.environment === 'dev').length,
  }

  const onFiltersChange = useCallback((next: FilterValue) => {
    setFilters(next)
  }, [])

  let cardIndex = 0

  return (
    <AppLayout>
      <PageTransition>
        <header className="mb-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Dashboard</h1>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <SummaryCard
            icon={<Server className="h-4 w-4" />}
            label="Total Nodes"
            value={String(totalNodes)}
            color={totalNodes > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)'}
            gradient={totalNodes > 0 ? 'var(--gradient-text-default)' : 'none'}
            isLoading={isLoading}
          />
          <SummaryCard
            icon={<Container className="h-4 w-4" />}
            label="Running Pods"
            value={`${runningPods}/${liveData?.totalPods ?? 0}`}
            color={runningPods > 0 ? 'var(--color-status-active)' : 'var(--color-text-muted)'}
            gradient={runningPods > 0 ? 'var(--gradient-text-healthy)' : 'none'}
            isLoading={isLoading}
          />
          <SummaryCard
            icon={<LayoutGrid className="h-4 w-4" />}
            label="Clusters"
            value={String(clusterList.length)}
            color={clusterList.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)'}
            gradient={clusterList.length > 0 ? 'var(--gradient-text-default)' : 'none'}
            isLoading={isLoading}
          />
          <SummaryCard
            icon={warningEvents > 0 ? <AlertTriangle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            label="Warning Events"
            value={String(warningEvents)}
            color={warningEvents > 0 ? 'var(--color-status-warning)' : 'var(--color-text-muted)'}
            gradient={warningEvents > 0 ? 'var(--gradient-text-warning)' : 'none'}
            isLoading={isLoading}
          />
        </div>

        <div className="mb-6 max-w-sm">
          <AnomalyWidget />
        </div>

        <div className="flex flex-col gap-4 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">Clusters</h2>
              <p className="text-[11px] text-[var(--color-table-meta)] font-mono uppercase tracking-wider mt-0.5">
                {clusterList.filter((c) => c.source === 'live' || ['healthy', 'degraded'].includes(c.healthStatus ?? '')).length} live ·{' '}
                {clusterList.length} registered
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

          <FilterBar options={{ ...filterOptions, environments: [] }} onChange={onFiltersChange} />
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
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

        <div className="flex-1 min-w-0 p-4 pl-5 pb-2 sm:pb-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 animate-pulse-slow ${getStatusDotClass(status)}`}
            />
            <span className="text-sm font-bold text-[var(--color-text-primary)] truncate">{cluster.name}</span>
            {cluster.source === 'db' && <HealthDot clusterId={cluster.id} />}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-[var(--color-text-muted)] font-mono">
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
          <span className="text-[9px] text-[var(--color-text-dim)]">{statusLabel}</span>
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
      className="rounded-2xl p-4 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 w-full"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        transition: 'all var(--duration-normal) ease',
        boxShadow: 'var(--shadow-card)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--glow-accent-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono">
          {label}
        </span>
        <span style={{ color }}>{icon}</span>
      </div>
      {isLoading ? (
        <SkeletonText width="3rem" height="2rem" />
      ) : (
        <div
          className={cn('text-2xl font-extrabold tracking-tight animate-count-up', gradient !== 'none' && 'gradient-text', gradient === 'none' && 'opacity-50')}
          style={gradient !== 'none' ? { backgroundImage: gradient } : { color }}
        >
          {value}
        </div>
      )}
    </div>
  )
}

