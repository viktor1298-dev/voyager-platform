'use client'

import { ChevronDown, Gauge } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { SearchFilterBar } from '@/components/resource'
import { ResourceQuotaCard } from '@/components/quotas/ResourceQuotaCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useClusterResources, useConnectionState } from '@/hooks/useResources'
import { usePageTitle } from '@/hooks/usePageTitle'

interface ResourceQuotaData {
  name: string
  namespace: string
  hard: Record<string, string>
  used: Record<string, string>
  createdAt: string | null
  labels: Record<string, string>
}

function NamespaceQuotaGroup({
  namespace,
  quotas,
  namespacesOpen,
}: {
  namespace: string
  quotas: ResourceQuotaData[]
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
          {quotas.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-2 pl-2">
          {quotas.map((quota) => (
            <ResourceQuotaCard
              key={`${quota.namespace}/${quota.name}`}
              quotaName={quota.name}
              hard={quota.hard}
              used={quota.used}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function ResourceQuotasPage() {
  usePageTitle('Resource Quotas')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const quotas = useClusterResources<ResourceQuotaData>(clusterId, 'resource-quotas')
  const connectionState = useConnectionState(clusterId)

  const [searchQuery, setSearchQuery] = useState('')
  const [namespacesOpen, setNamespacesOpen] = useState(true)
  const [expandAll, setExpandAll] = useState(false)

  const filteredQuotas = useMemo(() => {
    if (!searchQuery.trim()) return quotas
    const q = searchQuery.toLowerCase().trim()
    return quotas.filter(
      (rq) => rq.name.toLowerCase().includes(q) || rq.namespace.toLowerCase().includes(q),
    )
  }, [quotas, searchQuery])

  const grouped = useMemo(() => {
    const map = new Map<string, ResourceQuotaData[]>()
    for (const quota of filteredQuotas) {
      const ns = quota.namespace || 'default'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)?.push(quota)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredQuotas])

  const isLoading = connectionState === 'initializing' && quotas.length === 0

  if (connectionState === 'disconnected' && quotas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <Gauge className="h-8 w-8 text-[var(--color-text-dim)]" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
          Connect cluster credentials to view resource quotas.
        </p>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">Resource Quotas</h1>

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={quotas.length}
        filteredCount={filteredQuotas.length}
        expandAll={expandAll}
        onExpandAllToggle={() => setExpandAll((prev) => !prev)}
        searchPlaceholder="Search quotas..."
        namespacesOpen={namespacesOpen}
        onNamespacesToggle={() => setNamespacesOpen((prev) => !prev)}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredQuotas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-white/[0.04] p-3 mb-3">
            <Gauge className="h-8 w-8 text-[var(--color-text-dim)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No Resource Quotas</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            No resource quotas found. Namespaces are not resource-constrained.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(([namespace, nsQuotas]) => (
            <NamespaceQuotaGroup
              key={namespace}
              namespace={namespace}
              quotas={nsQuotas}
              namespacesOpen={namespacesOpen}
            />
          ))}
        </div>
      )}
    </>
  )
}
