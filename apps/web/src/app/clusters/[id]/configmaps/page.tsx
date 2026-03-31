'use client'

import { FileText, Key, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DetailTabs, TagPills } from '@/components/expandable'
import { ResourcePageScaffold } from '@/components/resource'
import { ResourceDiff } from '@/components/resource/ResourceDiff'
import { YamlViewer } from '@/components/resource/YamlViewer'
import { useClusterResources, useSnapshotsReady } from '@/hooks/useResources'
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

function ConfigMapSummary({ cm }: { cm: ConfigMapData }) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <FileText className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {cm.name}
      </span>
      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] shrink-0">
        {cm.dataKeysCount} key{cm.dataKeysCount !== 1 ? 's' : ''}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">{cm.age}</span>
    </div>
  )
}

function ConfigMapExpandedDetail({ cm, clusterId }: { cm: ConfigMapData; clusterId: string }) {
  const tabs = [
    {
      id: 'keys',
      label: 'Data Keys',
      icon: <Key className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-1.5">
          {cm.dataEntries.length > 0 ? (
            cm.dataEntries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)]/40 px-3 py-1.5 text-[11px] font-mono"
              >
                <span className="text-[var(--color-accent)] font-bold">{entry.key}</span>
                <span className="text-[var(--color-text-muted)]">
                  {entry.size.toLocaleString()} chars
                </span>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">No data keys.</p>
          )}
          {cm.binaryDataKeysCount > 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
              + {cm.binaryDataKeysCount} binary data key{cm.binaryDataKeysCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'labels',
      label: 'Labels',
      icon: <Tag className="h-3.5 w-3.5" />,
      content:
        Object.keys(cm.labels ?? {}).length > 0 ? (
          <TagPills tags={cm.labels} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No labels.</p>
        ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="configmaps"
          resourceName={cm.name}
          namespace={cm.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="configmaps"
          resourceName={cm.name}
          namespace={cm.namespace}
        />
      ),
    },
  ]

  return <DetailTabs id={`cm-${cm.namespace}-${cm.name}`} tabs={tabs} />
}

export default function ConfigMapsPage() {
  usePageTitle('ConfigMaps')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const configmaps = useClusterResources<ConfigMapData>(resolvedId, 'configmaps')
  const snapshotsReady = useSnapshotsReady(resolvedId)
  const isLoading = configmaps.length === 0 && !snapshotsReady

  return (
    <ResourcePageScaffold<ConfigMapData>
      title="ConfigMaps"
      icon={<FileText className="h-10 w-10 text-[var(--color-text-dim)]" />}
      queryResult={{ data: configmaps, isLoading, error: null }}
      getNamespace={(cm) => cm.namespace}
      getKey={(cm) => `${cm.namespace}/${cm.name}`}
      filterFn={(cm, q) =>
        cm.name.toLowerCase().includes(q) || cm.namespace.toLowerCase().includes(q)
      }
      renderSummary={(cm) => <ConfigMapSummary cm={cm} />}
      renderDetail={(cm) => <ConfigMapExpandedDetail cm={cm} clusterId={resolvedId} />}
      searchPlaceholder="Search configmaps..."
      emptyMessage="No ConfigMaps found"
      emptyDescription="ConfigMaps will appear here when available in the cluster."
    />
  )
}
