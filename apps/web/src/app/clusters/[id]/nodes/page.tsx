'use client'

import { useMemo } from 'react'
import { Box, CircleCheck, Cpu, HardDrive, MapPin, Server, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import {
  ConditionsList,
  DetailTabs,
  ExpandableTableRow,
  ResourceBar,
  TagPills,
} from '@/components/expandable'
import { TableLoadingSkeleton } from '@/components/resource'
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
import { useClusterResources, useConnectionState, useSnapshotsReady } from '@/hooks/useResources'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface LiveNode {
  name: string
  status: string
  role: string
  kubeletVersion: string
  os: string
  cpuCapacityMillis: number
  cpuAllocatableMillis: number
  memCapacityMi: number
  memAllocatableMi: number
  podsCapacity: number
  podsAllocatable: number
  ephStorageCapacityGi: number
  ephStorageAllocatableGi: number
  cpuUsageMillis: number | null
  memUsageMi: number | null
  cpuPercent: number | null
  memPercent: number | null
  labels: Record<string, string>
  taints: { key: string; value: string; effect: string }[]
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
  addresses: { type: string; address: string }[]
}

// ---------------------------------------------------------------------------
// Node detail expanded content
// ---------------------------------------------------------------------------

function NodeDetail({ node, podCount }: { node: LiveNode; podCount: number }) {
  const tabs = [
    {
      id: 'resources',
      label: 'Resources',
      icon: <Box className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <ResourceBar
            label="CPU"
            icon={<Cpu className="h-3.5 w-3.5" />}
            used={node.cpuUsageMillis ?? 0}
            total={node.cpuAllocatableMillis}
            unit="m"
          />
          <ResourceBar
            label="Memory"
            icon={<HardDrive className="h-3.5 w-3.5" />}
            used={node.memUsageMi ?? 0}
            total={node.memAllocatableMi}
            unit="Mi"
          />
          <ResourceBar label="Pods" used={podCount} total={node.podsAllocatable} />
          <div className="pt-2 border-t border-[var(--color-border)]/30">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
              Capacity vs Allocatable
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] font-mono">
              <div className="text-[var(--color-text-muted)]">CPU Capacity</div>
              <div className="text-[var(--color-text-primary)]">{node.cpuCapacityMillis}m</div>
              <div className="text-[var(--color-text-muted)]">CPU Allocatable</div>
              <div className="text-[var(--color-text-primary)]">{node.cpuAllocatableMillis}m</div>
              <div className="text-[var(--color-text-muted)]">Mem Capacity</div>
              <div className="text-[var(--color-text-primary)]">{node.memCapacityMi} Mi</div>
              <div className="text-[var(--color-text-muted)]">Mem Allocatable</div>
              <div className="text-[var(--color-text-primary)]">{node.memAllocatableMi} Mi</div>
              {node.ephStorageAllocatableGi > 0 && (
                <>
                  <div className="text-[var(--color-text-muted)]">Eph Storage Capacity</div>
                  <div className="text-[var(--color-text-primary)]">
                    {node.ephStorageCapacityGi} Gi
                  </div>
                  <div className="text-[var(--color-text-muted)]">Eph Storage Allocatable</div>
                  <div className="text-[var(--color-text-primary)]">
                    {node.ephStorageAllocatableGi} Gi
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'labels',
      label: 'Labels & Taints',
      icon: <Tag className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-4">
          {Object.keys(node.labels ?? {}).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Labels ({Object.keys(node.labels ?? {}).length})
              </p>
              <TagPills tags={node.labels} />
            </div>
          )}
          {node.taints.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Taints ({node.taints.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {node.taints.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--color-track)] border border-[var(--color-border)]/40 rounded-md font-mono text-[10px]"
                  >
                    <span className="text-[var(--color-accent)]">{t.key}</span>
                    {t.value && (
                      <>
                        <span className="text-[var(--color-text-muted)]/60">=</span>
                        <span className="text-[var(--color-text-secondary)]">{t.value}</span>
                      </>
                    )}
                    <span className="ml-1 px-1 py-px rounded text-[9px] bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)] font-semibold">
                      {t.effect}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {node.addresses.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Addresses
              </p>
              <div className="space-y-1">
                {node.addresses.map((addr, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[11px] font-mono px-2 py-1 bg-[var(--color-track)] rounded"
                  >
                    <MapPin className="h-3 w-3 text-[var(--color-text-muted)]" />
                    <span className="text-[var(--color-text-muted)] min-w-[80px]">{addr.type}</span>
                    <span className="text-[var(--color-accent)]">{addr.address}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(node.labels ?? {}).length === 0 &&
            node.taints.length === 0 &&
            node.addresses.length === 0 && (
              <p className="text-[11px] text-[var(--color-text-muted)]">
                No labels, taints, or addresses.
              </p>
            )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: <ConditionsList conditions={node.conditions} />,
    },
  ]

  return <DetailTabs id={`node-${node.name}`} tabs={tabs} />
}

// ---------------------------------------------------------------------------
// Inline resource bar for summary row (compact)
// ---------------------------------------------------------------------------

function InlineBar({ value, label }: { value: number | null; label: string }) {
  if (value == null)
    return (
      <span className="text-[var(--color-text-dim)] text-xs italic" title="metrics-server required">
        —
      </span>
    )

  return (
    <div className="flex items-center gap-2 min-w-[100px]" title={`${label}: ${value}%`}>
      <div className="relative flex-1 h-4 rounded-full bg-[var(--color-track)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${Math.max(value, 2)}%`,
            background:
              value > 80
                ? 'var(--color-status-error)'
                : value > 60
                  ? 'var(--color-status-warning)'
                  : 'var(--color-accent)',
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-[var(--color-text-primary)] [text-shadow:0_0_3px_var(--color-bg-card),0_0_6px_var(--color-bg-card)]">
          {value}%
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NodesPage() {
  usePageTitle('Cluster Nodes')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const sseNodes = useClusterResources<LiveNode>(resolvedId, 'nodes')
  const connectionState = useConnectionState(resolvedId)
  const snapshotsReady = useSnapshotsReady(resolvedId)

  // Fetch node metrics via tRPC (Metrics API is not watchable, SSE has no usage data)
  const nodesWithMetrics = trpc.nodes.listLive.useQuery(
    { clusterId: resolvedId },
    { refetchInterval: 15_000, staleTime: 10_000 },
  )

  // Enrich SSE nodes with metrics from tRPC
  const nodes = useMemo(() => {
    if (!nodesWithMetrics.data) return sseNodes
    const metricsMap = new Map<string, LiveNode>()
    for (const n of nodesWithMetrics.data as LiveNode[]) {
      metricsMap.set(n.name, n)
    }
    return sseNodes.map((node) => {
      const withMetrics = metricsMap.get(node.name)
      if (!withMetrics) return node
      return {
        ...node,
        cpuUsageMillis: withMetrics.cpuUsageMillis,
        memUsageMi: withMetrics.memUsageMi,
        cpuPercent: withMetrics.cpuPercent,
        memPercent: withMetrics.memPercent,
      }
    })
  }, [sseNodes, nodesWithMetrics.data])

  // Count pods per node from SSE pod data
  const pods = useClusterResources<{ nodeName: string | null }>(resolvedId, 'pods')
  const podCountByNode = useMemo(() => {
    const counts = new Map<string, number>()
    for (const pod of pods) {
      if (pod.nodeName) {
        counts.set(pod.nodeName, (counts.get(pod.nodeName) ?? 0) + 1)
      }
    }
    return counts
  }, [pods])

  const isLoading = nodes.length === 0 && !snapshotsReady
  const isEmpty = nodes.length === 0
  const isOffline = connectionState === 'disconnected' && isEmpty

  return (
    <>
      <h1 className="sr-only">Cluster Nodes</h1>

      {isLoading && <TableLoadingSkeleton rows={4} cols={7} />}

      {!isLoading && isEmpty && (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-[var(--color-track)] p-3 mb-3">
            <Server className="h-10 w-10 text-[var(--color-text-dim)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {isOffline ? 'Cluster is currently offline' : 'No nodes found in this cluster'}
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            {isOffline
              ? 'Node data is unavailable while the cluster is offline. Check cluster connectivity and try again.'
              : 'Nodes appear here when your cluster has worker nodes registered.'}
          </p>
          <span className="mt-3 text-xs text-[var(--color-text-dim)]">
            Waiting for SSE connection...
          </span>
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-3 py-3">Status</th>
                <th className="text-left px-3 py-3">Role</th>
                <th className="text-left px-3 py-3">Kubelet</th>
                <th className="text-left px-3 py-3">CPU</th>
                <th className="text-left px-3 py-3 min-w-[130px]">CPU %</th>
                <th className="text-left px-3 py-3">Memory</th>
                <th className="text-left px-3 py-3 min-w-[130px]">Mem %</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <ExpandableTableRow
                  key={node.name}
                  columnCount={8}
                  cells={
                    <>
                      <td className="px-4 py-3">
                        <span className="font-medium font-mono text-[var(--color-text-primary)]">
                          {node.name}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <ResourceStatusBadge status={node.status} size="sm" />
                      </td>
                      <td className="px-3 py-3 text-[var(--color-text-muted)]">{node.role}</td>
                      <td className="px-3 py-3 text-[var(--color-text-secondary)] font-mono text-xs">
                        {node.kubeletVersion}
                      </td>
                      <td className="px-3 py-3 text-[var(--color-text-secondary)] font-mono text-xs">
                        {node.cpuAllocatableMillis}m / {node.cpuCapacityMillis}m
                      </td>
                      <td className="px-3 py-3">
                        <InlineBar value={node.cpuPercent} label="CPU" />
                      </td>
                      <td className="px-3 py-3 text-[var(--color-text-secondary)] font-mono text-xs">
                        {node.memAllocatableMi}Mi / {node.memCapacityMi}Mi
                      </td>
                      <td className="px-3 py-3">
                        <InlineBar value={node.memPercent} label="Memory" />
                      </td>
                    </>
                  }
                  detail={<NodeDetail node={node} podCount={podCountByNode.get(node.name) ?? 0} />}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
