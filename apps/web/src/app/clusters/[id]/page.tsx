'use client'

import { Icon } from '@iconify/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Box, Cpu, Globe, Server } from 'lucide-react'
import { motion } from 'motion/react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AnimatedStatCount } from '@/components/AnimatedStatCount'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { LoadingState } from '@/components/LoadingState'
import { Progress } from '@/components/ui/progress'
import { AiContextCard } from '@/components/AiContextCard'
import { AiInsightBanner } from '@/components/ai/AiInsightBanner'
import { MetricsTimeSeriesPanel } from '@/components/metrics/MetricsTimeSeriesPanel'
import { healthBadgeLabel, normalizeLiveHealthStatus } from '@/lib/cluster-status'
import { nodeStatusColor, severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'

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
      className="text-[var(--color-text-dim)] text-[11px] italic"
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
        <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-muted)] text-[12px]">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'cpu',
      header: 'CPU',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">
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
          <div className="flex items-center gap-2 min-w-[80px]">
            <Progress value={v} className="h-1.5 flex-1" />
            <span className="text-[var(--color-text-secondary)] font-mono text-[11px] tabular-nums w-10 text-right">
              {v}%
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'memory',
      header: 'Memory',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">
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
          <div className="flex items-center gap-2 min-w-[80px]">
            <Progress value={v} className="h-1.5 flex-1" />
            <span className="text-[var(--color-text-secondary)] font-mono text-[11px] tabular-nums w-10 text-right">
              {v}%
            </span>
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
        <span className="text-[var(--color-text-dim)] font-mono text-[11px] whitespace-nowrap">
          {ts ? timeAgo(ts) : '—'}
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
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
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
      <span className="text-[var(--color-text-muted)] text-[12px] max-w-[400px] truncate block">
        {getValue<string>()}
      </span>
    ),
  },
]

