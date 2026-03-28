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

export const secretsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const response = await cached(`k8s:${input.clusterId}:secrets`, 15_000, () =>
          coreV1.listSecretForAllNamespaces(),
        )

        return response.items.map((secret) => {
          // NEVER expose .data or .stringData values — key names only
          const dataKeyNames = Object.keys(secret.data ?? {})

          // Filter out kubectl internal annotations
          const annotations = Object.fromEntries(
            Object.entries((secret.metadata?.annotations as Record<string, string>) ?? {}).filter(
              ([key]) => !key.startsWith('kubectl.kubernetes.io/'),
            ),
          )

          return {
            name: secret.metadata?.name ?? '',
            namespace: secret.metadata?.namespace ?? '',
            type: secret.type ?? 'Opaque',
            dataKeysCount: dataKeyNames.length,
            dataKeyNames,
            age: computeAge(secret.metadata?.creationTimestamp),
            labels: (secret.metadata?.labels as Record<string, string>) ?? {},
            annotations,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list secrets')
      }
    }),
})
