'use client'

import { AppLayout } from '@/components/AppLayout'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestamp } from '@/lib/formatters'
import { nodeStatusColor, severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

const LIVE_CLUSTER_ID = 'live-minikube'

export default function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const isLive = id === LIVE_CLUSTER_ID

  // Live queries (only enabled for live cluster)
  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    enabled: isLive,
    refetchInterval: 30000,
  })
  const liveNodesQuery = trpc.clusters.liveNodes.useQuery(undefined, {
    enabled: isLive,
    refetchInterval: 30000,
  })
  const liveEventsQuery = trpc.clusters.liveEvents.useQuery(undefined, {
    enabled: isLive,
    refetchInterval: 30000,
  })

  // DB queries (only enabled for non-live clusters)
  const dbCluster = trpc.clusters.get.useQuery({ id }, { enabled: !isLive })
  const dbNodes = trpc.nodes.list.useQuery({ clusterId: id }, { enabled: !isLive })
  const dbEvents = trpc.events.list.useQuery({ clusterId: id, limit: 20 }, { enabled: !isLive })

  const isLoading = isLive ? liveQuery.isLoading : dbCluster.isLoading
  const error = isLive ? liveQuery.error : dbCluster.error

  if (isLoading) {
    return (
      <AppLayout>
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-10 w-72 mb-2" />
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-64 w-full" />
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <Link href="/" className="text-[var(--color-accent)] hover:underline text-sm">
          ← Back
        </Link>
        <p className="text-[var(--color-status-error)] mt-4">Error: {error.message}</p>
      </AppLayout>
    )
  }

  // Build unified data from live or DB source
  const clusterData = isLive
    ? {
        name: liveQuery.data?.name ?? 'minikube',
        provider: liveQuery.data?.provider ?? 'minikube',
        version: liveQuery.data?.version,
        status: liveQuery.data?.status ?? 'unknown',
      }
    : {
        name: dbCluster.data?.name ?? '',
        provider: dbCluster.data?.provider ?? '',
        version: dbCluster.data?.version,
        status: dbCluster.data?.status ?? 'unknown',
      }

  // Nodes
  const nodeList = isLive
    ? (liveNodesQuery.data ?? []).map((n) => ({
        id: n.name ?? '',
        name: n.name ?? '',
        status: n.status ?? 'Unknown',
        role: n.roles?.join(', ') || 'worker',
        cpu: n.cpu ?? '—',
        memory: n.memory ?? '—',
        pods: n.pods ?? '—',
        k8sVersion: n.version,
      }))
    : (dbNodes.data ?? []).map((n) => ({
        id: n.id,
        name: n.name,
        status: n.status,
        role: n.role,
        cpu: `${n.cpuAllocatable ?? '—'} / ${n.cpuCapacity ?? '—'}`,
        memory: `${n.memoryAllocatable ?? '—'} / ${n.memoryCapacity ?? '—'}`,
        pods: String(n.podsCount ?? '—'),
        k8sVersion: n.k8sVersion,
      }))
  const nodesLoading = isLive ? liveNodesQuery.isLoading : dbNodes.isLoading

  // Events
  const eventList = isLive
    ? (liveEventsQuery.data ?? []).map((e, i) => ({
        id: `live-event-${i}`,
        kind: e.type ?? 'Normal',
        reason: e.reason,
        message: e.message,
        namespace: e.namespace,
        timestamp: e.lastSeen as string | null | undefined,
      }))
    : (dbEvents.data ?? []).map((e) => ({
        id: e.id,
        kind: e.kind,
        reason: e.reason,
        message: e.message,
        namespace: e.namespace,
        timestamp: e.timestamp as string | null | undefined,
      }))
  const eventsLoading = isLive ? liveEventsQuery.isLoading : dbEvents.isLoading

  return (
    <AppLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-text-dim)] mb-6">
        <Link href="/" className="hover:text-[var(--color-text-muted)] transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/" className="hover:text-[var(--color-text-muted)] transition-colors">
          Clusters
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[var(--color-text-secondary)]">{clusterData.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          {clusterData.name}
        </h1>
        <span
          className={`h-2.5 w-2.5 rounded-full ${clusterData.status === 'healthy' ? 'bg-[var(--color-status-active)]' : clusterData.status === 'warning' || clusterData.status === 'degraded' ? 'bg-[var(--color-status-warning)]' : 'bg-[var(--color-status-error)]'}`}
        />
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-accent)] border border-[var(--color-border)]">
          {clusterData.provider}
        </span>
        {isLive && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--color-status-active)]/10 text-[var(--color-status-active)] border border-[var(--color-status-active)]/20">
            LIVE
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--color-text-dim)] font-mono mb-8">
        Kubernetes {clusterData.version ?? '—'}
      </p>

      {/* Nodes Table */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-5 mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Nodes ({nodeList.length})
          </h2>
        </div>

        {nodesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
              <Skeleton key={`skeleton-node-${i}`} className="h-10 w-full" />
            ))}
          </div>
        ) : nodeList.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm">No nodes found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Name', 'Status', 'Role', 'CPU', 'Memory', 'Pods', 'K8s Version'].map((h) => (
                    <th
                      key={h}
                      className="text-left py-2 px-3 text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono font-normal"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nodeList.map((node, i) => (
                  <tr
                    key={node.id}
                    className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.03] ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
                  >
                    <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)] text-[13px]">
                      {node.name}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${nodeStatusColor(node.status)}`}
                        />
                        <span className="text-[var(--color-text-secondary)] text-[13px]">
                          {node.status}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-[13px]">
                      {node.role}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)] font-mono text-[12px]">
                      {node.cpu}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)] font-mono text-[12px]">
                      {node.memory}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-primary)] font-bold text-[13px]">
                      {node.pods}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-muted)] font-mono text-[12px]">
                      {node.k8sVersion ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Events Timeline */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)] mb-4">
          Recent Events
        </h2>

        {eventsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
              <Skeleton key={`skeleton-event-${i}`} className="h-12 w-full" />
            ))}
          </div>
        ) : eventList.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm">No events found.</p>
        ) : (
          <div className="space-y-1">
            {eventList.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors border-l-2"
                style={{ borderLeftColor: severityColor(event.kind) }}
              >
                <div className="shrink-0">
                  <span
                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                    style={{
                      color: severityColor(event.kind),
                      background: `color-mix(in srgb, ${severityColor(event.kind)} 15%, transparent)`,
                    }}
                  >
                    {event.kind}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {event.reason ?? '—'}
                    </span>
                    {event.namespace && (
                      <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                        ns/{event.namespace}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 break-words">
                    {event.message ?? ''}
                  </p>
                </div>
                <span className="text-[10px] text-[var(--color-text-dim)] font-mono shrink-0">
                  {event.timestamp ? formatTimestamp(event.timestamp) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
