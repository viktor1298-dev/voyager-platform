'use client'

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
}

export default function NetworkPoliciesPage() {
  usePageTitle('Network Policies')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

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
  )
}
