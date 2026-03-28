'use client'

import { CircleCheck, HardDrive, Settings, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, TagPills } from '@/components/expandable'
import { ResourceDiff, ResourcePageScaffold, YamlViewer } from '@/components/resource'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface PVCData {
  name: string
  namespace: string
  phase: string
  capacity: string
  requestedStorage: string
  storageClass: string
  accessModes: string[]
  volumeName: string | null
  volumeMode: string
  age: string
  labels: Record<string, string>
  annotations: Record<string, string>
  finalizers: string[]
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
}

function phaseColor(phase: string) {
  if (phase === 'Bound') return 'var(--color-status-active)'
  if (phase === 'Pending') return 'var(--color-status-warning)'
  return 'var(--color-status-error)'
}

function PVCSummary({ pvc }: { pvc: PVCData }) {
  const color = phaseColor(pvc.phase)

  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <HardDrive className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {pvc.name}
      </span>
      <span
        className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        {pvc.phase}
      </span>
      <span className="text-xs font-mono text-[var(--color-accent)] shrink-0">{pvc.capacity}</span>
      <span className="text-xs font-mono text-[var(--color-text-secondary)] shrink-0">
        {pvc.storageClass}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0 hidden sm:inline">
        {pvc.accessModes.join(', ')}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">{pvc.age}</span>
    </div>
  )
}

function PVCExpandedDetail({ pvc, clusterId }: { pvc: PVCData; clusterId: string }) {
  const tabs = [
    {
      id: 'volume',
      label: 'Volume',
      icon: <HardDrive className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Volume Name</span>
          <span className="text-[var(--color-accent)]">{pvc.volumeName ?? '—'}</span>
          <span className="text-[var(--color-text-muted)]">Capacity</span>
          <span className="text-[var(--color-text-primary)]">{pvc.capacity}</span>
          <span className="text-[var(--color-text-muted)]">Requested</span>
          <span className="text-[var(--color-accent)] font-bold">{pvc.requestedStorage}</span>
          <span className="text-[var(--color-text-muted)]">Storage Class</span>
          <span className="text-[var(--color-text-primary)]">{pvc.storageClass}</span>
          <span className="text-[var(--color-text-muted)]">Volume Mode</span>
          <span className="text-[var(--color-text-primary)]">{pvc.volumeMode}</span>
        </div>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
            <span className="text-[var(--color-text-muted)]">Phase</span>
            <span style={{ color: phaseColor(pvc.phase) }} className="font-bold">
              {pvc.phase}
            </span>
            <span className="text-[var(--color-text-muted)]">Access Modes</span>
            <span className="text-[var(--color-text-primary)]">
              {pvc.accessModes.join(', ') || '—'}
            </span>
          </div>
          {pvc.conditions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Conditions
              </p>
              <ConditionsList conditions={pvc.conditions} />
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {Object.keys(pvc.labels).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Labels
              </p>
              <TagPills tags={pvc.labels} />
            </div>
          )}
          {pvc.finalizers.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Finalizers
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pvc.finalizers.map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 bg-white/[0.03] border border-[var(--color-border)]/40 rounded-md font-mono text-[10px] text-[var(--color-text-secondary)]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
          {Object.keys(pvc.labels).length === 0 && pvc.finalizers.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">No additional config.</p>
          )}
        </div>
      ),
    },
    {
      id: 'yaml',
      label: 'YAML',
      content: (
        <YamlViewer
          clusterId={clusterId}
          resourceType="pvcs"
          resourceName={pvc.name}
          namespace={pvc.namespace}
        />
      ),
    },
    {
      id: 'diff',
      label: 'Diff',
      content: (
        <ResourceDiff
          clusterId={clusterId}
          resourceType="pvcs"
          resourceName={pvc.name}
          namespace={pvc.namespace}
        />
      ),
    },
  ]

  return <DetailTabs id={`pvc-${pvc.namespace}-${pvc.name}`} tabs={tabs} />
}

export default function PVCsPage() {
  usePageTitle('PVCs')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.pvcs.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )

  return (
    <ResourcePageScaffold<PVCData>
      title="PVCs"
      icon={<HardDrive className="h-10 w-10 text-[var(--color-text-dim)]" />}
      queryResult={{
        data: hasCredentials ? ((query.data ?? []) as PVCData[]) : undefined,
        isLoading: hasCredentials ? query.isLoading : false,
        error: query.error,
      }}
      getNamespace={(pvc) => pvc.namespace}
      getKey={(pvc) => `${pvc.namespace}/${pvc.name}`}
      filterFn={(pvc, q) =>
        pvc.name.toLowerCase().includes(q) ||
        pvc.namespace.toLowerCase().includes(q) ||
        pvc.phase.toLowerCase().includes(q) ||
        pvc.storageClass.toLowerCase().includes(q)
      }
      renderSummary={(pvc) => <PVCSummary pvc={pvc} />}
      renderDetail={(pvc) => <PVCExpandedDetail pvc={pvc} clusterId={resolvedId} />}
      searchPlaceholder="Search PVCs..."
      emptyMessage={hasCredentials ? 'No PVCs found' : 'Live data unavailable'}
      emptyDescription={
        hasCredentials
          ? 'PVCs will appear here when available in the cluster.'
          : 'Connect cluster credentials to view PVCs.'
      }
    />
  )
}