export default function ClusterOverviewPage() {
  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )
  const isLive = hasCredentials

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: resolvedId },
    {
      enabled: isLive,
      refetchInterval: 30000,
      retry: false,
      staleTime: 30000,
    },
  )

  // Fallback to stored data when live query fails
  const liveFailed = isLive && liveQuery.isError
  const effectiveIsLive = isLive && !liveFailed
  const [activeTab, setActiveTab] = useState(effectiveIsLive ? 'live' : 'stored')

  useEffect(() => {
    setActiveTab(effectiveIsLive ? 'live' : 'stored')
  }, [effectiveIsLive])

  const dbNodes = trpc.nodes.list.useQuery({ clusterId: resolvedId }, { enabled: !effectiveIsLive })
  const dbEvents = trpc.events.list.useQuery(
    { clusterId: resolvedId, limit: 20 },
    { enabled: !effectiveIsLive },
  )

  // M-P3-003: Fetch anomalies for AI insight chips
  const anomaliesQuery = trpc.anomalies.list.useQuery(
    { clusterId: resolvedId, page: 1, pageSize: 50 },
    { staleTime: 60000 },
  )

  const isLoading = effectiveIsLive ? liveQuery.isLoading : dbCluster.isLoading

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

  const error = dbCluster.error
  if (!isLoading && error) {
    return <QueryError message={error.message} onRetry={() => dbCluster.refetch()} />
  }

  if (isLoading) {
    return <LoadingState message="Loading cluster details..." />
  }

  const liveData = liveQuery.data
  const cluster = effectiveIsLive
    ? {
        name: liveData?.name ?? 'minikube',
        provider: String(liveData?.provider ?? 'minikube'),
        version: String(liveData?.version ?? '—'),
        status: liveData?.status ?? 'unknown',
        healthStatus: String(
          liveData?.status ??
            (dbCluster.data as Record<string, unknown>)?.healthStatus ??
            dbCluster.data?.status ??
            'unknown',
        ),
        liveStatus: liveData?.status ?? 'unknown',
        endpoint: liveData?.endpoint ?? '—',
        nodeCount: liveData?.nodes?.length ?? 0,
        podCount: liveData?.totalPods ?? 0,
        runningPods: liveData?.runningPods ?? 0,
        namespaceCount: liveData?.namespaces?.length ?? 0,
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
        nodeCount: dbNodes.data?.length ?? 0,
        podCount: 0,
        runningPods: 0,
        namespaceCount: 0,
      }

  const nodes: NodeRow[] = effectiveIsLive
    ? (liveData?.nodes ?? []).map((n: Record<string, unknown>, i: number) => ({
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
        cpu: n['cpuAllocatable'] != null ? `${n['cpuAllocatable']}m / ${n['cpuCapacity'] ?? '?'}m` : '—',
        memory: n['memoryAllocatable'] != null ? `${Math.round(Number(n['memoryAllocatable']) / 1024)}Mi / ${Math.round(Number(n['memoryCapacity'] ?? 0) / 1024)}Mi` : '—',
        cpuPercent: typeof n['cpuPercent'] === 'number' ? n['cpuPercent'] : null,
        memoryPercent: typeof n['memoryPercent'] === 'number' ? n['memoryPercent'] : null,
      }))
    : (dbNodes.data ?? []).map((n: Record<string, unknown>, i: number) => ({
        id: `node-db-${i}`,
        name: asText(n['name'], ''),
        status: asText(n['status'], 'Unknown'),
        role: asText(n['role'], 'worker'),
        kubeletVersion: asText(n['k8sVersion']),
        os: '—',
        cpu: n['cpuAllocatable'] != null ? `${n['cpuAllocatable']}m` : '—',
        memory: n['memoryAllocatable'] != null ? `${Math.round(Number(n['memoryAllocatable']) / 1024)}Mi` : '—',
        cpuPercent: null,
        memoryPercent: null,
      }))

  const events: EventRow[] = effectiveIsLive
    ? (liveData?.events ?? []).map((e, i: number) => ({
        id: `event-live-${i}`,
        type: asText(e.type, 'Normal'),
        reason: asText(e.reason),
        message: asText(e.message),
        namespace: asText(e.namespace),
        timestamp: e.lastTimestamp ? String(e.lastTimestamp) : null,
      }))
    : (dbEvents.data ?? []).map((e) => ({
        id: String(e.id),
        type: asText(e.type, 'Normal'),
        reason: asText(e.reason),
        message: asText(e.message),
        namespace: asText(e.namespace),
        timestamp: e.createdAt
          ? e.createdAt instanceof Date
            ? e.createdAt.toISOString()
            : String(e.createdAt)
          : null,
      }))

  const normalizedStatus =
    typeof (cluster.healthStatus ?? cluster.status) === 'string'
      ? normalizeLiveHealthStatus(cluster.healthStatus ?? cluster.status)
      : 'unknown'

  const isUnreachable = normalizedStatus === 'error' || normalizedStatus === 'unknown' || liveFailed
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
              dbCluster.refetch()
              if (effectiveIsLive) liveQuery.refetch()
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
            a.severity === 'critical' && !a.acknowledgedAt && !a.resolvedAt
        ).length
        const warningCount = anomalyItems.filter(
          (a: { severity: string; acknowledgedAt: unknown; resolvedAt: unknown }) =>
            a.severity === 'warning' && !a.acknowledgedAt && !a.resolvedAt
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

      {/* Overview Stats — single set, no duplicates (BUG-RD-005 fixed) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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
        ].map((stat) => (
          // P3-008: Card hover lift
          <motion.div
            key={stat.label}
            whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="rounded-xl bg-white/[0.03] border border-[var(--color-border)] p-3.5"
          >
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                {stat.label}
              </span>
              {isUnreachable && (
                <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)] ml-auto">
                  STALE
                </span>
              )}
            </div>
            {/* P3-006: Animated stat count-up */}
            <AnimatedStatCount
              value={stat.value}
              className={`text-lg font-bold ${
                stat.value === '—' || stat.value === '0' || stat.value === '0 / 0'
                  ? 'text-[var(--color-text-dim)] opacity-60'
                  : 'text-[var(--color-text-primary)]'
              }`}
            />
          </motion.div>
        ))}
      </div>

      {/* Real-time time-series charts */}
      <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        {isUnreachable && !effectiveIsLive ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-white/[0.04] p-3 mb-3">
              <Cpu className="h-5 w-5 text-[var(--color-text-dim)]" />
            </div>
            <p className="text-sm font-medium text-[var(--color-text-muted)]">No data available</p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">Cluster is offline — metrics unavailable</p>
          </div>
        ) : (
          <MetricsTimeSeriesPanel clusterId={resolvedId} isLive={effectiveIsLive} compact />
        )}
      </div>

      {/* Recent Events Preview */}
      <div>
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2">Recent Events</h3>
        {events.slice(0, 5).map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-3 py-2 border-b border-[var(--color-border)]/30 last:border-0"
          >
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
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
            <span className="text-[10px] text-[var(--color-text-dim)] font-mono shrink-0">
              {event.timestamp ? timeAgo(event.timestamp) : '—'}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-[12px] text-[var(--color-text-muted)] py-2">No recent events.</p>
        )}
      </div>

    </>
  )
}

