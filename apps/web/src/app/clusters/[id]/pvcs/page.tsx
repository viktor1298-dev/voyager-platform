'use client'

import { CircleCheck, HardDrive, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
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

function PVCExpandedDetail({ pvc }: { pvc: PVCData }) {
  const tabs = [
    {
      id: 'status',
      label: 'Status',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Phase</span>
          <span style={{ color: phaseColor(pvc.phase) }} className="font-bold">
            {pvc.phase}
          </span>
          <span className="text-[var(--color-text-muted)]">Access Modes</span>
          <span className="text-[var(--color-text-primary)]">
            {pvc.accessModes.join(', ') || '—'}
          </span>
          <span className="text-[var(--color-text-muted)]">Volume Name</span>
          <span className="text-[var(--color-accent)]">{pvc.volumeName ?? '—'}</span>
          <span className="text-[var(--color-text-muted)]">Volume Mode</span>
          <span className="text-[var(--color-text-primary)]">{pvc.volumeMode}</span>
        </div>
      ),
    },
    {
      id: 'capacity',
      label: 'Capacity',
      icon: <HardDrive className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
          <span className="text-[var(--color-text-muted)]">Requested</span>
          <span className="text-[var(--color-accent)] font-bold">{pvc.requestedStorage}</span>
          <span className="text-[var(--color-text-muted)]">Capacity</span>
          <span className="text-[var(--color-text-primary)]">{pvc.capacity}</span>
          <span className="text-[var(--color-text-muted)]">Storage Class</span>
          <span className="text-[var(--color-text-primary)]">{pvc.storageClass}</span>
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
  const pvcs = (query.data ?? []) as PVCData[]

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
  if (pvcs.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No PVCs found</p>
      </div>
    )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Namespace</th>
            <th className="text-left px-3 py-2.5">Status</th>
            <th className="text-left px-3 py-2.5">Capacity</th>
            <th className="text-left px-3 py-2.5">Storage Class</th>
            <th className="text-left px-3 py-2.5">Age</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {pvcs.map((pvc) => (
            <ExpandableTableRow
              key={`${pvc.namespace}/${pvc.name}`}
              columnCount={6}
              cells={
                <>
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                    {pvc.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                    {pvc.namespace}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: phaseColor(pvc.phase),
                        background: `color-mix(in srgb, ${phaseColor(pvc.phase)} 15%, transparent)`,
                      }}
                    >
                      {pvc.phase}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-accent)]">
                    {pvc.capacity}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {pvc.storageClass}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                    {pvc.age}
                  </td>
                </>
              }
              detail={<PVCExpandedDetail pvc={pvc} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
