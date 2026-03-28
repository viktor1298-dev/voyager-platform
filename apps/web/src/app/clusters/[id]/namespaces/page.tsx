'use client'

import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'

interface NamespaceData {
  name: string
  status: string | null
  labels: Record<string, string>
  annotations: Record<string, string>
  createdAt: string | null
  resourceQuota: {
    cpuLimit: string | null
    memLimit: string | null
    cpuUsed: string | null
    memUsed: string | null
  } | null
}

function statusColor(status: string | null): string {
  if (status === 'Active') return 'var(--color-status-active)'
  if (status === 'Terminating') return 'var(--color-status-error)'
  return 'var(--color-text-dim)'
}

function NamespaceExpanded({ ns }: { ns: NamespaceData }) {
  return (
    <div className="p-4 space-y-3">
      {Object.keys(ns.labels).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Labels ({Object.keys(ns.labels).length})
          </p>
          <TagPills tags={ns.labels} />
        </div>
      )}
      {Object.keys(ns.annotations).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Annotations ({Object.keys(ns.annotations).length})
          </p>
          <div className="space-y-1">
            {Object.entries(ns.annotations).map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[1fr_2fr] gap-2 text-[11px] font-mono px-2 py-1 bg-white/[0.02] rounded"
              >
                <span className="text-[var(--color-accent)] truncate" title={key}>
                  {key}
                </span>
                <span className="text-[var(--color-text-secondary)] truncate" title={value}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {ns.resourceQuota && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Resource Quotas
          </p>
          <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
            {ns.resourceQuota.cpuLimit && (
              <>
                <span className="text-[var(--color-text-muted)]">CPU Limit</span>
                <span className="text-[var(--color-text-primary)]">
                  {ns.resourceQuota.cpuUsed ?? '—'} / {ns.resourceQuota.cpuLimit}
                </span>
              </>
            )}
            {ns.resourceQuota.memLimit && (
              <>
                <span className="text-[var(--color-text-muted)]">Mem Limit</span>
                <span className="text-[var(--color-text-primary)]">
                  {ns.resourceQuota.memUsed ?? '—'} / {ns.resourceQuota.memLimit}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {Object.keys(ns.labels).length === 0 &&
        Object.keys(ns.annotations).length === 0 &&
        !ns.resourceQuota && (
          <p className="text-[11px] text-[var(--color-text-muted)]">No additional details.</p>
        )}
    </div>
  )
}

export default function NamespacesPage() {
  usePageTitle('Cluster Namespaces')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.namespaces.listDetail.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )
  const namespaces = (query.data ?? []) as NamespaceData[]

  if (!hasCredentials)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
      </div>
    )
  if (query.isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  if (namespaces.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No namespaces found</p>
      </div>
    )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Status</th>
            <th className="text-left px-3 py-2.5">Labels</th>
            <th className="text-left px-3 py-2.5">Created</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {namespaces.map((ns) => (
            <ExpandableTableRow
              key={ns.name}
              columnCount={4}
              cells={
                <>
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                    {ns.name}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: statusColor(ns.status),
                        background: `color-mix(in srgb, ${statusColor(ns.status)} 15%, transparent)`,
                      }}
                    >
                      {ns.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                    {Object.keys(ns.labels).length}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                    {ns.createdAt ? timeAgo(ns.createdAt) : '—'}
                  </td>
                </>
              }
              detail={<NamespaceExpanded ns={ns} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
