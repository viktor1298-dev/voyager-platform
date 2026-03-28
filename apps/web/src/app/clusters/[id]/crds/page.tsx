'use client'

import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { CrdBrowser } from '@/components/crds/CrdBrowser'
import { usePageTitle } from '@/hooks/usePageTitle'
import { trpc } from '@/lib/trpc'

export default function CrdsPage() {
  usePageTitle('Custom Resources')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  return (
    <>
      <h1 className="sr-only">Custom Resource Definitions</h1>
      <CrdBrowser clusterId={resolvedId} />
    </>
  )
}
