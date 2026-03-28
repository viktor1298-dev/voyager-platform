'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { LayoutGrid, Network } from 'lucide-react'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { NetworkPolicyGraph } from '@/components/network/NetworkPolicyGraph'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'
import { timeAgo } from '@/lib/time-utils'

type ViewMode = 'list' | 'graph'

interface PolicyItem {
  name: string
  namespace: string
  createdAt: string | null
  podSelector: Record<string, string>
  policyTypes: string[]
  ingressRules: Array<{
    from: Array<{
      podSelector: Record<string, string> | null
      namespaceSelector: Record<string, string> | null
      ipBlock: { cidr: string; except: string[] } | null
    }>
    ports: Array<{ protocol: string; port: string | null }>
  }>
  egressRules: Array<{
    to: Array<{
      podSelector: Record<string, string> | null
      namespaceSelector: Record<string, string> | null
      ipBlock: { cidr: string; except: string[] } | null
    }>
    ports: Array<{ protocol: string; port: string | null }>
  }>
  labels: Record<string, string>
}

function selectorLabel(sel: Record<string, string>): string {
  const entries = Object.entries(sel)
  if (entries.length === 0) return 'All Pods'
  return entries.map(([k, v]) => `${k}=${v}`).join(', ')
}

export default function NetworkPoliciesPage() {
  usePageTitle('Network Policies')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const policiesQuery = trpc.networkPolicies.list.useQuery(
    { clusterId },
    { staleTime: 15000, refetchInterval: 30000 },
  )

  const policies = (policiesQuery.data ?? []) as PolicyItem[]

  return (
    <div>
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Network Policies</h2>
        <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'list'
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('graph')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'graph'
                ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            Graph
          </button>
        </div>
      </div>

      {viewMode === 'graph' ? (
        <NetworkPolicyGraph clusterId={clusterId} />
      ) : (
        <div>
          {policiesQuery.isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="h-24 rounded-lg bg-[var(--color-bg-card-hover)] animate-pulse"
                />
              ))}
            </div>
          )}

          {policiesQuery.isError && (
            <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
              Failed to load network policies.
            </div>
          )}

          {!policiesQuery.isLoading && policies.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Network className="h-8 w-8 text-[var(--color-text-dim)] mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-muted)]">
                No network policies found
              </p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                All traffic is allowed by default.
              </p>
            </div>
          )}

          {policies.length > 0 && (
            <div className="space-y-3">
              {policies.map((policy) => (
                <div
                  key={`${policy.namespace}/${policy.name}`}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {policy.name}
                      </h3>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {policy.namespace}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {policy.policyTypes.map((pt) => (
                        <span
                          key={pt}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        >
                          {pt}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-dim)] mb-3">
                    <span>
                      Target: <span className="font-mono">{selectorLabel(policy.podSelector)}</span>
                    </span>
                    {policy.createdAt && (
                      <span className="ml-auto font-mono">{timeAgo(policy.createdAt)}</span>
                    )}
                  </div>

                  {/* Ingress rules summary */}
                  {policy.ingressRules.length > 0 && (
                    <div className="mb-2">
                      <span className="text-[10px] font-mono uppercase text-[var(--color-status-active)]">
                        Ingress ({policy.ingressRules.length} rules)
                      </span>
                    </div>
                  )}

                  {/* Egress rules summary */}
                  {policy.egressRules.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[var(--color-accent)]">
                        Egress ({policy.egressRules.length} rules)
                      </span>
                    </div>
                  )}

                  {/* Deny-all indicators */}
                  {policy.policyTypes.includes('Ingress') && policy.ingressRules.length === 0 && (
                    <div className="mt-1">
                      <span className="text-[10px] font-mono text-[var(--color-status-error)]">
                        Deny All Ingress
                      </span>
                    </div>
                  )}
                  {policy.policyTypes.includes('Egress') && policy.egressRules.length === 0 && (
                    <div className="mt-1">
                      <span className="text-[10px] font-mono text-[var(--color-status-error)]">
                        Deny All Egress
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
