'use client'

import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface ConfigMapData {
  name: string
  namespace: string
  dataKeysCount: number
  binaryDataKeysCount: number
  age: string
  labels: Record<string, string>
  dataEntries: { key: string; value: string | null; size: number }[]
}

function ConfigMapExpanded({ cm }: { cm: ConfigMapData }) {
  return (
    <div className="p-4 space-y-3">
      {cm.dataEntries.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Data Keys ({cm.dataKeysCount})
          </p>
          <div className="space-y-1">
            {cm.dataEntries.map((entry) => (
              <div
                key={entry.key}
                className="rounded-md border border-[var(--color-border)]/40 p-2 text-[11px] font-mono"
              >
                <span className="text-[var(--color-accent)] font-bold">{entry.key}</span>
                {entry.value !== null ? (
                  <pre className="mt-1 text-[var(--color-text-secondary)] whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                    {entry.value}
                  </pre>
                ) : (
                  <span className="ml-2 text-[var(--color-text-muted)]">
                    ({entry.size.toLocaleString()} chars)
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {cm.binaryDataKeysCount > 0 && (
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Binary data keys: {cm.binaryDataKeysCount}
        </p>
      )}
      {Object.keys(cm.labels).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
            Labels
          </p>
          <TagPills tags={cm.labels} />
        </div>
      )}
      {cm.dataEntries.length === 0 && cm.binaryDataKeysCount === 0 && (
        <p className="text-[11px] text-[var(--color-text-muted)]">Empty ConfigMap.</p>
      )}
    </div>
  )
}

export default function ConfigMapsPage() {
  usePageTitle('ConfigMaps')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.configMaps.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )
  const configMaps = (query.data ?? []) as ConfigMapData[]

  if (!hasCredentials)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
      </div>
    )
  if (query.isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  if (configMaps.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No ConfigMaps found</p>
      </div>
    )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Namespace</th>
            <th className="text-left px-3 py-2.5">Data Keys</th>
            <th className="text-left px-3 py-2.5">Age</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {configMaps.map((cm) => (
            <ExpandableTableRow
              key={`${cm.namespace}/${cm.name}`}
              columnCount={4}
              cells={
                <>
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                    {cm.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                    {cm.namespace}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {cm.dataKeysCount}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                    {cm.age}
                  </td>
                </>
              }
              detail={<ConfigMapExpanded cm={cm} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
