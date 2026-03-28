'use client'

import { BarChart3, CircleCheck, Rocket, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, TagPills } from '@/components/expandable'
import { ResourcePageScaffold } from '@/components/resource'
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

function DeploymentSummary({ d }: { d: DeploymentDetail }) {
  const allReady = d.readyReplicas === d.replicas && d.replicas > 0
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <span className="flex-1 min-w-0 text-[13px] font-mono font-medium text-[var(--color-text-primary)] truncate">
        {d.name}
      </span>
      <span
        className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
        style={{
          color: allReady ? 'var(--color-status-active)' : 'var(--color-status-warning)',
          background: `color-mix(in srgb, ${allReady ? 'var(--color-status-active)' : 'var(--color-status-warning)'} 12%, transparent)`,
        }}
      >
        {d.readyReplicas}/{d.replicas}
      </span>
      <span
        className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{
          color: statusColor(d.status),
          background: `color-mix(in srgb, ${statusColor(d.status)} 15%, transparent)`,
        }}
      >
        {d.status}
      </span>
      <span
        className="text-xs font-mono text-[var(--color-text-muted)] max-w-[180px] truncate shrink-0"
        title={d.image}
      >
        {d.image}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">{d.age}</span>
    </div>
  )
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
  usePageTitle('Deployments')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.deployments.listDetail.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, refetchInterval: 30000 },
  )

  return (
    <ResourcePageScaffold<DeploymentDetail>
      title="Deployments"
      icon={<Rocket className="h-5 w-5" />}
      queryResult={query}
      getNamespace={(d) => d.namespace}
      getKey={(d) => `${d.namespace}/${d.name}`}
      filterFn={(d, q) =>
        d.name.toLowerCase().includes(q) ||
        d.namespace.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q)
      }
      renderSummary={(d) => <DeploymentSummary d={d} />}
      renderDetail={(d) => <DeploymentExpandedDetail d={d} />}
      searchPlaceholder="Search deployments..."
      emptyMessage="No deployments found"
    />
  )
}
