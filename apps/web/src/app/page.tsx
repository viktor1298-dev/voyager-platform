'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonCard, SkeletonText } from '@/components/Skeleton'
import {
  getStatusColor,
  getStatusDotClass,
  getStatusGlow,
  getStatusGlowHover,
} from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { AlertTriangle, Box, Database, Server } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

type StatusFilter = 'all' | 'degraded' | 'warning' | 'healthy'

interface ClusterCardData {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  nodeCount: number
  source: 'live' | 'db'
}

const STATUS_ORDER: string[] = ['degraded', 'warning', 'healthy']

function normalizeStatus(status: string | null): string {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') return 'healthy'
  if (s === 'warning') return 'warning'
  return 'degraded'
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  degraded: { label: 'Degraded', color: 'var(--color-status-error)' },
  warning: { label: 'Warning', color: 'var(--color-status-warning)' },
  healthy: { label: 'Healthy', color: 'var(--color-status-active)' },
}

export default function DashboardPage() {
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all')

  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: 60000,
  })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  // Build combined cluster list
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
    })
  }

  for (const c of dbClusters) {
    const isLiveMinikube =
      liveData && (c.name === liveData.name || c.name === 'minikube-dev')
    if (!isLiveMinikube) {
      clusterList.push({
        id: c.id,
        name: c.name,
        provider: c.provider,
        version: c.version,
        status: c.status,
        nodeCount: c.nodeCount,
        source: 'db',
      })
    }
  }

  // Stats
  const totalNodes =
    (liveData?.nodes.length ?? 0) +
    dbClusters
      .filter((c) => !(liveData && (c.name === liveData.name || c.name === 'minikube-dev')))
      .reduce((sum, c) => sum + c.nodeCount, 0)
  const runningPods = liveData?.runningPods ?? 0
  const warningEvents = liveData?.events.filter((e) => e.type === 'Warning').length ?? 0

  // Group clusters by normalized status
  const grouped: Record<string, ClusterCardData[]> = { degraded: [], warning: [], healthy: [] }
  for (const c of clusterList) {
    const ns = normalizeStatus(c.status)
    grouped[ns]?.push(c)
  }

  // Count per status
  const counts: Record<string, number> = {
    all: clusterList.length,
    degraded: grouped.degraded.length,
    warning: grouped.warning.length,
    healthy: grouped.healthy.length,
  }

  // Filtered list
  const visibleStatuses = activeFilter === 'all' ? STATUS_ORDER : [activeFilter]

  // Track global card index for stagger animation
  let cardIndex = 0

  return (
    <AppLayout>
      <PageTransition>
      {/* Summary Cards */}
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

      {/* Clusters Header + Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Clusters
          </h2>
          <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-0.5">
            {clusterList.filter((c) => c.source === 'live').length} live · {clusterList.filter((c) => c.source === 'db').length} registered
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]">
          {(['all', 'degraded', 'warning', 'healthy'] as StatusFilter[]).map((filter) => {
            const isActive = activeFilter === filter
            const meta = filter === 'all' ? null : STATUS_META[filter]
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`
                  flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium tracking-wide
                  transition-all duration-200 cursor-pointer select-none
                  ${isActive
                    ? 'bg-white/[0.08] text-[var(--color-text-primary)] shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.04]'
                  }
                `}
              >
                {meta && (
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: meta.color }}
                  />
                )}
                <span className="capitalize">{filter}</span>
                <span className={`tabular-nums ${isActive ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-dim)]'}`}>
                  {counts[filter]}
                </span>
              </button>
            )
          })}
        </div>
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
      ) : clusterList.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">No clusters found.</p>
      ) : (
        <div className="space-y-6">
          {visibleStatuses.map((status) => {
            const clusters = grouped[status]
            if (!clusters || clusters.length === 0) return null
            const meta = STATUS_META[status]
            return (
              <div key={status}>
                {/* Subtle section label — only when showing all */}
                {activeFilter === 'all' && (
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="text-[11px] uppercase tracking-widest font-medium text-[var(--color-text-dim)]">
                        {meta.label}
                      </span>
                      <span className="text-[11px] tabular-nums text-[var(--color-text-dim)]/60">
                        {clusters.length}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-[var(--color-border)]/40" />
                  </div>
                )}

                {/* Cards Grid */}
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
      )}
          </PageTransition>
    </AppLayout>
  )
}

function HealthDot({ clusterId }: { clusterId: string }) {
  const statusQuery = trpc.health.status.useQuery(undefined, {
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
  const meta = STATUS_META[normalizeStatus(status)]

  return (
    <Link href={`/clusters/${cluster.id}`}>
      <div
        className="cluster-card relative group rounded-xl min-h-[80px] cursor-pointer bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] animate-slide-up flex items-start gap-3 overflow-hidden"
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
        {/* Status left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
          style={{ backgroundColor: meta.color, opacity: 0.7 }}
        />

        <div className="flex-1 min-w-0 p-4 pl-5">
          {/* Row 1: Name */}
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 animate-pulse-slow ${getStatusDotClass(status)}`}
            />
            <span className="text-sm font-bold text-[var(--color-text-primary)] truncate">
              {cluster.name}
            </span>
            {cluster.source === 'db' && <HealthDot clusterId={cluster.id} />}
          </div>

          {/* Row 2: Details */}
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

        {/* Right: Badge + Logo */}
        <div className="flex flex-col items-end justify-between gap-1 shrink-0 p-4 pl-0">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-accent)] border border-[var(--color-border)]">
            {cluster.provider}
          </span>
          <ProviderLogo provider={cluster.provider ?? 'default'} />
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
