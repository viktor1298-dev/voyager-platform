'use client'

import { FolderOpen, Info, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, TagPills } from '@/components/expandable'
import { ResourceDiff, ResourcePageScaffold, YamlViewer } from '@/components/resource'
import { useClusterResources, useSnapshotsReady } from '@/hooks/useResources'
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

function NamespaceSummary({ ns }: { ns: NamespaceData }) {
  const color = statusColor(ns.status)

  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <FolderOpen className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {ns.name}
      </span>
      <span
        className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        {ns.status ?? '—'}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
        {ns.createdAt ? timeAgo(ns.createdAt) : '—'}
      </span>
    </div>
  )
}

function NamespaceExpandedDetail({ ns, clusterId }: { ns: NamespaceData; clusterId: string }) {
  const tabs = [
    {
      id: 'status',
      label: 'Status',
      icon: <Info className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
            <span className="text-[var(--color-text-muted)]">Status</span>
            <span style={{ color: statusColor(ns.status) }} className="font-bold">
              {ns.status ?? '—'}
            </span>
            <span className="text-[var(--color-text-muted)]">Created</span>
            <span className="text-[var(--color-text-primary)]">
              {ns.createdAt ? timeAgo(ns.createdAt) : '—'}
            </span>
          </div>
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
        </div>
      ),
    },
    {
      id: 'labels',
      label: 'Labels',
      icon: <Tag className="h-3.5 w-3.5" />,
      content:
        Object.keys(ns.labels ?? {}).length > 0 ? (
          <TagPills tags={ns.labels} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No labels.</p>
        ),
    },
    {
      id: 'annotations',
      label: 'Annotations',
      icon: <Tag className="h-3.5 w-3.5" />,
      content:
        Object.keys(ns.annotations ?? {}).length > 0 ? (
          <div className="space-y-1">
            {Object.entries(ns.annotations ?? {}).map(([key, value]) => (
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
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No annotations.</p>
        ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer clusterId={clusterId} resourceType="namespaces" resourceName={ns.name} />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff clusterId={clusterId} resourceType="namespaces" resourceName={ns.name} />
      ),
    },
  ]

  return <DetailTabs id={`ns-${ns.name}`} tabs={tabs} />
}

export default function NamespacesPage() {
  usePageTitle('Cluster Namespaces')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const namespaces = useClusterResources<NamespaceData>(resolvedId, 'namespaces')
  const snapshotsReady = useSnapshotsReady(resolvedId)
  const isLoading = namespaces.length === 0 && !snapshotsReady

  return (
    <ResourcePageScaffold<NamespaceData>
      title="Namespaces"
      icon={<FolderOpen className="h-10 w-10 text-[var(--color-text-dim)]" />}
      queryResult={{ data: namespaces, isLoading, error: null }}
      flatList
      getNamespace={() => 'all'}
      getKey={(ns) => ns.name}
      filterFn={(ns, q) =>
        ns.name.toLowerCase().includes(q) || (ns.status?.toLowerCase().includes(q) ?? false)
      }
      renderSummary={(ns) => <NamespaceSummary ns={ns} />}
      renderDetail={(ns) => <NamespaceExpandedDetail ns={ns} clusterId={resolvedId} />}
      searchPlaceholder="Search namespaces..."
      emptyMessage="No namespaces found"
      emptyDescription="Namespaces will appear here when available in the cluster."
    />
  )
}
