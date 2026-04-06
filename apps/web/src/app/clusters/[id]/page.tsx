'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Box, Cpu, Globe, Server } from 'lucide-react'
import { motion } from 'motion/react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AnimatedStatCount } from '@/components/AnimatedStatCount'
import { listContainerVariants, listItemVariants } from '@/lib/animation-constants'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { LoadingState } from '@/components/LoadingState'
import { AiContextCard } from '@/components/AiContextCard'
import { AiInsightBanner } from '@/components/ai/AiInsightBanner'
import { MetricsTimeSeriesPanel } from '@/components/metrics/MetricsTimeSeriesPanel'
import dynamic from 'next/dynamic'
const TopologyMap = dynamic(
  () => import('@/components/topology/TopologyMap').then((m) => ({ default: m.TopologyMap })),
  {
    ssr: false,
    loading: () => <div className="h-[500px] animate-pulse rounded-xl bg-[var(--color-bg-card)]" />,
  },
)
import { healthBadgeLabel, normalizeLiveHealthStatus } from '@/lib/cluster-status'
import { nodeStatusColor, severityColor } from '@/lib/status-utils'
import { useClusterResources, useConnectionState, useResourceLoading } from '@/hooks/useResources'
import { useRequestResourceTypes } from '@/hooks/useRequestResourceTypes'
import { DB_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { LiveTimeAgo } from '@/components/shared/LiveTimeAgo'
import { usePageTitle } from '@/hooks/usePageTitle'

function asText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  return fallback
}

interface NodeRow {
  id: string
  name: string
  status: string
  role: string
  kubeletVersion: string
  os: string
  cpu: string
  memory: string
  cpuPercent: number | null
  memoryPercent: number | null
}

interface EventRow {
  id: string
  type: string
  reason: string
  message: string
  namespace: string
  timestamp: string | null
}

function makeNodeColumns(metricsAvailable: boolean): ColumnDef<NodeRow, unknown>[] {
  const metricsUnavailableCell = () => (
    <span
      className="text-[var(--color-text-dim)] text-xs italic"
      title="Install metrics-server in your cluster to enable resource metrics"
    >
      {metricsAvailable ? '—' : 'metrics-server required'}
    </span>
  )
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ getValue }) => (
        <span className="font-medium text-[var(--color-text-primary)] text-[13px]">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue<string>()
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusColor(status)}`} />
            <span className="text-[var(--color-text-secondary)] text-[13px]">{status}</span>
          </span>
        )
      },
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-muted)] text-[13px]">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'kubeletVersion',
      header: 'Kubelet',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-xs">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-muted)] text-xs">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'cpu',
      header: 'CPU',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-xs">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'cpuPercent',
      header: 'CPU %',
      cell: ({ getValue }) => {
        const v = getValue<number | null>()
        if (v == null) return metricsUnavailableCell()
        return (
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="relative flex-1 h-4 rounded-full bg-[var(--color-track)] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.max(v, 2)}%`,
                  background:
                    v > 80
                      ? 'var(--color-status-error)'
                      : v > 60
                        ? 'var(--color-status-warning)'
                        : 'var(--color-accent)',
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-[var(--color-text-primary)] mix-blend-normal drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                {v}%
              </span>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'memory',
      header: 'Memory',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-xs">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'memoryPercent',
      header: 'Mem %',
      cell: ({ getValue }) => {
        const v = getValue<number | null>()
        if (v == null) return metricsUnavailableCell()
        return (
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="relative flex-1 h-4 rounded-full bg-[var(--color-track)] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.max(v, 2)}%`,
                  background:
                    v > 80
                      ? 'var(--color-status-error)'
                      : v > 60
                        ? 'var(--color-status-warning)'
                        : 'var(--color-accent)',
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-[var(--color-text-primary)] mix-blend-normal drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                {v}%
              </span>
            </div>
          </div>
        )
      },
    },
  ]
}

