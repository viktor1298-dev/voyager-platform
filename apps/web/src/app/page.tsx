'use client'

import { AppLayout } from '@/components/AppLayout'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonCard, SkeletonText } from '@/components/Skeleton'
import {
  getStatusColor,
  getStatusDotClass,
  getStatusGlow,
  getStatusGlowHover,
} from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { AlertTriangle, Box, CheckCircle, Database, Layers, Server } from 'lucide-react'
import Link from 'next/link'

interface ClusterCardData {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  nodeCount: number
  source: 'live' | 'db'
}

export default function DashboardPage() {
  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: 60000,
  })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  // Build combined cluster list: live minikube + all DB clusters (deduplicated)
  const clusterList: ClusterCardData[] = []

  // Add live minikube cluster first
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

  // Add DB clusters, skipping any that duplicate the live minikube
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

  // Combined stats
  const totalNodes =
    (liveData?.nodes.length ?? 0) +
    dbClusters
      .filter((c) => !(liveData && (c.name === liveData.name || c.name === 'minikube-dev')))
      .reduce((sum, c) => sum + c.nodeCount, 0)
  const runningPods = liveData?.runningPods ?? 0
  const namespacesCount = liveData?.namespaces.length ?? 0
  const warningEvents = liveData?.events.filter((e) => e.type === 'Warning').length ?? 0

  return (
    <AppLayout>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      {/* Clusters Grid */}
      <div className="mb-4">
        <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Clusters
        </h2>
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-0.5">
          {clusterList.filter((c) => c.source === 'live').length} live · {clusterList.filter((c) => c.source === 'db').length} registered
        </p>
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
          {(
            [
              { key: 'degraded', label: 'Degraded', icon: '🔴', color: 'var(--color-status-error)' },
              { key: 'warning', label: 'Warning', icon: '⚠️', color: 'var(--color-status-warning)' },
              { key: 'healthy', label: 'Healthy', icon: '✅', color: 'var(--color-status-active)' },
            ] as const
          )
            .map((section) => {
              const clusters = clusterList.filter((c) => {
                const s = c.status ?? 'unknown'
                if (section.key === 'degraded') return s !== 'healthy' && s !== 'warning'
                return s === section.key
              })
              return { ...section, clusters }
            })
            .filter((section) => section.clusters.length > 0)
            .map((section) => (
              <div key={section.key}>
                {/* Section Header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{section.icon}</span>
                  <span
                    className="text-sm font-bold uppercase tracking-wider"
                    style={{ color: section.color }}
                  >
                    {section.label}
                  </span>
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded-md"
                    style={{
                      color: section.color,
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {section.clusters.length}
                  </span>
                  <div
                    className="flex-1 h-px ml-2"
                    style={{ background: `linear-gradient(to right, ${section.color}33, transparent)` }}
                  />
                </div>
                {/* Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {section.clusters.map((cluster, index) => (
                    <Link
                      key={cluster.id}
                      href={`/clusters/${cluster.id}`}
                    >
                      <div
                        className="cluster-card relative group rounded-xl p-4 min-h-[80px] cursor-pointer bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] animate-slide-up flex items-start gap-3"
                        style={
                          {
                            '--status-color': getStatusColor(cluster.status ?? 'unknown'),
                            boxShadow: getStatusGlow(cluster.status ?? 'unknown'),
                            transition: 'all var(--duration-normal) ease',
                            animationDelay: `${index * 50}ms`,
                            animationFillMode: 'both',
                          } as React.CSSProperties
                        }
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = getStatusGlowHover(cluster.status ?? 'unknown')
                          e.currentTarget.style.transform =
                            'scale(var(--card-hover-scale)) translateY(var(--card-hover-y))'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = getStatusGlow(cluster.status ?? 'unknown')
                          e.currentTarget.style.transform = 'none'
                        }}
                      >
                        {/* Left: Content */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Status + Name */}
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full animate-pulse-slow ${getStatusDotClass(cluster.status ?? 'unknown')}`}
                            />
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider ${getStatusColor(cluster.status ?? 'unknown') === 'var(--color-status-active)' ? 'text-[var(--color-status-active)]' : 'text-[var(--color-status-warning)]'}`}
                            >
                              {cluster.status ?? 'unknown'}
                            </span>
                            <span className="text-sm font-bold text-[var(--color-text-primary)]">
                              {cluster.name}
                            </span>
                          </div>

                          {/* Row 2: Details */}
                          <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--color-text-muted)] font-mono">
                            <span>K8s {cluster.version ?? '—'}</span>
                            <span>·</span>
                            <span>Nodes: {cluster.nodeCount}</span>
                            {cluster.source === 'live' && (
                              <>
                                <span>·</span>
                                <span>Pods: {runningPods}/{liveData?.totalPods ?? 0}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right: Badge + Logo stacked */}
                        <div className="flex flex-col items-end justify-between gap-1 shrink-0">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-accent)] border border-[var(--color-border)]">
                            {cluster.provider}
                          </span>
                          <ProviderLogo provider={cluster.provider ?? 'default'} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </AppLayout>
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
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
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
