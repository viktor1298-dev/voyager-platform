'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { useClusterContext } from '@/stores/cluster-context'
import { useDashboardRefreshInterval } from '@/components/dashboard/DashboardRefreshContext'

export function DeploymentListWidget() {
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const intervalMs = useDashboardRefreshInterval()
  const deploymentsQuery = trpc.deployments.list.useQuery(
    { clusterId: activeClusterId ?? '' },
    { enabled: Boolean(activeClusterId), refetchInterval: Math.min(30000, intervalMs) },
  )
  const deployments = deploymentsQuery.data ?? []

  return (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] pl-2">Deployments</h3>
        <Link href="/deployments" className="text-xs text-[var(--color-accent)] hover:underline">View all →</Link>
      </div>
      <div className="flex-1 overflow-auto space-y-1.5">
        {!activeClusterId && <p className="text-xs text-[var(--color-text-dim)]">No cluster selected</p>}
        {deployments.length === 0 && activeClusterId && (
          <p className="text-xs text-[var(--color-text-dim)]">No deployments found</p>
        )}
        {deployments.slice(0, 8).map((d, idx) => {
          const ready = d.ready
          const desired = d.replicas ?? 0
          const isReady = ready === desired && desired > 0
          return (
            <div key={`${d.name}-${idx}`} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[var(--color-border)]/40">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isReady ? 'bg-[var(--color-status-active)]' : 'bg-[var(--color-status-warning)]'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{d.name}</p>
                <p className="text-xs text-[var(--color-text-dim)] font-mono">{d.namespace} · {ready}/{desired}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
