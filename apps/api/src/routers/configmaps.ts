import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { authorizedProcedure, router } from '../trpc.js'

function computeAge(ts: Date | string | undefined): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const MAX_INLINE_VALUE_LENGTH = 200

export const configMapsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const response = await cached(`k8s:${input.clusterId}:configmaps`, 15_000, () =>
          coreV1.listConfigMapForAllNamespaces(),
        )

        return response.items.map((cm) => {
          const dataKeys = Object.keys(cm.data ?? {})
          const binaryDataKeys = Object.keys(cm.binaryData ?? {})

          // Truncate large values
          const dataEntries = dataKeys.map((key) => {
            const value = cm.data?.[key] ?? ''
            return {
              key,
              value: value.length > MAX_INLINE_VALUE_LENGTH ? null : value,
              size: value.length,
            }
          })

          return {
            name: cm.metadata?.name ?? '',
            namespace: cm.metadata?.namespace ?? '',
            dataKeysCount: dataKeys.length,
            binaryDataKeysCount: binaryDataKeys.length,
            age: computeAge(cm.metadata?.creationTimestamp),
            labels: (cm.metadata?.labels as Record<string, string>) ?? {},
            dataEntries,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list configmaps')
      }
    }),
})
