'use client'

import { AppLayout } from '@/components/AppLayout'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCPU, formatMemory, formatTimestamp } from '@/lib/formatters'
import { nodeStatusColor, severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const cluster = trpc.clusters.get.useQuery({ id })
  const nodesQuery = trpc.nodes.list.useQuery({ clusterId: id })
  const eventsQuery = trpc.events.list.useQuery({ clusterId: id, limit: 20 })

  if (cluster.isLoading) {
    return (
      <AppLayout>
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-10 w-72 mb-2" />
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-64 w-full" />
      </AppLayout>
    )
  }

  if (cluster.error) {
    return (
      <AppLayout>
        <Link href="/" className="text-[var(--color-accent)] hover:underline text-sm">
          ← Back
        </Link>
        <p className="text-[var(--color-status-error)] mt-4">Error: {cluster.error.message}</p>
      </AppLayout>
    )
  }

  // biome-ignore lint/style/noNonNullAssertion: guarded by early returns above
  const data = cluster.data!
  const nodeList = nodesQuery.data ?? []
  const eventList = eventsQuery.data ?? []

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
        <span className="text-[var(--color-text-secondary)]">{data.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          {data.name}
        </h1>
        <span
          className={`h-2.5 w-2.5 rounded-full ${data.status === 'healthy' ? 'bg-[var(--color-status-active)]' : data.status === 'warning' ? 'bg-[var(--color-status-warning)]' : 'bg-[var(--color-status-error)]'}`}
        />
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-accent)] border border-[var(--color-border)]">
          {data.provider}
        </span>
      </div>
      <p className="text-[11px] text-[var(--color-text-dim)] font-mono mb-8">
        Kubernetes {data.version ?? '—'}
      </p>

      {/* Nodes Table */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-5 mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Nodes ({nodeList.length})
          </h2>
        </div>

        {nodesQuery.isLoading ? (
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
                      {formatCPU(node.cpuAllocatable)} / {formatCPU(node.cpuCapacity)}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)] font-mono text-[12px]">
                      {formatMemory(node.memoryAllocatable)} / {formatMemory(node.memoryCapacity)}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-primary)] font-bold text-[13px]">
                      {node.podsCount}
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

        {eventsQuery.isLoading ? (
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
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
