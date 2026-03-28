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

export const pvcsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const response = await cached(`k8s:${input.clusterId}:pvcs`, 15_000, () =>
          coreV1.listPersistentVolumeClaimForAllNamespaces(),
        )

        return response.items.map((pvc) => ({
          name: pvc.metadata?.name ?? '',
          namespace: pvc.metadata?.namespace ?? '',
          phase: pvc.status?.phase ?? 'Pending',
          capacity: pvc.status?.capacity?.storage ?? '—',
          requestedStorage: pvc.spec?.resources?.requests?.storage ?? '—',
          storageClass: pvc.spec?.storageClassName ?? 'default',
          accessModes: pvc.spec?.accessModes ?? [],
          volumeName: pvc.spec?.volumeName ?? null,
          volumeMode: pvc.spec?.volumeMode ?? 'Filesystem',
          age: computeAge(pvc.metadata?.creationTimestamp),
          labels: (pvc.metadata?.labels as Record<string, string>) ?? {},
          annotations: (pvc.metadata?.annotations as Record<string, string>) ?? {},
          finalizers: pvc.metadata?.finalizers ?? [],
          conditions: (pvc.status?.conditions ?? []).map((c) => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason ?? undefined,
            message: c.message ?? undefined,
            lastTransitionTime: c.lastTransitionTime
              ? new Date(c.lastTransitionTime as unknown as string).toISOString()
              : undefined,
          })),
        }))
      } catch (err) {
        handleK8sError(err, 'list pvcs')
      }
    }),
})
