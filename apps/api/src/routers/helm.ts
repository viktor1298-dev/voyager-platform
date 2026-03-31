import * as k8s from '@kubernetes/client-node'
import { gunzipSync } from 'node:zlib'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

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

interface HelmReleaseDetail {
  name: string
  namespace: string
  chartName: string
  chartVersion: string
  appVersion: string
  status: string
  revision: number
  firstDeployed: string | null
  lastDeployed: string | null
  values: Record<string, unknown>
  notes: string
  manifest: string
}

interface HelmRevision {
  revision: number
  status: string
  updatedAt: string | null
  description: string
}

/**
 * Decode a Helm release from its K8s secret storage.
 * Helm stores releases as: base64(gzip(json)) in the secret's `release` data field.
 */
function decodeHelmRelease(releaseData: string): Record<string, unknown> {
  // Helm v3 stores releases as: base64(gzip(json)) in the secret's .data.release field.
  // The @kubernetes/client-node returns .data values as base64 strings.
  // So the full chain is: base64-decode → base64-decode (Helm's own encoding) → gunzip → JSON.parse
  //
  // First base64 decode: K8s secret .data encoding
  const helmEncoded = Buffer.from(releaseData, 'base64').toString('utf-8')
  // Second base64 decode: Helm's own base64 layer wrapping the gzip
  const compressed = Buffer.from(helmEncoded, 'base64')
  const jsonBuffer = gunzipSync(compressed)
  return JSON.parse(jsonBuffer.toString('utf-8')) as Record<string, unknown>
}

function extractSummaryFromSecret(secret: k8s.V1Secret): HelmReleaseSummary {
  const labels = secret.metadata?.labels ?? {}
  const revision = Number.parseInt(labels.version ?? '0', 10)

  // Extract chart metadata from decoded release if available, fallback to labels
  let chartName = ''
  let chartVersion = ''
  let appVersion = ''
  let status = labels.status ?? 'unknown'
  let updatedAt: string | null = null

  // For list view, we decode the release to get accurate chart info
  // The secret labels only have name, owner, status, version
  try {
    const releaseData = secret.data?.release
    if (releaseData) {
      const release = decodeHelmRelease(releaseData)
      const chart = release.chart as Record<string, unknown> | undefined
      const metadata = chart?.metadata as Record<string, unknown> | undefined
      const info = release.info as Record<string, unknown> | undefined

      chartName = (metadata?.name as string) ?? ''
      chartVersion = (metadata?.version as string) ?? ''
      appVersion = (metadata?.appVersion as string) ?? ''
      status = (info?.status as string) ?? status
      updatedAt = (info?.last_deployed as string) ?? null
    }
  } catch {
    // If decode fails, use label data
    chartName = labels.name ?? ''
  }

  return {
    name: labels.name ?? secret.metadata?.name ?? '',
    namespace: secret.metadata?.namespace ?? '',
    chartName,
    chartVersion,
    appVersion,
    status,
    revision,
    updatedAt,
  }
}

