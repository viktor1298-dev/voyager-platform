import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { cached, getRedisClient } from '../lib/cache.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { adminProcedure, authorizedProcedure, router } from '../trpc.js'

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

export const daemonSetsRouter = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const appsV1 = kc.makeApiClient(k8s.AppsV1Api)

        const response = await cached(`k8s:${input.clusterId}:daemonsets`, 15, () =>
          appsV1.listDaemonSetForAllNamespaces(),
        )

        return response.items.map((ds) => {
          const desired = ds.status?.desiredNumberScheduled ?? 0
          const current = ds.status?.currentNumberScheduled ?? 0
          const ready = ds.status?.numberReady ?? 0
          const updated = ds.status?.updatedNumberScheduled ?? 0
          const available = ds.status?.numberAvailable ?? 0
          const unavailable = ds.status?.numberUnavailable ?? 0

          const nodeSelector =
            (ds.spec?.template?.spec?.nodeSelector as Record<string, string>) ?? {}
          const tolerations = (ds.spec?.template?.spec?.tolerations ?? []).map((t) => ({
            key: t.key ?? '*',
            operator: t.operator ?? 'Equal',
            value: t.value ?? '',
            effect: t.effect ?? 'NoSchedule',
          }))

          const conditions = (ds.status?.conditions ?? []).map((c) => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason ?? undefined,
            message: c.message ?? undefined,
            lastTransitionTime: c.lastTransitionTime
              ? new Date(c.lastTransitionTime as unknown as string).toISOString()
              : undefined,
          }))

          const selector = (ds.spec?.selector?.matchLabels as Record<string, string>) ?? {}

          return {
            name: ds.metadata?.name ?? '',
            namespace: ds.metadata?.namespace ?? '',
            desired,
            current,
            ready,
            updated,
            available,
            unavailable,
            age: computeAge(ds.metadata?.creationTimestamp),
            nodeSelector,
            tolerations,
            conditions,
            selector,
          }
        })
      } catch (err) {
        handleK8sError(err, 'list daemonsets')
      }
    }),

  restart: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z.string(),
        namespace: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        const now = new Date().toISOString()
        await api.patchNamespacedDaemonSet({
          name: input.name,
          namespace: input.namespace,
          body: {
            spec: {
              template: {
                metadata: {
                  annotations: { 'kubectl.kubernetes.io/restartedAt': now },
                },
              },
            },
          },
        })
        const redis = await getRedisClient()
        if (redis) await redis.del(`k8s:${input.clusterId}:daemonsets`)
        await logAudit(ctx, 'daemonset.restart', 'daemonset', `${input.namespace}/${input.name}`, {
          clusterId: input.clusterId,
          namespace: input.namespace,
        })
        return { success: true, restartedAt: now }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to restart daemonset ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),

  delete: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z.string(),
        namespace: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        await api.deleteNamespacedDaemonSet({
          name: input.name,
          namespace: input.namespace,
        })
        const redis = await getRedisClient()
        if (redis) await redis.del(`k8s:${input.clusterId}:daemonsets`)
        await logAudit(ctx, 'daemonset.delete', 'daemonset', `${input.namespace}/${input.name}`, {
          clusterId: input.clusterId,
          namespace: input.namespace,
        })
        return { success: true }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete daemonset ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),
})
