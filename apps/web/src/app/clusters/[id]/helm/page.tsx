'use client'

import { Box, Package } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { ExpandableCard } from '@/components/expandable'
import { HelmReleaseDetail } from '@/components/helm/HelmReleaseDetail'
import { SearchFilterBar } from '@/components/resource'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageTitle } from '@/hooks/usePageTitle'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'

interface HelmReleaseSummary {
  name: string
  namespace: string
  chartName: string
  chartVersion: string
  appVersion: string
  status: string
  revision: number
  updatedAt: string | null
}

function statusBadge(status: string) {
  let colorClasses: string
  switch (status.toLowerCase()) {
    case 'deployed':
      colorClasses = 'bg-emerald-500/15 text-emerald-400'
      break
    case 'failed':
      colorClasses = 'bg-red-500/15 text-red-400'
      break
    case 'pending-install':
    case 'pending-upgrade':
    case 'pending-rollback':
      colorClasses = 'bg-amber-500/15 text-amber-400'
      break
    case 'superseded':
      colorClasses = 'bg-[var(--color-text-dim)]/15 text-[var(--color-text-muted)]'
      break
    default:
      colorClasses = 'bg-[var(--color-text-dim)]/15 text-[var(--color-text-muted)]'
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${colorClasses}`}>{status}</span>
  )
}

function ReleaseSummary({ release }: { release: HelmReleaseSummary }) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <Package className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <span className="text-[14px] font-semibold text-[var(--color-text-primary)] truncate">
        {release.name}
      </span>
      <span className="text-[12px] font-mono text-[var(--color-text-muted)] truncate">
        {release.chartName}
        {release.chartVersion ? `-${release.chartVersion}` : ''}
      </span>
      {statusBadge(release.status)}
      <span className="text-[11px] font-mono text-[var(--color-text-dim)] shrink-0">
        rev {release.revision}
      </span>
      <span className="text-[11px] text-[var(--color-text-dim)] font-mono shrink-0 ml-auto">
        {release.updatedAt ? timeAgo(release.updatedAt) : '—'}
      </span>
    </div>
  )
}

export default function HelmReleasesPage() {
  usePageTitle('Helm Releases')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const helmQuery = trpc.helm.list.useQuery(
    { clusterId: resolvedId },
    { staleTime: 30_000, refetchInterval: 30_000 },
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [expandAll, setExpandAll] = useState(false)

  const releases = (helmQuery.data ?? []) as HelmReleaseSummary[]

  const filteredReleases = useMemo(() => {
    if (!searchQuery.trim()) return releases
    const q = searchQuery.toLowerCase().trim()
    return releases.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.namespace.toLowerCase().includes(q) ||
        r.chartName.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    )
  }, [releases, searchQuery])

  return (
    <>
      <h1 className="sr-only">Helm Releases</h1>

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={releases.length}
        filteredCount={filteredReleases.length}
        expandAll={expandAll}
        onExpandAllToggle={() => setExpandAll((prev) => !prev)}
        searchPlaceholder="Search releases by name, chart, or status..."
      />

      {helmQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-white/[0.04] p-3 mb-3">
            <Box className="h-8 w-8 text-[var(--color-text-dim)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">No Helm Releases</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            No Helm releases found in this cluster. Deploy a Helm chart to see releases here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredReleases.map((release) => (
            <ExpandableCard
              key={`${release.namespace}/${release.name}`}
              expanded={expandAll || undefined}
              summary={<ReleaseSummary release={release} />}
            >
              <HelmReleaseDetail
                clusterId={resolvedId}
                releaseName={release.name}
                namespace={release.namespace}
              />
            </ExpandableCard>
          ))}
        </div>
      )}
    </>
  )
}