export const helmRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const secretsResponse = await cached(
          CACHE_KEYS.k8sHelmReleases(input.clusterId),
          30_000,
          async () => {
            // Use label selector for Helm secrets (more reliable across K8s versions)
            const response = await coreV1.listSecretForAllNamespaces({
              labelSelector: 'owner=helm',
            })
            // Filter by type as secondary check
            return response.items.filter((s) => s.type === 'helm.sh/release.v1')
          },
        )

        // Group by release name+namespace, keep only latest revision
        const releaseMap = new Map<string, k8s.V1Secret>()
        for (const secret of secretsResponse) {
          const name = secret.metadata?.labels?.name ?? ''
          const ns = secret.metadata?.namespace ?? ''
          const key = `${ns}/${name}`
          const revision = Number.parseInt(secret.metadata?.labels?.version ?? '0', 10)
          const existing = releaseMap.get(key)
          const existingRevision = existing
            ? Number.parseInt(existing.metadata?.labels?.version ?? '0', 10)
            : -1

          if (revision > existingRevision) {
            releaseMap.set(key, secret)
          }
        }

        // Extract summaries from latest revision secrets
        const releases: HelmReleaseSummary[] = []
        for (const secret of releaseMap.values()) {
          releases.push(extractSummaryFromSecret(secret))
        }

        return releases.sort((a, b) => a.name.localeCompare(b.name))
      } catch (err) {
        handleK8sError(err, 'list helm releases')
      }
    }),

  get: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        releaseName: z.string(),
        namespace: z.string(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const detail = await cached(
          CACHE_KEYS.k8sHelmRelease(input.clusterId, input.releaseName, input.namespace),
          30_000,
          async () => {
            // Find latest revision for this release
            const response = await coreV1.listNamespacedSecret({
              namespace: input.namespace,
              labelSelector: `owner=helm,name=${input.releaseName}`,
            })

            const helmSecrets = response.items
              .filter((s) => s.type === 'helm.sh/release.v1')
              .sort((a, b) => {
                const revA = Number.parseInt(a.metadata?.labels?.version ?? '0', 10)
                const revB = Number.parseInt(b.metadata?.labels?.version ?? '0', 10)
                return revB - revA
              })

            const latestSecret = helmSecrets[0]
            if (!latestSecret?.data?.release) {
              return null
            }

            const release = decodeHelmRelease(latestSecret.data.release)
            const chart = release.chart as Record<string, unknown> | undefined
            const metadata = chart?.metadata as Record<string, unknown> | undefined
            const info = release.info as Record<string, unknown> | undefined

            const result: HelmReleaseDetail = {
              name: (release.name as string) ?? input.releaseName,
              namespace: (release.namespace as string) ?? input.namespace,
              chartName: (metadata?.name as string) ?? '',
              chartVersion: (metadata?.version as string) ?? '',
              appVersion: (metadata?.appVersion as string) ?? '',
              status: (info?.status as string) ?? 'unknown',
              revision: Number.parseInt(latestSecret.metadata?.labels?.version ?? '0', 10),
              firstDeployed: (info?.first_deployed as string) ?? null,
              lastDeployed: (info?.last_deployed as string) ?? null,
              values: (release.config as Record<string, unknown>) ?? {},
              notes: (info?.notes as string) ?? '',
              manifest: (release.manifest as string) ?? '',
            }
            return result
          },
        )

        return detail
      } catch (err) {
        handleK8sError(err, 'get helm release')
      }
    }),

  revisions: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        releaseName: z.string(),
        namespace: z.string(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const revisions = await cached(
          CACHE_KEYS.k8sHelmRevisions(input.clusterId, input.releaseName, input.namespace),
          30_000,
          async () => {
            const response = await coreV1.listNamespacedSecret({
              namespace: input.namespace,
              labelSelector: `owner=helm,name=${input.releaseName}`,
            })

            const helmSecrets = response.items.filter((s) => s.type === 'helm.sh/release.v1')

            const result: HelmRevision[] = helmSecrets
              .map((secret) => {
                const revision = Number.parseInt(secret.metadata?.labels?.version ?? '0', 10)
                let status = secret.metadata?.labels?.status ?? 'unknown'
                let updatedAt: string | null = null
                let description = ''

                try {
                  if (secret.data?.release) {
                    const release = decodeHelmRelease(secret.data.release)
                    const info = release.info as Record<string, unknown> | undefined
                    status = (info?.status as string) ?? status
                    updatedAt = (info?.last_deployed as string) ?? null
                    description = (info?.description as string) ?? ''
                  }
                } catch {
                  // Fall back to label data
                }

                return { revision, status, updatedAt, description }
              })
              .sort((a, b) => b.revision - a.revision)

            return result
          },
        )

        return revisions
      } catch (err) {
        handleK8sError(err, 'list helm revisions')
      }
    }),

  revisionValues: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        releaseName: z.string(),
        namespace: z.string(),
        revision: z.number().int().min(1),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const values = await cached(
          CACHE_KEYS.k8sHelmRevisionValues(
            input.clusterId,
            input.releaseName,
            input.namespace,
            input.revision,
          ),
          30,
          async () => {
            const response = await coreV1.listNamespacedSecret({
              namespace: input.namespace,
              labelSelector: `owner=helm,name=${input.releaseName},version=${input.revision}`,
            })

            const secret = response.items.find((s) => s.type === 'helm.sh/release.v1')
            if (!secret?.data?.release) {
              return {}
            }

            try {
              const release = decodeHelmRelease(secret.data.release)
              return (release.config as Record<string, unknown>) ?? {}
            } catch {
              return {}
            }
          },
        )

        return { values: values ?? {} }
      } catch (err) {
        handleK8sError(err, 'get helm revision values')
      }
    }),
})
