'use client'

import { Icon } from '@iconify/react'
import type { ColumnDef } from '@tanstack/react-table'
import { PodDetailSheet } from '@/components/PodDetailSheet'
import { Box, ChevronDown, Cpu, Globe, Server, Trash2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { LoadingState } from '@/components/LoadingState'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { AiContextCard } from '@/components/AiContextCard'
import { AiInsightBanner } from '@/components/ai/AiInsightBanner'
import { MetricsTimeSeriesPanel } from '@/components/metrics/MetricsTimeSeriesPanel'
import { healthBadgeLabel, normalizeLiveHealthStatus } from '@/lib/cluster-status'
import { nodeStatusColor, severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'

function formatMemoryKi(ki: string): string {
  const match = ki.match(/^(\d+)Ki$/)
  if (!match) return ki
  const gb = Number(match[1]) / (1024 * 1024)
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(Number(match[1]) / 1024).toFixed(0)} MB`
}

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

interface PodRow {
  id: string
  name: string
  namespace: string
  status: string
  createdAt: string | null
  nodeName: string | null
  cpuMillis: number | null
  memoryMi: number | null
  cpuPercent: number | null
  memoryPercent: number | null
  restartCount: number | null
  ready: string | null
}

function DeletePodDialog({
  pod,
  clusterId,
  onClose,
}: {
  pod: PodRow
  clusterId: string
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const deleteMutation = trpc.pods.delete.useMutation({
    onSuccess: () => {
      toast.success(`Pod ${pod.name} deleted`)
      utils.pods.list.invalidate({ clusterId })
      utils.clusters.live.invalidate({ clusterId })
      onClose()
    },
    onError: (err) => {
      toast.error(`Failed to delete pod: ${err.message}`)
    },
  })

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 w-96 max-w-[calc(100vw-2rem)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Delete pod ${pod.name}`}
      >
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">Delete Pod</h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-4 font-mono">
          {pod.namespace}/{pod.name}
        </p>
        <p className="text-[12px] text-[var(--color-text-secondary)] mb-4">
          This will delete pod{' '}
          <span className="font-mono font-medium text-[var(--color-text-primary)]">{pod.name}</span>
          . K8s will restart it automatically.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-badge-label)] hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              deleteMutation.mutate({ clusterId, namespace: pod.namespace, podName: pod.name })
            }
            disabled={deleteMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClusterOverviewPage() {
  const { id } = useParams<{ id: string }>()

  const dbCluster = trpc.clusters.get.useQuery({ id })
  const resolvedId = dbCluster.data?.id ?? id
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

  const isAdmin = useIsAdmin()
  const [deletePodTarget, setDeletePodTarget] = useState<PodRow | null>(null)
  const [selectedPod, setSelectedPod] = useState<PodRow | null>(null)

  const dbNodes = trpc.nodes.list.useQuery({ clusterId: resolvedId }, { enabled: !effectiveIsLive })
  const dbEvents = trpc.events.list.useQuery(
    { clusterId: resolvedId, limit: 20 },
    { enabled: !effectiveIsLive },
  )
  const podsQuery = trpc.pods.list.useQuery(
    { clusterId: resolvedId },
    {
      enabled: effectiveIsLive,
      refetchInterval: 30000,
    },
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

  return (
    <>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
          <div
            key={stat.label}
            className="rounded-xl bg-white/[0.03] border border-[var(--color-border)] p-3.5"
          >
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                {stat.label}
              </span>
            </div>
            <p
              className={`text-lg font-bold ${
                stat.value === '—' || stat.value === '0' || stat.value === '0 / 0'
                  ? 'text-[var(--color-text-dim)] opacity-60'
                  : 'text-[var(--color-text-primary)]'
              }`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Real-time time-series charts */}
      <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        <MetricsTimeSeriesPanel clusterId={resolvedId} isLive={effectiveIsLive} compact />
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

      {deletePodTarget && (
        <DeletePodDialog
          pod={deletePodTarget}
          clusterId={resolvedId}
          onClose={() => setDeletePodTarget(null)}
        />
      )}

      <PodDetailSheet
        pod={selectedPod ? { ...selectedPod, restartCount: selectedPod.restartCount ?? undefined } : null}
        open={!!selectedPod}
        onOpenChange={(open) => {
          if (!open) setSelectedPod(null)
        }}
        events={events
          ?.filter((e) => selectedPod && e.message?.includes(selectedPod.name))
          .slice(0, 10)
          .map((e) => ({ ...e, timestamp: e.timestamp ?? undefined }))}
      />
    </>
  )
}

function PodsGroupedByNamespace({
  pods,
  isLoading,
  isAdmin,
  onDeletePod,
  onSelectPod,
}: {
  pods: PodRow[]
  isLoading: boolean
  isAdmin: boolean
  onDeletePod: (pod: PodRow) => void
  onSelectPod: (pod: PodRow) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, PodRow[]>()
    for (const pod of pods) {
      const ns = pod.namespace || 'default'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)?.push(pod)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [pods])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={`skeleton-ns-${i}`} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (pods.length === 0) {
    return <p className="text-[12px] text-[var(--color-text-muted)] py-4">No pods found.</p>
  }

  return (
    <div className="space-y-2">
      {grouped.map(([namespace, nsPods]) => (
        <NamespacePodGroup
          key={namespace}
          namespace={namespace}
          pods={nsPods}
          isAdmin={isAdmin}
          onDeletePod={onDeletePod}
          onSelectPod={onSelectPod}
        />
      ))}
    </div>
  )
}

function NamespacePodGroup({
  namespace,
  pods,
  isAdmin,
  onDeletePod,
  onSelectPod,
}: {
  namespace: string
  pods: PodRow[]
  isAdmin: boolean
  onDeletePod: (pod: PodRow) => void
  onSelectPod: (pod: PodRow) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--color-text-dim)] transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="text-[12px] font-bold font-mono text-[var(--color-text-secondary)]">
          {namespace}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold">
          {pods.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 pl-2">
          {pods.map((pod) => {
            const statusColor =
              pod.status === 'Running'
                ? 'bg-[var(--color-status-active)]'
                : pod.status === 'Pending'
                  ? 'bg-[var(--color-status-warning)]'
                  : 'bg-[var(--color-status-error)]'
            return (
              <button
                key={pod.id}
                type="button"
                onClick={() => onSelectPod(pod)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`} />
                <span className="flex-1 min-w-0 text-[13px] font-mono text-[var(--color-text-primary)] truncate">
                  {pod.name}
                </span>
                {pod.ready && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      pod.ready.split('/')[0] === pod.ready.split('/')[1]
                        ? 'bg-[var(--color-status-active)]/15 text-[var(--color-status-active)]'
                        : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'
                    }`}
                  >
                    {pod.ready}
                  </span>
                )}
                {pod.cpuPercent != null && (
                  <span
                    className="text-[10px] font-mono text-[var(--color-text-dim)]"
                    title="CPU %"
                  >
                    CPU {pod.cpuPercent}%
                  </span>
                )}
                {pod.memoryPercent != null && (
                  <span
                    className="text-[10px] font-mono text-[var(--color-text-dim)]"
                    title="Memory %"
                  >
                    Mem {pod.memoryPercent}%
                  </span>
                )}
                {pod.restartCount != null && pod.restartCount > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      pod.restartCount >= 5
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)]'
                    }`}
                    title="Restart count"
                  >
                    ↻{pod.restartCount}
                  </span>
                )}
                <span className="text-[11px] text-[var(--color-text-secondary)]">{pod.status}</span>
                <span className="text-[11px] text-[var(--color-text-dim)] font-mono">
                  {pod.createdAt ? timeAgo(pod.createdAt) : '—'}
                </span>
                {isAdmin && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeletePod(pod)
                          }}
                          className="p-1 rounded hover:bg-red-500/10 text-[var(--color-text-dim)] hover:text-red-400 transition-colors"
                          aria-label={`Delete pod ${pod.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete pod</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </button>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
