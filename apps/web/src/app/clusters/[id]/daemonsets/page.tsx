'use client'

import { BarChart3, CircleCheck, Tag } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface DaemonSetData {
  name: string
  namespace: string
  desired: number
  current: number
  ready: number
  updated: number
  available: number
  unavailable: number
  age: string
  nodeSelector: Record<string, string>
  tolerations: { key: string; operator: string; value: string; effect: string }[]
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
}

function DaemonSetExpandedDetail({ ds }: { ds: DaemonSetData }) {
  const tabs = [
    {
      id: 'status',
      label: 'Status',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      content: (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Desired', value: ds.desired },
            { label: 'Current', value: ds.current },
            { label: 'Ready', value: ds.ready },
            { label: 'Updated', value: ds.updated },
            { label: 'Available', value: ds.available },
            { label: 'Unavailable', value: ds.unavailable },
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
              </p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'selectors',
      label: 'Selectors',
      icon: <Tag className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-4">
          {Object.keys(ds.nodeSelector).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Node Selector
              </p>
              <TagPills tags={ds.nodeSelector} />
            </div>
          )}
          {ds.tolerations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Tolerations ({ds.tolerations.length})
              </p>
              <div className="space-y-1">
                {ds.tolerations.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 bg-white/[0.02] border border-[var(--color-border)]/40 rounded-md"
                  >
                    <span className="text-[var(--color-accent)]">{t.key}</span>
                    <span className="text-[var(--color-text-muted)]/60">{t.operator}</span>
                    {t.value && (
                      <span className="text-[var(--color-text-secondary)]">{t.value}</span>
                    )}
                    <span className="ml-auto px-1 py-px rounded text-[9px] bg-amber-500/10 text-amber-400 font-semibold">
                      {t.effect}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(ds.nodeSelector).length === 0 && ds.tolerations.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No node selectors or tolerations defined.
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
        ds.conditions.length > 0 ? (
          <ConditionsList conditions={ds.conditions} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No conditions reported.</p>
        ),
    },
  ]

  return <DetailTabs id={`ds-${ds.namespace}-${ds.name}`} tabs={tabs} />
}

export default function DaemonSetsPage() {
  usePageTitle('DaemonSets')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.daemonSets.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )

  const daemonSets = (query.data ?? []) as DaemonSetData[]

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view DaemonSets.
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

  if (daemonSets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No DaemonSets found</p>
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
            <th className="text-left px-3 py-2.5">Desired</th>
            <th className="text-left px-3 py-2.5">Current</th>
            <th className="text-left px-3 py-2.5">Ready</th>
            <th className="text-left px-3 py-2.5">Age</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {daemonSets.map((ds) => (
            <ExpandableTableRow
              key={`${ds.namespace}/${ds.name}`}
              columnCount={6}
              cells={
                <>
                  <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                    {ds.name}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                    {ds.namespace}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-primary)]">
                    {ds.desired}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {ds.current}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="font-mono text-xs px-1.5 py-0.5 rounded"
                      style={{
                        color:
                          ds.ready === ds.desired
                            ? 'var(--color-status-active)'
                            : 'var(--color-status-warning)',
                        background: `color-mix(in srgb, ${ds.ready === ds.desired ? 'var(--color-status-active)' : 'var(--color-status-warning)'} 12%, transparent)`,
                      }}
                    >
                      {ds.ready}/{ds.desired}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                    {ds.age}
                  </td>
                </>
              }
              detail={<DaemonSetExpandedDetail ds={ds} />}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
