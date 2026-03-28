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

export const statefulSetsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const appsV1 = kc.makeApiClient(k8s.AppsV1Api)

        const response = await cached(`k8s:${input.clusterId}:statefulsets`, 15_000, () =>
          appsV1.listStatefulSetForAllNamespaces(),
        )

        return response.items.map((ss) => {
          const replicas = ss.spec?.replicas ?? 0
          const ready = ss.status?.readyReplicas ?? 0
          const current = ss.status?.currentReplicas ?? 0
          const updated = ss.status?.updatedReplicas ?? 0
          const image = ss.spec?.template?.spec?.containers?.[0]?.image ?? '—'

          const vcts = (ss.spec?.volumeClaimTemplates ?? []).map((vct) => ({
            name: vct.metadata?.name ?? '',
            storageClass: vct.spec?.storageClassName ?? 'default',
            size: vct.spec?.resources?.requests?.storage ?? '—',
            accessModes: vct.spec?.accessModes ?? [],
          }))

          const conditions = (ss.status?.conditions ?? []).map((c) => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason ?? undefined,
            message: c.message ?? undefined,
            lastTransitionTime: c.lastTransitionTime
              ? new Date(c.lastTransitionTime as unknown as string).toISOString()
              : undefined,
          }))

          const selector = (ss.spec?.selector?.matchLabels as Record<string, string>) ?? {}

          return {
            name: ss.metadata?.name ?? '',
            namespace: ss.metadata?.namespace ?? '',
            replicas,
            readyReplicas: ready,
            currentReplicas: current,
            updatedReplicas: updated,
            image,
            age: computeAge(ss.metadata?.creationTimestamp),
            volumeClaimTemplates: vcts,
            conditions,
            selector,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list statefulsets')
      }
    }),
})
