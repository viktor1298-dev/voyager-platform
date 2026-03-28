import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

interface CrdSummary {
  name: string
  group: string
  version: string
  scope: 'Namespaced' | 'Cluster'
  plural: string
  kind: string
}

interface CrdInstance {
  name: string
  namespace: string | null
  uid: string
  createdAt: string | null
}

/**
 * Safely extract items from a CustomObjectsApi response.
 * The response shape varies across client versions (may have .body wrapper or be flat).
 */
function asK8sList(value: unknown): { items: Record<string, unknown>[] } {
  const body =
    value && typeof value === 'object' && 'body' in value
      ? (value as { body?: unknown }).body
      : value

  if (!body || typeof body !== 'object' || !('items' in body)) {
    return { items: [] }
  }

  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return { items: [] }
  }

  return {
    items: items.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
    ),
  }
}

export const crdsRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const apiExt = kc.makeApiClient(k8s.ApiextensionsV1Api)

        const crds = await cached(CACHE_KEYS.k8sCrds(input.clusterId), 30_000, async () => {
          const response = await apiExt.listCustomResourceDefinition()
          return response.items.map((crd): CrdSummary => {
            const servedVersion = crd.spec?.versions?.find((v) => v.served)
            return {
              name: crd.metadata?.name ?? '',
              group: crd.spec?.group ?? '',
              version: servedVersion?.name ?? crd.spec?.versions?.[0]?.name ?? '',
              scope: (crd.spec?.scope as 'Namespaced' | 'Cluster') ?? 'Namespaced',
              plural: crd.spec?.names?.plural ?? '',
              kind: crd.spec?.names?.kind ?? '',
            }
          })
        })

        return crds.sort((a, b) => a.name.localeCompare(b.name))
      } catch (err) {
        handleK8sError(err, 'list CRDs')
      }
    }),

  instances: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        group: z.string(),
        version: z.string(),
        plural: z.string(),
        scope: z.enum(['Namespaced', 'Cluster']),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const customApi = kc.makeApiClient(k8s.CustomObjectsApi)

        const instances = await cached(
          CACHE_KEYS.k8sCrdInstances(input.clusterId, input.group, input.plural),
          15_000,
          async () => {
            let rawResponse: unknown

            if (input.scope === 'Cluster') {
              rawResponse = await customApi.listClusterCustomObject({
                group: input.group,
                version: input.version,
                plural: input.plural,
              })
            } else {
              // For namespaced CRDs, list across all namespaces via cluster-scoped endpoint
              rawResponse = await customApi.listClusterCustomObject({
                group: input.group,
                version: input.version,
                plural: input.plural,
              })
            }

            const list = asK8sList(rawResponse)
            return list.items.map((item): CrdInstance => {
              const metadata = item.metadata as Record<string, unknown> | undefined
              return {
                name: (metadata?.name as string) ?? '',
                namespace: (metadata?.namespace as string) ?? null,
                uid: (metadata?.uid as string) ?? '',
                createdAt: metadata?.creationTimestamp
                  ? new Date(metadata.creationTimestamp as string).toISOString()
                  : null,
              }
            })
          },
        )

        return instances
      } catch (err) {
        handleK8sError(err, 'list CRD instances')
      }
    }),

  instanceYaml: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        group: z.string(),
        version: z.string(),
        plural: z.string(),
        name: z.string(),
        namespace: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const customApi = kc.makeApiClient(k8s.CustomObjectsApi)

        let rawResponse: unknown

        if (input.namespace) {
          rawResponse = await customApi.getNamespacedCustomObject({
            group: input.group,
            version: input.version,
            plural: input.plural,
            namespace: input.namespace,
            name: input.name,
          })
        } else {
          rawResponse = await customApi.getClusterCustomObject({
            group: input.group,
            version: input.version,
            plural: input.plural,
            name: input.name,
          })
        }

        // Extract body if wrapped
        const body =
          rawResponse && typeof rawResponse === 'object' && 'body' in rawResponse
            ? (rawResponse as { body: unknown }).body
            : rawResponse

        return body as Record<string, unknown>
      } catch (err) {
        handleK8sError(err, 'get CRD instance')
      }
    }),
})
