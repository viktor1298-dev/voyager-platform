import { useMemo } from 'react'
import { useClusterResources, useConnectionState } from './useResources'
import type { ConnectionState } from './useResources'

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

    return [...releaseMap.values()].map((s) => ({
      name: s.labels?.name ?? s.name,
      namespace: s.namespace,
      status: s.labels?.status ?? 'unknown',
      revision: parseInt(s.labels?.version ?? '0', 10),
      // Chart details are not in labels -- these require server-side decode
      // They will be empty in the list view; HelmReleaseDetail fetches via tRPC
      chartName: '',
      chartVersion: '',
      appVersion: '',
      updatedAt: s.createdAt,
    }))
  }, [secrets])

  return { releases, connectionState }
}
