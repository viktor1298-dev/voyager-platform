import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { cached, getRedisClient } from '../lib/cache'
import { getAppsV1Api } from '../lib/k8s'
import { logAudit } from '../lib/audit'
import { adminProcedure, protectedProcedure, router } from '../trpc'

const K8S_DEPLOYMENTS_CACHE_TTL = 30

interface DeploymentInfo {
  name: string
  namespace: string
  replicas: number
  ready: number
  image: string
  age: string
  status: string
}

function computeAge(creationTimestamp: Date | string | undefined): string {
  if (!creationTimestamp) return 'unknown'
  const diff = Date.now() - new Date(creationTimestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function deriveStatus(ready: number, replicas: number): string {
  if (replicas === 0) return 'Scaled Down'
  if (ready === replicas) return 'Running'
  if (ready > 0) return 'Degraded'
  return 'Unavailable'
}

export const deploymentsRouter = router({
  list: protectedProcedure.query(async (): Promise<DeploymentInfo[]> => {
    return cached('k8s:deployments:list', K8S_DEPLOYMENTS_CACHE_TTL, async () => {
      const api = getAppsV1Api()
      const res = await api.listDeploymentForAllNamespaces()
      return (res.items ?? []).map((d) => {
        const replicas = d.spec?.replicas ?? 0
        const ready = d.status?.readyReplicas ?? 0
        const image = d.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'
        return {
          name: d.metadata?.name ?? 'unknown',
          namespace: d.metadata?.namespace ?? 'default',
          replicas,
          ready,
          image,
          age: computeAge(d.metadata?.creationTimestamp),
          status: deriveStatus(ready, replicas),
        }
      })
    })
  }),

  restart: adminProcedure
    .input(z.object({ name: z.string(), namespace: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const api = getAppsV1Api()
        const now = new Date().toISOString()
        await api.patchNamespacedDeployment({
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
        if (redis) await redis.del('k8s:deployments:list')
        await logAudit(ctx, 'deployment.restart', 'deployment', `${input.namespace}/${input.name}`, { namespace: input.namespace })
        return { success: true, restartedAt: now }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to restart deployment ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),

  scale: adminProcedure
    .input(
      z.object({
        name: z.string(),
        namespace: z.string(),
        replicas: z.number().int().min(0).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const api = getAppsV1Api()
        await api.patchNamespacedDeployment({
          name: input.name,
          namespace: input.namespace,
          body: { spec: { replicas: input.replicas } },
        })
        const redis = await getRedisClient()
        if (redis) await redis.del('k8s:deployments:list')
        await logAudit(ctx, 'deployment.scale', 'deployment', `${input.namespace}/${input.name}`, { replicas: input.replicas })
        return { success: true, replicas: input.replicas }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to scale deployment ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),
})
