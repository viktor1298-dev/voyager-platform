'use client'

import { Box, Puzzle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ExpandableCard } from '@/components/expandable'
import { CrdInstanceList } from './CrdInstanceList'
import { SearchFilterBar } from '@/components/resource'
import { SectionLoadingSkeleton } from '@/components/resource'
import { trpc } from '@/lib/trpc'

interface CrdSummaryData {
  name: string
  group: string
  version: string
  scope: 'Namespaced' | 'Cluster'
  plural: string
  kind: string
}

function ScopeBadge({ scope }: { scope: 'Namespaced' | 'Cluster' }) {
  const classes =
    scope === 'Namespaced'
      ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'

  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${classes}`}>{scope}</span>
  )
}

function CrdSummaryRow({ crd }: { crd: CrdSummaryData }) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <Puzzle className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-mono text-[var(--color-text-primary)] truncate block">
          {crd.plural}.{crd.group}
        </span>
      </div>
      <span className="text-[11px] font-mono text-[var(--color-text-muted)] shrink-0">
        {crd.kind}
      </span>
      <ScopeBadge scope={crd.scope} />
      <span className="text-[10px] font-mono text-[var(--color-text-dim)] shrink-0">
        {crd.version}
      </span>
    </div>
  )
}

interface CrdBrowserProps {
  clusterId: string
}

export function CrdBrowser({ clusterId }: CrdBrowserProps) {
  const crdsQuery = trpc.crds.list.useQuery({ clusterId }, { staleTime: 30_000 })

  const [searchQuery, setSearchQuery] = useState('')
  const [expandAll, setExpandAll] = useState(false)

  const crds = (crdsQuery.data ?? []) as CrdSummaryData[]

  const filteredCrds = useMemo(() => {
    if (!searchQuery.trim()) return crds
    const q = searchQuery.toLowerCase().trim()
    return crds.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        c.kind.toLowerCase().includes(q) ||
        c.plural.toLowerCase().includes(q),
    )
  }, [crds, searchQuery])

  return (
    <>
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={crds.length}
        filteredCount={filteredCrds.length}
        expandAll={expandAll}
        onExpandAllToggle={() => setExpandAll((prev) => !prev)}
        searchPlaceholder="Search CRDs by name, group, or kind..."
      />

      {crdsQuery.isLoading ? (
        <SectionLoadingSkeleton sections={2} />
      ) : filteredCrds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-white/[0.04] p-3 mb-3">
            <Box className="h-8 w-8 text-[var(--color-text-dim)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No CRDs Found</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            No custom resource definitions installed in this cluster.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredCrds.map((crd) => (
            <ExpandableCard
              key={crd.name}
              expanded={expandAll || undefined}
              summary={<CrdSummaryRow crd={crd} />}
            >
              <CrdInstanceList
                clusterId={clusterId}
                group={crd.group}
                version={crd.version}
                plural={crd.plural}
                scope={crd.scope}
              />
            </ExpandableCard>
          ))}
        </div>
      )}
    </>
  )
}
