'use client'

import { BarChart3, CircleCheck, HardDrive } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, ExpandableTableRow } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface StatefulSetData {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  currentReplicas: number
  updatedReplicas: number
  image: string
  age: string
  volumeClaimTemplates: {
    name: string
    storageClass: string
    size: string
    accessModes: string[]
  }[]
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
}

function StatefulSetExpandedDetail({ ss }: { ss: StatefulSetData }) {
  const tabs = [
    {
      id: 'replicas',
      label: 'Replicas',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Ready', value: ss.readyReplicas, total: ss.replicas },
            { label: 'Current', value: ss.currentReplicas, total: ss.replicas },
            { label: 'Updated', value: ss.updatedReplicas, total: ss.replicas },
            { label: 'Desired', value: ss.replicas, total: null },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] p-3 text-center"
            >
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                {item.label}
              </p>
              <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">
                {item.value}
                {item.total !== null && (
                  <span className="text-xs font-normal text-[var(--color-text-muted)]">
                    /{item.total}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'storage',
      label: 'Storage',
      icon: <HardDrive className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-2">
          {ss.volumeClaimTemplates.length > 0 ? (
            ss.volumeClaimTemplates.map((vct) => (
              <div
                key={vct.name}
                className="rounded-lg border border-[var(--color-border)]/40 p-3 space-y-1"
              >
                <span className="text-[12px] font-bold font-mono text-[var(--color-text-primary)]">
                  {vct.name}
                </span>
                <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
                  <span className="text-[var(--color-text-muted)]">Storage Class</span>
                  <span className="text-[var(--color-text-secondary)]">{vct.storageClass}</span>
                  <span className="text-[var(--color-text-muted)]">Size</span>
                  <span className="text-[var(--color-accent)]">{vct.size}</span>
                  <span className="text-[var(--color-text-muted)]">Access Modes</span>
                  <span className="text-[var(--color-text-secondary)]">
                    {vct.accessModes.join(', ') || '—'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No volume claim templates defined.
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content:
        ss.conditions.length > 0 ? (
          <ConditionsList conditions={ss.conditions} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No conditions reported.</p>
        ),
    },
  ]

  return <DetailTabs id={`ss-${ss.namespace}-${ss.name}`} tabs={tabs} />
}

export default function StatefulSetsPage() {
  usePageTitle('StatefulSets')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.statefulSets.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )

  const statefulSets = (query.data ?? []) as StatefulSetData[]

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view StatefulSets.
        </p>
      </div>
    )
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (statefulSets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No StatefulSets found</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-2.5">Name</th>
            <th className="text-left px-3 py-2.5">Namespace</th>
            <th className="text-left px-3 py-2.5">Ready</th>
            <th className="text-left px-3 py-2.5">Image</th>
            <th className="text-left px-3 py-2.5">Age</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {statefulSets.map((ss) => {
            const readyStr = `${ss.readyReplicas}/${ss.replicas}`
            const allReady = ss.readyReplicas === ss.replicas && ss.replicas > 0
            return (
              <ExpandableTableRow
                key={`${ss.namespace}/${ss.name}`}
                columnCount={5}
                cells={
                  <>
                    <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                      {ss.name}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                      {ss.namespace}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{
                          color: allReady
                            ? 'var(--color-status-active)'
                            : 'var(--color-status-warning)',
                          background: `color-mix(in srgb, ${allReady ? 'var(--color-status-active)' : 'var(--color-status-warning)'} 12%, transparent)`,
                        }}
                      >
                        {readyStr}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="font-mono text-xs text-[var(--color-text-muted)] max-w-[200px] truncate block"
                        title={ss.image}
                      >
                        {ss.image}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                      {ss.age}
                    </td>
                  </>
                }
                detail={<StatefulSetExpandedDetail ss={ss} />}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
