'use client'

import { BarChart3, CircleCheck, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { useMemo, useState } from 'react'
import { ConditionsList, DetailTabs, ExpandableTableRow, TagPills } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface DeploymentDetail {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  availableReplicas: number
  unavailableReplicas: number
  image: string
  status: string
  age: string
  strategyType: string
  maxSurge: string | null
  maxUnavailable: string | null
  selector: Record<string, string>
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
}

function statusColor(status: string): string {
  if (status === 'Running') return 'var(--color-status-active)'
  if (status === 'Scaling') return 'var(--color-status-warning)'
  if (status === 'Failed') return 'var(--color-status-error)'
  return 'var(--color-text-dim)'
}

function DeploymentExpandedDetail({ d }: { d: DeploymentDetail }) {
  const tabs = [
    {
      id: 'replicas',
      label: 'Replicas',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Ready', value: d.readyReplicas, total: d.replicas },
              { label: 'Updated', value: d.updatedReplicas, total: d.replicas },
              { label: 'Available', value: d.availableReplicas, total: d.replicas },
              { label: 'Unavailable', value: d.unavailableReplicas, total: null },
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
          {/* Visual replica breakdown */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
              Replica Status
            </p>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: d.replicas }).map((_, i) => {
                const isReady = i < d.readyReplicas
                return (
                  <div
                    key={i}
                    className={`h-5 w-5 rounded-sm ${isReady ? 'bg-emerald-500/80' : 'bg-red-500/60'}`}
                    title={isReady ? `Replica ${i + 1}: Ready` : `Replica ${i + 1}: Not Ready`}
                  />
                )
              })}
              {d.replicas === 0 && (
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  No replicas configured
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'strategy',
      label: 'Strategy',
      icon: <Settings className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[11px] font-mono">
            <span className="text-[var(--color-text-muted)]">Type</span>
            <span className="text-[var(--color-text-primary)] font-semibold">{d.strategyType}</span>
            {d.strategyType === 'RollingUpdate' && (
              <>
                <span className="text-[var(--color-text-muted)]">Max Surge</span>
                <span className="text-[var(--color-text-primary)]">{d.maxSurge ?? '25%'}</span>
                <span className="text-[var(--color-text-muted)]">Max Unavailable</span>
                <span className="text-[var(--color-text-primary)]">
                  {d.maxUnavailable ?? '25%'}
                </span>
              </>
            )}
          </div>
          {Object.keys(d.selector).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
                Selector Labels
              </p>
              <TagPills tags={d.selector} />
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content: <ConditionsList conditions={d.conditions} />,
    },
  ]

  return <DetailTabs id={`dep-${d.namespace}-${d.name}`} tabs={tabs} />
}

export default function DeploymentsPage() {
  usePageTitle('Cluster Deployments')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const deploymentsQuery = trpc.deployments.listDetail.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, refetchInterval: 30000 },
  )

  const allNamespaces = useMemo(() => {
    const ns = new Set<string>()
    for (const d of (deploymentsQuery.data ?? []) as DeploymentDetail[]) {
      if (d.namespace) ns.add(d.namespace)
    }
    return Array.from(ns).sort()
  }, [deploymentsQuery.data])

  const [nsFilter, setNsFilter] = useState<string>('all')

  const deployments = useMemo(() => {
    return ((deploymentsQuery.data ?? []) as DeploymentDetail[]).filter(
      (d) => nsFilter === 'all' || d.namespace === nsFilter,
    )
  }, [deploymentsQuery.data, nsFilter])

  if (dbCluster.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view deployments.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Namespace filter */}
      {allNamespaces.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-muted)]" htmlFor="ns-filter">
            Namespace:
          </label>
          <select
            id="ns-filter"
            value={nsFilter}
            onChange={(e) => setNsFilter(e.target.value)}
            className="text-xs font-mono rounded-lg px-2 py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            <option value="all">All namespaces</option>
            {allNamespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>
      )}

      {deploymentsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No deployments found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]/60 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Namespace</th>
                <th className="text-left px-3 py-2.5">Ready</th>
                <th className="text-left px-3 py-2.5">Image</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Age</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => {
                const readyStr = `${d.readyReplicas}/${d.replicas}`
                const allReady = d.readyReplicas === d.replicas && d.replicas > 0
                return (
                  <ExpandableTableRow
                    key={`${d.namespace}/${d.name}`}
                    columnCount={6}
                    cells={
                      <>
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-medium text-[var(--color-text-primary)]">
                            {d.name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-muted)]">
                          {d.namespace}
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
                            title={d.image}
                          >
                            {d.image}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{
                              color: statusColor(d.status),
                              background: `color-mix(in srgb, ${statusColor(d.status)} 15%, transparent)`,
                            }}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-text-dim)]">
                          {d.age}
                        </td>
                      </>
                    }
                    detail={<DeploymentExpandedDetail d={d} />}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
