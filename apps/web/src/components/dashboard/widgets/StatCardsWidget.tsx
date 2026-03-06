'use client'

import { AlertTriangle, Bell, Container, LayoutGrid, Server } from 'lucide-react'
import { animate, useMotionValue } from 'motion/react'
import { useEffect, useState } from 'react'
import { SkeletonText } from '@/components/Skeleton'
import { SparklineChart, generateMockTrend } from '@/components/charts/SparklineChart'
import { trpc } from '@/lib/trpc'
import { DB_CLUSTER_REFETCH_MS, LIVE_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'
import { useClusterContext } from '@/stores/cluster-context'
import { cn } from '@/lib/utils'
import { AnomalyWidget } from '@/components/anomalies/AnomalyWidget'
import { useDashboardRefreshInterval } from '@/components/dashboard/DashboardRefreshContext'

function AnimatedNumber({ value }: { value: string }) {
  const numericMatch = value.match(/^(\d+)(\/(\d+))?$/)
  const motionVal = useMotionValue(0)
  const [display, setDisplay] = useState(0)
  const [display2, setDisplay2] = useState<number | null>(null)

  useEffect(() => {
    if (!numericMatch) return
    const target = parseInt(numericMatch[1], 10)
    const controls = animate(motionVal, target, {
      duration: 1.2,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    if (numericMatch[3] != null) setDisplay2(parseInt(numericMatch[3], 10))
    return controls.stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  if (!numericMatch) return <>{value}</>
  return <>{display2 != null ? `${display}/${display2}` : display}</>
}

function StatCard({
  icon,
  label,
  value,
  color,
  gradient,
  isLoading,
  sparklineData,
  sparklineColor,
  emphasized,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  gradient: string
  isLoading?: boolean
  sparklineData?: number[]
  sparklineColor?: string
  emphasized?: boolean
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl px-3 py-2.5 border flex items-center justify-between gap-2 transition-all duration-200',
        emphasized
          ? 'border-[var(--color-status-warning)]/40 ring-1 ring-[var(--color-status-warning)]/20'
          : 'border-[var(--color-border)]',
      )}
      style={{
        background: emphasized ? 'rgba(246,192,66,0.06)' : 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        minHeight: '64px',
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
            className={cn('text-2xl font-semibold tabular-nums tracking-tight', gradient !== 'none' && 'gradient-text')}
            style={gradient !== 'none' ? { backgroundImage: gradient } : { color }}
          >
            <AnimatedNumber value={value} />
          </div>
        )}
      </div>
      <span className="shrink-0 opacity-60" style={{ color }}>{icon}</span>
      {sparklineData && sparklineData.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[50px] opacity-50 pointer-events-none">
          <SparklineChart data={sparklineData} color={sparklineColor ?? color} height={50} />
        </div>
      )}
    </div>
  )
}

export function StatCardsWidget() {
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const intervalMs = useDashboardRefreshInterval()

  const listQuery = trpc.clusters.list.useQuery(undefined, { refetchInterval: Math.min(DB_CLUSTER_REFETCH_MS, intervalMs) })
  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: activeClusterId ?? '' },
    { refetchInterval: Math.min(LIVE_CLUSTER_REFETCH_MS, intervalMs), enabled: Boolean(activeClusterId) },
  )
  const statsQuery = trpc.metrics.currentStats.useQuery(undefined, { refetchInterval: Math.min(30000, intervalMs), retry: 1 })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  const totalNodes = (liveData?.nodes.length ?? 0) + dbClusters.reduce((s, c) => s + c.nodeCount, 0)
  const runningPods = liveData?.runningPods ?? 0
  const warningEvents = liveData?.events.filter((e) => e.type === 'Warning').length ?? 0
  const clusterCount = dbClusters.length + (liveData ? 1 : 0)

  const sparklines = {
    nodes: generateMockTrend(totalNodes || 3),
    pods: generateMockTrend(runningPods || 8),
    clusters: generateMockTrend(clusterCount || 2),
    warnings: generateMockTrend(warningEvents || 1, 0.3),
  }

  return (
    <div className="h-full p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 content-start">
      <StatCard
        icon={<Server className="h-3.5 w-3.5" />}
        label="Total Nodes"
        value={String(totalNodes)}
        color={totalNodes > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)'}
        gradient={totalNodes > 0 ? 'var(--gradient-text-default)' : 'none'}
        isLoading={isLoading}
        sparklineData={sparklines.nodes}
        sparklineColor="var(--color-chart-cpu)"
      />
      <StatCard
        icon={<Container className="h-3.5 w-3.5" />}
        label="Running Pods"
        value={`${runningPods}/${liveData?.totalPods ?? 0}`}
        color={runningPods > 0 ? 'var(--color-status-active)' : 'var(--color-text-muted)'}
        gradient={runningPods > 0 ? 'var(--gradient-text-healthy)' : 'none'}
        isLoading={isLoading}
        sparklineData={sparklines.pods}
        sparklineColor="var(--color-chart-pods)"
      />
      <StatCard
        icon={<LayoutGrid className="h-3.5 w-3.5" />}
        label="Clusters"
        value={String(clusterCount)}
        color={clusterCount > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)'}
        gradient={clusterCount > 0 ? 'var(--gradient-text-default)' : 'none'}
        isLoading={isLoading}
        sparklineData={sparklines.clusters}
        sparklineColor="var(--color-chart-clusters)"
      />
      <StatCard
        icon={warningEvents > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
        label="Warning Events"
        value={String(warningEvents)}
        color={warningEvents > 0 ? 'var(--color-status-warning)' : 'var(--color-text-muted)'}
        gradient={warningEvents > 0 ? 'var(--gradient-text-warning)' : 'none'}
        isLoading={isLoading}
        emphasized={warningEvents > 0}
        sparklineData={sparklines.warnings}
        sparklineColor="var(--color-chart-warnings)"
      />
      <AnomalyWidget compact />
    </div>
  )
}
