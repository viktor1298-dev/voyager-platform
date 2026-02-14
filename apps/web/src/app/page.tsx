'use client'

import { AppLayout } from '@/components/AppLayout'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { PageTransition } from '@/components/animations'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonCard, SkeletonText } from '@/components/Skeleton'
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
import { AlertTriangle, Box, Database, Server } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

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

  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: 60000,
  })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  const clusterList: ClusterCardData[] = []

  if (liveData) {
    clusterList.push({
      id: 'live-minikube',
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
    const grouped: Record<ClusterEnvironment, ClusterCardData[]> = { prod: [], staging: [], dev: [] }
    for (const cluster of visibleClusters) grouped[cluster.environment].push(cluster)
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <SummaryCard
            icon={<Server className="h-4 w-4" />}
            label="Total Nodes"
            value={String(totalNodes)}
            color="var(--color-accent)"
            gradient="var(--gradient-text-default)"
            isLoading={isLoading}
          />
          <SummaryCard
            icon={<Box className="h-4 w-4" />}
            label="Running Pods"
            value={`${runningPods}/${liveData?.totalPods ?? 0}`}
            color="var(--color-status-active)"
            gradient="var(--gradient-text-healthy)"
            isLoading={isLoading}
          />
          <SummaryCard
            icon={<Database className="h-4 w-4" />}
            label="Clusters"
            value={String(clusterList.length)}
            color="var(--color-accent)"
            gradient="var(--gradient-text-default)"
            isLoading={isLoading}
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Warning Events"
            value={String(warningEvents)}
            color="var(--color-status-warning)"
            gradient={warningEvents > 0 ? 'var(--gradient-text-warning)' : 'var(--gradient-text-default)'}
            isLoading={isLoading}
          />
        </div>

        <div className="flex flex-col gap-4 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">Clusters</h2>
              <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-0.5">
                {clusterList.filter((c) => c.source === 'live').length} live ·{' '}
                {clusterList.filter((c) => c.source === 'db').length} registered
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]">
              {(['all', 'prod', 'staging', 'dev'] as const).map((filter) => {
                const isActive = filters.environment === filter || (filter === 'all' && filters.environment === 'all')
                const color = filter === 'all' ? 'var(--color-accent)' : ENV_META[filter].color
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setEnvironmentFilter(filter)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium tracking-wide transition-all duration-200 cursor-pointer',
                      isActive
                        ? 'bg-white/[0.08] text-[var(--color-text-primary)] shadow-sm'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="capitalize">{filter}</span>
                    <span className="tabular-nums text-[var(--color-text-dim)]">{envCounts[filter]}</span>
                  </button>
                )
              })}
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
              const clusters = groupedByEnvironment[environment]
              if (!clusters || clusters.length === 0) return null
              const meta = ENV_META[environment]
              return (
                <section
                  key={environment}
                  className="rounded-xl border p-4"
                  style={{
                    borderColor: meta.ring,
                    background: meta.softBg,
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{meta.sectionLabel}</h3>
                    <span className="text-[11px] text-[var(--color-text-dim)] tabular-nums">{clusters.length}</span>
                    <div className="flex-1 h-px bg-[var(--color-border)]/40" />
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="space-y-3">
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
    refetchInterval: 60_000,
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
  const status = cluster.status ?? 'unknown'
  const statusMeta = STATUS_META[normalizeHealth(status)]
  const envMeta = ENV_META[cluster.environment]

  return (
    <Link href={`/clusters/${cluster.id}`}>
      <div
        className="cluster-card relative group rounded-xl min-h-[90px] cursor-pointer bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] animate-slide-up flex items-start gap-3 overflow-hidden"
        style={
          {
            '--status-color': getStatusColor(status),
            boxShadow: getStatusGlow(status),
            transition: 'all var(--duration-normal) ease',
            animationDelay: `${index * 50}ms`,
            animationFillMode: 'both',
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

        <div className="flex-1 min-w-0 p-4 pl-5">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 animate-pulse-slow ${getStatusDotClass(status)}`}
            />
            <span className="text-sm font-bold text-[var(--color-text-primary)] truncate">{cluster.name}</span>
            {cluster.source === 'db' && <HealthDot clusterId={cluster.id} />}
          </div>

          <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--color-text-muted)] font-mono">
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

        <div className="flex flex-col items-end justify-between gap-1 shrink-0 p-4 pl-0">
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-md border"
            style={{
              borderColor: envMeta.ring,
              color: envMeta.color,
              background: envMeta.softBg,
            }}
          >
            {ENV_META[cluster.environment].label}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-accent)] border border-[var(--color-border)]">
              {cluster.provider}
            </span>
            <ProviderLogo provider={cluster.provider ?? 'default'} />
          </div>
          <span className="text-[9px] text-[var(--color-text-dim)]">{statusMeta.label}</span>
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
      className="rounded-2xl p-4 border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)]"
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
          className="text-2xl font-extrabold tracking-tight animate-count-up gradient-text"
          style={{ backgroundImage: gradient }}
        >
          {value}
        </div>
      )}
    </div>
  )
}

