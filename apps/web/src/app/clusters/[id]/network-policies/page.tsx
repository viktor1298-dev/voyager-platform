'use client'

<<<<<<< HEAD
import { ChevronDown, Network, Shield } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ExpandableCard } from '@/components/expandable'
import { SearchFilterBar } from '@/components/resource'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { usePageTitle } from '@/hooks/usePageTitle'
import { trpc } from '@/lib/trpc'

interface PeerData {
  podSelector: Record<string, string> | null
  namespaceSelector: Record<string, string> | null
  ipBlock: { cidr: string; except?: string[] } | null
}

interface PortData {
  port: string | number
  protocol: string
}

interface NetworkPolicyData {
  name: string
  namespace: string
  podSelector: Record<string, string>
  policyTypes: string[]
  ingressRules: { from: PeerData[]; ports: PortData[] }[]
  egressRules: { to: PeerData[]; ports: PortData[] }[]
  createdAt: string | null
  labels: Record<string, string>
}

function PeerDisplay({ peer, direction }: { peer: PeerData; direction: 'from' | 'to' }) {
  if (peer.ipBlock) {
    return (
      <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">
        IP: {peer.ipBlock.cidr}
        {peer.ipBlock.except && peer.ipBlock.except.length > 0
          ? ` (except ${peer.ipBlock.except.join(', ')})`
          : ''}
      </span>
    )
  }
  const parts: string[] = []
  if (peer.podSelector) {
    parts.push(
      `pods: ${Object.entries(peer.podSelector)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    )
  }
  if (peer.namespaceSelector) {
    parts.push(
      `ns: ${Object.entries(peer.namespaceSelector)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    )
  }
  if (parts.length === 0) {
    return (
      <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
        {direction === 'from' ? 'All sources' : 'All destinations'}
      </span>
    )
  }
  return (
    <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">
      {parts.join(' | ')}
    </span>
  )
}

function PolicyDetail({ policy }: { policy: NetworkPolicyData }) {
  return (
    <div className="p-4 space-y-4">
      {/* Pod Selector */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
          Pod Selector
        </p>
        {Object.keys(policy.podSelector).length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {Object.entries(policy.podSelector).map(([k, v]) => (
              <span
                key={k}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
              >
                {k}={v}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-[var(--color-text-muted)]">All pods in namespace</span>
        )}
      </div>

      {/* Ingress Rules */}
      {policy.policyTypes.includes('Ingress') && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
            Ingress Rules ({policy.ingressRules.length})
          </p>
          {policy.ingressRules.length === 0 ? (
            <p className="text-[11px] text-[var(--color-status-error)]">
              All ingress traffic denied
            </p>
          ) : (
            <div className="space-y-2">
              {policy.ingressRules.map((rule, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] p-2.5 space-y-1.5"
                >
                  {rule.from.length > 0 ? (
                    rule.from.map((peer, j) => (
                      <div key={j} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-emerald-500 font-bold shrink-0">
                          ALLOW
                        </span>
                        <PeerDisplay peer={peer} direction="from" />
                      </div>
                    ))
                  ) : (
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      Allow from all sources
                    </span>
                  )}
                  {rule.ports.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {rule.ports.map((p, k) => (
                        <span
                          key={k}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-text-secondary)]"
                        >
                          {p.port}/{p.protocol}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Egress Rules */}
      {policy.policyTypes.includes('Egress') && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
            Egress Rules ({policy.egressRules.length})
          </p>
          {policy.egressRules.length === 0 ? (
            <p className="text-[11px] text-[var(--color-status-error)]">
              All egress traffic denied
            </p>
          ) : (
            <div className="space-y-2">
              {policy.egressRules.map((rule, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] p-2.5 space-y-1.5"
                >
                  {rule.to.length > 0 ? (
                    rule.to.map((peer, j) => (
                      <div key={j} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-blue-500 font-bold shrink-0">ALLOW</span>
                        <PeerDisplay peer={peer} direction="to" />
                      </div>
                    ))
                  ) : (
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      Allow to all destinations
                    </span>
                  )}
                  {rule.ports.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {rule.ports.map((p, k) => (
                        <span
                          key={k}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--color-text-secondary)]"
                        >
                          {p.port}/{p.protocol}
                        </span>
                      ))}
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

function PolicySummary({ policy }: { policy: NetworkPolicyData }) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <Network className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] font-mono text-[var(--color-text-primary)] truncate">
        {policy.name}
      </span>
      <span className="text-xs text-[var(--color-text-dim)] font-mono shrink-0">
        {policy.namespace}
      </span>
      {policy.policyTypes.map((t) => (
        <span
          key={t}
          className={[
            'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0',
            t === 'Ingress'
              ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'
              : 'bg-blue-500/10 text-blue-500 dark:text-blue-400',
          ].join(' ')}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

function NamespacePolicyGroup({
  namespace,
  policies,
  expandAll,
  namespacesOpen,
}: {
  namespace: string
  policies: NetworkPolicyData[]
  expandAll: boolean
  namespacesOpen: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(true)
  const open = namespacesOpen ? internalOpen : false
  const setOpen = (v: boolean) => {
    if (namespacesOpen) setInternalOpen(v)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--color-text-dim)] transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="text-xs font-bold font-mono text-[var(--color-text-secondary)]">
          {namespace}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold">
          {policies.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 pl-2">
          {policies.map((policy) => (
            <ExpandableCard
              key={`${policy.namespace}/${policy.name}`}
              expanded={expandAll || undefined}
              summary={<PolicySummary policy={policy} />}
            >
              <PolicyDetail policy={policy} />
            </ExpandableCard>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
=======
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
>>>>>>> worktree-agent-ac39d609
}

export default function NetworkPoliciesPage() {
  usePageTitle('Network Policies')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)
<<<<<<< HEAD

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )

  const policiesQuery = trpc.networkPolicies.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials, staleTime: 30_000 },
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [expandAll, setExpandAll] = useState(false)
  const [namespacesOpen, setNamespacesOpen] = useState(true)

  const policies = (policiesQuery.data ?? []) as NetworkPolicyData[]

  const filteredPolicies = useMemo(() => {
    if (!searchQuery.trim()) return policies
    const q = searchQuery.toLowerCase().trim()
    return policies.filter(
      (p) => p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q),
    )
  }, [policies, searchQuery])

  const grouped = useMemo(() => {
    const map = new Map<string, NetworkPolicyData[]>()
    for (const policy of filteredPolicies) {
      const ns = policy.namespace || 'default'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)?.push(policy)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredPolicies])

  if (!hasCredentials && !policiesQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <Shield className="h-8 w-8 text-[var(--color-text-dim)]" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
          Connect cluster credentials to view network policies.
        </p>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">Network Policies</h1>

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={policies.length}
        filteredCount={filteredPolicies.length}
        expandAll={expandAll}
        onExpandAllToggle={() => setExpandAll((prev) => !prev)}
        searchPlaceholder="Search policies..."
        namespacesOpen={namespacesOpen}
        onNamespacesToggle={() => setNamespacesOpen((prev) => !prev)}
      />

      {policiesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filteredPolicies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-white/[0.04] p-3 mb-3">
            <Network className="h-8 w-8 text-[var(--color-text-dim)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No Network Policies</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            No network policies found. All traffic is allowed by default.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(([namespace, nsPolicies]) => (
            <NamespacePolicyGroup
              key={namespace}
              namespace={namespace}
              policies={nsPolicies}
              expandAll={expandAll}
              namespacesOpen={namespacesOpen}
            />
          ))}
        </div>
      )}
    </>
=======
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
>>>>>>> worktree-agent-ac39d609
  )
}
