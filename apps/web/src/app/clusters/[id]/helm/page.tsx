'use client'

import { Package } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { HelmReleaseDetail } from '@/components/helm/HelmReleaseDetail'
import { ResourcePageScaffold } from '@/components/resource'
import { useHelmReleases, type HelmRelease } from '@/hooks/useHelmReleases'
import { useSnapshotsReady } from '@/hooks/useResources'
import { usePageTitle } from '@/hooks/usePageTitle'
import { timeAgo } from '@/lib/time-utils'

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
    default:
      colorClasses = 'bg-[var(--color-text-dim)]/15 text-[var(--color-text-muted)]'
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${colorClasses}`}>{status}</span>
  )
}

function ReleaseSummary({ release }: { release: HelmRelease }) {
  return (
    <div className="flex items-center gap-3 w-full min-w-0">
      <Package className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
      <span className="text-[14px] font-semibold text-[var(--color-text-primary)] truncate">
        {release.name}
      </span>
      {release.chartName && (
        <span className="text-[12px] font-mono text-[var(--color-text-muted)] truncate">
          {release.chartName}
          {release.chartVersion ? `-${release.chartVersion}` : ''}
        </span>
      )}
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

function ReleaseDetail({ release, clusterId }: { release: HelmRelease; clusterId: string }) {
  return (
    <HelmReleaseDetail
      clusterId={clusterId}
      releaseName={release.name}
      namespace={release.namespace}
    />
  )
}

export default function HelmReleasesPage() {
  usePageTitle('Helm Releases')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const { releases, connectionState } = useHelmReleases(clusterId)
  const snapshotsReady = useSnapshotsReady(clusterId)
  const isLoading = !snapshotsReady && releases.length === 0

  return (
    <ResourcePageScaffold<HelmRelease>
      title="Helm Releases"
      icon={<Package className="h-5 w-5" />}
      queryResult={{
        data: releases,
        isLoading,
        error: connectionState === 'disconnected' && releases.length === 0 ? 'Disconnected' : null,
      }}
      getNamespace={(r) => r.namespace}
      getKey={(r) => `${r.namespace}/${r.name}`}
      filterFn={(r, q) =>
        r.name.toLowerCase().includes(q) ||
        r.namespace.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      }
      renderSummary={(r) => <ReleaseSummary release={r} />}
      renderDetail={(r) => <ReleaseDetail release={r} clusterId={clusterId} />}
      emptyMessage="No Helm Releases"
      emptyDescription="No Helm releases found in this cluster. Deploy a Helm chart to see releases here."
      searchPlaceholder="Search releases by name or status..."
    />
  )
}