const eventColumns: ColumnDef<EventRow, unknown>[] = [
  {
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ getValue }) => {
      const ts = getValue<string | null>()
      return (
        <span className="text-[var(--color-text-dim)] font-mono text-xs whitespace-nowrap">
          <LiveTimeAgo date={ts} />
        </span>
      )
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ getValue }) => {
      const type = getValue<string>()
      return (
        <span
          className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: severityColor(type),
            background: `color-mix(in srgb, ${severityColor(type)} 15%, transparent)`,
          }}
        >
          {type}
        </span>
      )
    },
  },
  {
    accessorKey: 'reason',
    header: 'Reason',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-primary)] text-[13px] font-medium whitespace-nowrap">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'message',
    header: 'Message',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] text-xs max-w-[400px] truncate block">
        {getValue<string>()}
      </span>
    ),
  },
]

export default function ClusterOverviewPage() {
  usePageTitle('Cluster Overview')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const utils = trpc.useUtils()
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  useRequestResourceTypes(resolvedId, ['nodes', 'pods', 'events', 'namespaces'] as const)

  // Zustand store for live resource data
  const liveNodes = useClusterResources<Record<string, unknown>>(resolvedId, 'nodes')
  const liveEvents = useClusterResources<Record<string, unknown>>(resolvedId, 'events')
  const livePods = useClusterResources<Record<string, unknown>>(resolvedId, 'pods')
  const liveNamespaces = useClusterResources<Record<string, unknown>>(resolvedId, 'namespaces')
  const connectionState = useConnectionState(resolvedId)
  const effectiveIsLive = connectionState === 'connected' || connectionState === 'reconnecting'

  const [activeTab, setActiveTab] = useState(effectiveIsLive ? 'live' : 'stored')

  useEffect(() => {
    setActiveTab(effectiveIsLive ? 'live' : 'stored')
  }, [effectiveIsLive])

  // M-P3-003: Fetch anomalies for AI insight chips
  const anomaliesQuery = trpc.anomalies.list.useQuery(
    { clusterId: resolvedId, page: 1, pageSize: 50 },
    { staleTime: DB_CLUSTER_REFETCH_MS },
  )

  const isLoading = useResourceLoading(resolvedId, 'nodes', liveNodes.length) && dbCluster.isLoading

  const lastConnectedAtRaw = (() => {
    const v = dbCluster.data?.lastConnectedAt
    if (!v) return null
    if (v instanceof Date) return v.toISOString()
    return String(v)
  })()

  // useMemo must be called unconditionally
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _connectivity = useMemo(() => {
    const ts = lastConnectedAtRaw
    if (!ts) return { dot: 'bg-[var(--color-status-error)]', label: 'Disconnected' }
    const diffMins = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000))
    if (diffMins < 10)
      return { dot: 'bg-[var(--color-status-active)]', label: `Connected ${diffMins} min ago` }
    if (diffMins <= 30)
      return { dot: 'bg-[var(--color-status-warning)]', label: `Last seen ${diffMins} min ago` }
    return { dot: 'bg-[var(--color-status-error)]', label: 'Disconnected' }
  }, [lastConnectedAtRaw])

  const runningPodCount = useMemo(() => {
    return livePods.filter((p) => (p as Record<string, unknown>)['status'] === 'Running').length
  }, [livePods])

  const error = dbCluster.error
  if (!isLoading && error) {
    return <QueryError message={error.message} onRetry={() => dbCluster.refetch()} />
  }

  if (isLoading) {
    return <LoadingState message="Loading cluster details..." />
  }

  const cluster = effectiveIsLive
    ? {
        name: String(dbCluster.data?.name ?? 'minikube'),
        provider: String(dbCluster.data?.provider ?? 'minikube'),
        version: String(dbCluster.data?.version ?? '—'),
        status: String(dbCluster.data?.status ?? 'unknown'),
        healthStatus: String(
          (dbCluster.data as Record<string, unknown>)?.healthStatus ??
            dbCluster.data?.status ??
            'unknown',
        ),
        endpoint: String((dbCluster.data as Record<string, unknown>)?.endpoint ?? '—'),
        nodeCount: liveNodes.length,
        podCount: livePods.length,
        runningPods: runningPodCount,
        namespaceCount: liveNamespaces.length,
        lastConnectedAt: lastConnectedAtRaw,
      }
    : {
        name: String(dbCluster.data?.name ?? ''),
        provider: String(dbCluster.data?.provider ?? ''),
        version: String(dbCluster.data?.version ?? '—'),
        status: String(dbCluster.data?.status ?? 'unknown'),
        healthStatus: String(
          (dbCluster.data as Record<string, unknown>)?.healthStatus ??
            dbCluster.data?.status ??
            'unknown',
        ),
        endpoint: String((dbCluster.data as Record<string, unknown>)?.endpoint ?? '—'),
        lastConnectedAt: lastConnectedAtRaw,
        nodeCount: liveNodes.length,
        podCount: livePods.length,
        runningPods: 0,
        namespaceCount: liveNamespaces.length,
      }

  const nodes: NodeRow[] = liveNodes.map((n: Record<string, unknown>, i: number) => ({
    id: `node-${i}`,
    name: asText(n['name'], ''),
    status:
      n['status'] === 'ready'
        ? 'Ready'
        : n['status'] === 'notready'
          ? 'NotReady'
          : asText(n['status'], 'Unknown'),
    role: asText(n['role'], 'worker'),
    kubeletVersion: asText(n['kubeletVersion']),
    os: asText(n['os'] ?? n['operatingSystem']),
    cpu:
      n['cpuAllocatableMillis'] != null
        ? `${n['cpuAllocatableMillis']}m / ${n['cpuCapacityMillis'] ?? '?'}m`
        : '—',
    memory:
      n['memAllocatableMi'] != null
        ? `${n['memAllocatableMi']}Mi / ${n['memCapacityMi'] ?? 0}Mi`
        : '—',
    cpuPercent: typeof n['cpuPercent'] === 'number' ? n['cpuPercent'] : null,
    memoryPercent: typeof n['memPercent'] === 'number' ? n['memPercent'] : null,
  }))

  const events: EventRow[] = liveEvents.map((e: Record<string, unknown>, i: number) => ({
    id: `event-live-${i}`,
    type: asText(e['type'], 'Normal'),
    reason: asText(e['reason']),
    message: asText(e['message']),
    namespace: asText(e['namespace']),
    timestamp: e['lastTimestamp'] ? String(e['lastTimestamp']) : null,
  }))

  const normalizedStatus =
    typeof (cluster.healthStatus ?? cluster.status) === 'string'
      ? normalizeLiveHealthStatus(cluster.healthStatus ?? cluster.status)
      : 'unknown'

  const isUnreachable =
    connectionState === 'disconnected' &&
    (normalizedStatus === 'error' || normalizedStatus === 'unknown')
  const lastContactAgo = cluster.lastConnectedAt ? timeAgo(cluster.lastConnectedAt) : null

  return (
    <>
      {/* Unreachable cluster warning banner */}
      {isUnreachable && (
        <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl border border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning)]/[0.06]">
          <span className="text-lg mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--color-status-warning)]">
              This cluster is currently unreachable
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {lastContactAgo
                ? `Last contact: ${lastContactAgo}. Displaying last known data.`
                : 'No contact history available. Check cluster connectivity and credentials.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              utils.health.check
                .fetch({ clusterId: resolvedId })
                .then(() => dbCluster.refetch())
                .catch(() => dbCluster.refetch())
            }}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-status-warning)]/30 text-[var(--color-status-warning)] hover:bg-[var(--color-status-warning)]/10 transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* AI Context Card for unhealthy clusters */}
      {(normalizedStatus === 'error' || normalizedStatus === 'degraded') && (
        <AiContextCard
          clusterName={cluster.name}
          clusterId={resolvedId}
          healthStatus={normalizedStatus as 'error' | 'degraded'}
        />
      )}

      {/* M-P3-003: AI insight chips when anomalies detected */}
      {(() => {
        const anomalyItems = anomaliesQuery.data?.items ?? []
        const criticalCount = anomalyItems.filter(
          (a: { severity: string; acknowledgedAt: unknown; resolvedAt: unknown }) =>
            a.severity === 'critical' && !a.acknowledgedAt && !a.resolvedAt,
        ).length
        const warningCount = anomalyItems.filter(
          (a: { severity: string; acknowledgedAt: unknown; resolvedAt: unknown }) =>
            a.severity === 'warning' && !a.acknowledgedAt && !a.resolvedAt,
        ).length
        if (criticalCount === 0 && warningCount === 0) return null
        return (
          <AiInsightBanner
            clusterId={resolvedId}
            criticalAnomalyCount={criticalCount}
            criticalAlertCount={warningCount}
          />
        )
      })()}

      {/* Overview Stats — inline strip with staggered entrance */}
      <motion.div
        className="flex flex-wrap items-center mb-4"
        variants={listContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {[
          { icon: Server, label: 'Nodes', value: String(cluster.nodeCount) },
          {
            icon: Box,
            label: 'Pods',
            value: effectiveIsLive
              ? `${cluster.runningPods} / ${cluster.podCount}`
              : String(cluster.podCount || '—'),
          },
          { icon: Globe, label: 'Namespaces', value: String(cluster.namespaceCount || '—') },
          { icon: Cpu, label: 'Version', value: cluster.version },
        ].map((stat, i, arr) => (
          <motion.div key={stat.label} variants={listItemVariants} className="contents">
            <div className="flex items-center gap-2 px-4 py-2.5 shrink-0">
              <stat.icon className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
              <AnimatedStatCount
                value={stat.value}
                className={`text-[15px] font-bold font-mono tabular-nums ${
                  stat.value === '—' || stat.value === '0' || stat.value === '0 / 0'
                    ? 'text-[var(--color-text-dim)] opacity-60'
                    : 'text-[var(--color-text-primary)]'
                }`}
              />
              <span className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">
                {stat.label}
              </span>
              {isUnreachable && (
                <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)]">
                  STALE
                </span>
              )}
            </div>
            {i < arr.length - 1 && <div className="w-px h-4 bg-[var(--color-border)] shrink-0" />}
          </motion.div>
        ))}
      </motion.div>

      {/* Real-time time-series charts */}
      <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        {isUnreachable && !effectiveIsLive ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-white/[0.04] p-3 mb-3">
              <Cpu className="h-5 w-5 text-[var(--color-text-dim)]" />
            </div>
            <p className="text-sm font-medium text-[var(--color-text-muted)]">No data available</p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              Cluster is offline — metrics unavailable
            </p>
          </div>
        ) : (
          <MetricsTimeSeriesPanel clusterId={resolvedId} isLive={effectiveIsLive} compact />
        )}
      </div>

      {/* Resource Topology */}
      {effectiveIsLive && (
        <div className="mb-4">
          <TopologyMap clusterId={resolvedId} />
        </div>
      )}

      {/* Recent Events Preview */}
      <div>
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">Recent Events</h3>
        {events.slice(0, 5).map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-3 py-2 border-b border-[var(--color-border)]/30 last:border-0"
          >
            <span
              className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
              style={{
                color: severityColor(event.type),
                background: `color-mix(in srgb, ${severityColor(event.type)} 15%, transparent)`,
              }}
            >
              {event.type}
            </span>
            <span className="text-xs text-[var(--color-text-primary)] font-medium">
              {event.reason}
            </span>
            <span className="flex-1 text-xs text-[var(--color-text-muted)] truncate">
              {event.message}
            </span>
            <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
              <LiveTimeAgo date={event.timestamp} />
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-xs text-[var(--color-text-muted)] py-2">No recent events.</p>
        )}
      </div>
    </>
  )
}
