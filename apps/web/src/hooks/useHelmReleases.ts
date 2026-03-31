import { useMemo } from 'react'
import { useClusterResources, useConnectionState } from './useResources'
import type { ConnectionState } from './useResources'
import { trpc } from '@/lib/trpc'

interface SecretData {
  name: string
  namespace: string
  type: string
  labels: Record<string, string>
  dataEntries: Array<{ key: string; value: string }>
  dataCount: number
  createdAt: string | null
  age: string
}

export interface HelmRelease {
  name: string
  namespace: string
  chartName: string
  chartVersion: string
  appVersion: string
  status: string
  revision: number
  updatedAt: string | null
}

export function useHelmReleases(clusterId: string): {
  releases: HelmRelease[]
  connectionState: ConnectionState
} {
  const secrets = useClusterResources<SecretData>(clusterId, 'secrets')
  const connectionState = useConnectionState(clusterId)

  const { data: trpcReleases } = trpc.helm.list.useQuery(
    { clusterId },
    {
      enabled: !!clusterId,
      staleTime: 60_000, // backend caches 30s; chart metadata changes infrequently
      refetchInterval: 60_000,
      refetchOnWindowFocus: false,
    },
  )

  const releases = useMemo(() => {
    // Filter for Helm release secrets
    const helmSecrets = secrets.filter(
      (s) => s.type === 'helm.sh/release.v1' && s.labels?.owner === 'helm',
    )

    // Group by release name+namespace, keep only latest revision
    const releaseMap = new Map<string, SecretData>()
    for (const s of helmSecrets) {
      const releaseName = s.labels?.name ?? s.name
      const key = `${s.namespace}/${releaseName}`
      const rev = parseInt(s.labels?.version ?? '0', 10)
      const existing = releaseMap.get(key)
      const existingRev = existing ? parseInt(existing.labels?.version ?? '0', 10) : -1
      if (rev > existingRev) releaseMap.set(key, s)
    }

    // Build tRPC lookup for decoded metadata (chartName, chartVersion, updatedAt)
    const trpcMap = new Map<string, NonNullable<typeof trpcReleases>[number]>()
    if (trpcReleases) {
      for (const r of trpcReleases) {
        trpcMap.set(`${r.namespace}/${r.name}`, r)
      }
    }

    // SSE-derived releases enriched with tRPC decoded metadata
    const merged: HelmRelease[] = [...releaseMap.values()].map((s) => {
      const name = s.labels?.name ?? s.name
      const ns = s.namespace
      const trpcData = trpcMap.get(`${ns}/${name}`)

      return {
        name,
        namespace: ns,
        status: s.labels?.status ?? 'unknown',
        revision: parseInt(s.labels?.version ?? '0', 10),
        chartName: trpcData?.chartName ?? '',
        chartVersion: trpcData?.chartVersion ?? '',
        appVersion: trpcData?.appVersion ?? '',
        updatedAt: trpcData?.updatedAt ?? s.createdAt,
      }
    })

    // Union: add tRPC-only releases not in SSE (rare, during watch reconnect)
    if (trpcReleases) {
      const sseKeys = new Set(merged.map((r) => `${r.namespace}/${r.name}`))
      for (const r of trpcReleases) {
        if (!sseKeys.has(`${r.namespace}/${r.name}`)) {
          merged.push({
            name: r.name,
            namespace: r.namespace,
            status: r.status,
            revision: r.revision,
            chartName: r.chartName,
            chartVersion: r.chartVersion,
            appVersion: r.appVersion,
            updatedAt: r.updatedAt,
          })
        }
      }
    }

    return merged
  }, [secrets, trpcReleases])

  return { releases, connectionState }
}
