'use client'

import { CircleCheck, Target, TrendingUp } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ConditionsList, DetailTabs, ResourceBar } from '@/components/expandable'
import { ResourcePageScaffold } from '@/components/resource'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface HPAMetric {
  type: string
  name: string
  targetType: string
  targetValue: string | number
  currentValue: string | number | null
}

interface HPAData {
  name: string
  namespace: string
  reference: string
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
  desiredReplicas: number
  age: string
  metrics: HPAMetric[]
  conditions: {
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }[]
  scaleUpPolicies: { type: string; value: number; periodSeconds: number }[]
  scaleDownPolicies: { type: string; value: number; periodSeconds: number }[]
}

function HPASummary({ hpa }: { hpa: HPAData }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-mono font-semibold text-[13px] text-[var(--color-text-primary)] truncate">
        {hpa.name}
      </span>
      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-accent)] shrink-0">
        {hpa.reference}
      </span>
      <span className="text-[11px] font-mono text-[var(--color-text-secondary)] shrink-0">
        {hpa.minReplicas}/{hpa.maxReplicas}
      </span>
      <span className="text-[11px] font-mono font-bold text-[var(--color-text-primary)] shrink-0">
        {hpa.currentReplicas} replicas
      </span>
      {hpa.metrics.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {hpa.metrics.slice(0, 2).map((m, i) => (
            <span
              key={i}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-text-muted)]"
            >
              {m.name}: {m.currentValue ?? '---'}/{String(m.targetValue)}
              {m.targetType === 'Utilization' ? '%' : ''}
            </span>
          ))}
        </div>
      )}
      <span className="ml-auto text-[11px] font-mono text-[var(--color-text-dim)] shrink-0">
        {hpa.age}
      </span>
    </div>
  )
}

function HPAExpandedDetail({ hpa }: { hpa: HPAData }) {
  const tabs = [
    {
      id: 'targets',
      label: 'Targets',
      icon: <Target className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          {hpa.metrics.map((m, i) => {
            const current = typeof m.currentValue === 'number' ? m.currentValue : 0
            const target = typeof m.targetValue === 'number' ? m.targetValue : 0
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono font-bold text-[var(--color-text-primary)]">
                    {m.name}
                  </span>
                  <span className="text-[var(--color-text-muted)]">({m.type})</span>
                </div>
                {target > 0 ? (
                  <ResourceBar
                    label={`${m.targetType}: ${m.targetValue}${m.targetType === 'Utilization' ? '%' : ''}`}
                    used={current}
                    total={target}
                    unit={m.targetType === 'Utilization' ? '%' : ''}
                  />
                ) : (
                  <div className="text-[11px] font-mono text-[var(--color-text-muted)]">
                    Target: {String(m.targetValue)} | Current: {m.currentValue ?? '---'}
                  </div>
                )}
              </div>
            )
          })}
          {hpa.metrics.length === 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">No metrics configured.</p>
          )}
        </div>
      ),
    },
    {
      id: 'scaling',
      label: 'Scaling',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Current', value: hpa.currentReplicas },
              { label: 'Desired', value: hpa.desiredReplicas },
              { label: 'Min', value: hpa.minReplicas },
              { label: 'Max', value: hpa.maxReplicas },
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
          {(hpa.scaleUpPolicies.length > 0 || hpa.scaleDownPolicies.length > 0) && (
            <div className="space-y-2">
              {hpa.scaleUpPolicies.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                    Scale Up Policies
                  </p>
                  {hpa.scaleUpPolicies.map((p, i) => (
                    <div
                      key={i}
                      className="text-[11px] font-mono text-[var(--color-text-secondary)]"
                    >
                      {p.type}: {p.value} over {p.periodSeconds}s
                    </div>
                  ))}
                </div>
              )}
              {hpa.scaleDownPolicies.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                    Scale Down Policies
                  </p>
                  {hpa.scaleDownPolicies.map((p, i) => (
                    <div
                      key={i}
                      className="text-[11px] font-mono text-[var(--color-text-secondary)]"
                    >
                      {p.type}: {p.value} over {p.periodSeconds}s
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'conditions',
      label: 'Conditions',
      icon: <CircleCheck className="h-3.5 w-3.5" />,
      content:
        hpa.conditions.length > 0 ? (
          <ConditionsList conditions={hpa.conditions} />
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">No conditions reported.</p>
        ),
    },
  ]

  return <DetailTabs id={`hpa-${hpa.namespace}-${hpa.name}`} tabs={tabs} />
}

export default function HPAPage() {
  usePageTitle('HPA')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const query = trpc.hpa.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, refetchInterval: 30000 },
  )

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
      </div>
    )
  }

  return (
    <ResourcePageScaffold<HPAData>
      title="HPAs"
      icon={<TrendingUp className="h-5 w-5 text-[var(--color-text-muted)]" />}
      queryResult={query}
      getNamespace={(hpa) => hpa.namespace}
      getKey={(hpa) => `${hpa.namespace}/${hpa.name}`}
      filterFn={(hpa, q) =>
        hpa.name.toLowerCase().includes(q) ||
        hpa.namespace.toLowerCase().includes(q) ||
        hpa.reference.toLowerCase().includes(q)
      }
      renderSummary={(hpa) => <HPASummary hpa={hpa} />}
      renderDetail={(hpa) => <HPAExpandedDetail hpa={hpa} />}
      searchPlaceholder="Search HPAs..."
    />
  )
}
