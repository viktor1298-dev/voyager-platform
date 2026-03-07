'use client'

import { useParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'

function MetricCard({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 flex flex-col gap-1">
      <span className="text-[11px] text-[var(--color-text-muted)]">{label}</span>
      <span className="text-2xl font-extrabold text-[var(--color-text-primary)] tabular-nums">
        {value}
        {unit && <span className="text-sm font-normal text-[var(--color-text-muted)] ml-1">{unit}</span>}
      </span>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-bold text-[var(--color-text-primary)] mb-3">{children}</h2>
  )
}

export default function AutoscalingPage() {
  const { id } = useParams<{ id: string }>()

  const dbCluster = trpc.clusters.get.useQuery({ id })
  const resolvedId = dbCluster.data?.id ?? id
  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)

  const nodePoolsQuery = trpc.karpenter.listNodePools.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, retry: false },
  )

  const ec2ClassesQuery = trpc.karpenter.listEC2NodeClasses.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, retry: false },
  )

  const metricsQuery = trpc.karpenter.getMetrics.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, retry: false, refetchInterval: 30000 },
  )

  if (dbCluster.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view autoscaling configuration.
        </p>
      </div>
    )
  }

  // Karpenter not configured
  const noKarpenter =
    !nodePoolsQuery.isLoading &&
    !ec2ClassesQuery.isLoading &&
    (nodePoolsQuery.isError || (nodePoolsQuery.data?.length ?? 0) === 0) &&
    (ec2ClassesQuery.isError || (ec2ClassesQuery.data?.length ?? 0) === 0)

  if (noKarpenter) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">No autoscaling configured</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Karpenter is not installed or has no NodePools configured for this cluster.
        </p>
      </div>
    )
  }

  const metrics = metricsQuery.data

  return (
    <div className="space-y-6">
      {/* Metrics Summary */}
      {metrics && (
        <section>
          <SectionHeading>Metrics</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard label="Nodes Provisioned" value={metrics.nodesProvisioned} />
            <MetricCard label="Pending Pods" value={metrics.pendingPods} />
            <MetricCard label="Est. Hourly Cost" value={`$${metrics.estimatedHourlyCostUsd.toFixed(3)}`} />
          </div>
        </section>
      )}

      {/* NodePools */}
      <section>
        <SectionHeading>NodePools</SectionHeading>
        {nodePoolsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (nodePoolsQuery.data?.length ?? 0) === 0 ? (
          <p className="text-[12px] text-[var(--color-text-muted)]">No NodePools found.</p>
        ) : (
          <div className="space-y-2">
            {(nodePoolsQuery.data ?? []).map((pool) => {
              const ready = pool.status.conditions.find((c) => c.type === 'Ready')
              const isReady = ready?.status === 'True'
              return (
                <div
                  key={pool.name}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: isReady ? 'var(--color-status-active)' : 'var(--color-status-warning)' }}
                      />
                      <span className="font-mono text-[13px] font-bold text-[var(--color-text-primary)]">
                        {pool.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--color-text-muted)]">
                      <span>{pool.status.nodes} nodes</span>
                      {pool.nodeClassRef?.name && (
                        <span className="text-[var(--color-text-dim)]">→ {pool.nodeClassRef.name}</span>
                      )}
                    </div>
                  </div>

                  {/* Limits */}
                  {Object.keys(pool.limits).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(pool.limits).map(([k, v]) => (
                        <span
                          key={k}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
                        >
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Disruption policy */}
                  {pool.disruption?.consolidationPolicy && (
                    <p className="text-[11px] text-[var(--color-text-dim)] mt-2 font-mono">
                      Consolidation: {pool.disruption.consolidationPolicy}
                      {pool.disruption.consolidateAfter ? ` after ${pool.disruption.consolidateAfter}` : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* EC2NodeClasses */}
      <section>
        <SectionHeading>EC2 Node Classes</SectionHeading>
        {ec2ClassesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (ec2ClassesQuery.data?.length ?? 0) === 0 ? (
          <p className="text-[12px] text-[var(--color-text-muted)]">No EC2 Node Classes found.</p>
        ) : (
          <div className="space-y-2">
            {(ec2ClassesQuery.data ?? []).map((cls) => (
              <div
                key={cls.name}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="font-mono text-[13px] font-bold text-[var(--color-text-primary)]">
                    {cls.name}
                  </span>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--color-text-muted)]">
                    {cls.amiFamily && <span>{cls.amiFamily}</span>}
                    {cls.role && <span className="text-[var(--color-text-dim)]">role: {cls.role}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-mono text-[var(--color-text-dim)]">
                  {cls.status.amis.length > 0 && <span>{cls.status.amis.length} AMI(s)</span>}
                  {cls.status.subnets.length > 0 && <span>{cls.status.subnets.length} subnet(s)</span>}
                  {cls.status.securityGroups.length > 0 && (
                    <span>{cls.status.securityGroups.length} security group(s)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
