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
import { AlertTriangle, CheckCircle, Database, Server } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const clusters = trpc.clusters.list.useQuery()

  const clusterList = clusters.data ?? []
  const totalNodes = clusterList.reduce((sum, c) => sum + (c.nodeCount ?? 0), 0)
  const healthyCount = clusterList.filter((c) => c.status === 'healthy').length
  const isLoading = clusters.isLoading

  return (
    <AppLayout>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<Database className="h-4 w-4" />}
          label="Total Clusters"
          value={String(clusterList.length)}
          color="var(--color-accent)"
          gradient="var(--gradient-text-default)"
          isLoading={isLoading}
        />
        <SummaryCard
          icon={<Server className="h-4 w-4" />}
          label="Total Nodes"
          value={String(totalNodes)}
          color="var(--color-text-secondary)"
          gradient="var(--gradient-text-default)"
          isLoading={isLoading}
        />
        <SummaryCard
          icon={<CheckCircle className="h-4 w-4" />}
          label="Healthy Clusters"
          value={String(healthyCount)}
          color="var(--color-status-active)"
          gradient="var(--gradient-text-healthy)"
          isLoading={isLoading}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Warning Events 24h"
          value="—"
          color="var(--color-status-warning)"
          gradient="var(--gradient-text-warning)"
          isLoading={isLoading}
          extra={
            !isLoading && clusterList.length > 0 ? (
              <WarningEventsCount clusterIds={clusterList.map((c) => c.id)} />
            ) : undefined
          }
        />
      </div>

      {/* Clusters Grid */}
      <div className="mb-4">
        <h2 className="text-lg font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Clusters
        </h2>
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-0.5">
          {clusterList.length} registered
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : clusterList.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">No clusters found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusterList.map((cluster, index) => (
            <Link key={cluster.id} href={`/clusters/${cluster.id}`}>
              <div
                className="cluster-card relative group rounded-2xl p-4 cursor-pointer bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] animate-slide-up"
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
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full animate-pulse-slow ${getStatusDotClass(cluster.status ?? 'unknown')}`}
                    />
                    <span className="text-[11px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
                      {cluster.status ?? 'unknown'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-accent)] border border-[var(--color-border)]">
                    {cluster.provider}
                  </span>
                </div>

                <div className="mb-3">
                  <span className="text-[15px] font-bold text-[var(--color-text-primary)] tracking-tight">
                    {cluster.name}
                  </span>
                  <div className="text-[11px] text-[var(--color-text-dim)] font-mono mt-0.5">
                    K8s {cluster.version ?? '—'}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-white/[0.04]">
                  <div className="flex-1">
                    <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono">
                      Nodes
                    </div>
                    <div
                      className="text-sm font-bold mt-0.5 gradient-text"
                      style={{ backgroundImage: 'var(--gradient-text-default)' }}
                    >
                      {cluster.nodeCount}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono">
                      Region
                    </div>
                    <div className="text-sm font-bold text-[var(--color-text-primary)] mt-0.5">
                      {'—'}
                    </div>
                  </div>
                </div>
                <ProviderLogo provider={cluster.provider ?? 'default'} />
              </div>
            </Link>
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
  extra,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  gradient: string
  isLoading?: boolean
  extra?: React.ReactNode
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
        extra || (
          <div
            className="text-2xl font-extrabold tracking-tight animate-count-up gradient-text"
            style={{ backgroundImage: gradient }}
          >
            {value}
          </div>
        )
      )}
    </div>
  )
}

const MAX_CLUSTERS = 20

function WarningEventsCount({ clusterIds }: { clusterIds: string[] }) {
  const queries = Array.from({ length: MAX_CLUSTERS }, (_, i) => {
    const clusterId = clusterIds[i] ?? 'unused'
    return trpc.events.stats.useQuery({ clusterId }, { enabled: i < clusterIds.length })
  })

  const active = queries.slice(0, clusterIds.length)
  const total = active.reduce((sum, r) => sum + (r.data?.Warning ?? 0), 0)
  const loading = active.some((r) => r.isLoading)

  if (loading) {
    return <SkeletonText width="3rem" height="2rem" />
  }

  return (
    <div
      className="text-2xl font-extrabold tracking-tight gradient-text"
      style={{
        backgroundImage:
          total > 0 ? 'var(--gradient-text-warning)' : 'var(--gradient-text-default)',
      }}
    >
      {total}
    </div>
  )
}
