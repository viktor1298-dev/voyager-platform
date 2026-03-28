import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { clusters as clustersTable, db } from '@voyager/db'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { cached, getRedisClient } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

const K8S_DEPLOYMENTS_CACHE_TTL = 30

type RolloutInfo = {
  revision: string
  image: string
  updatedAt: string
}

interface DeploymentInfo {
  clusterId: string
  clusterName: string
  name: string
  namespace: string
  replicas: number
  ready: number
  image: string
  imageVersion: string
  status: 'Running' | 'Pending' | 'Failed' | 'Scaling'
  lastUpdated: string
  age: string
  rolloutHistory: RolloutInfo[]
}

const rolloutInfoSchema = z.object({
  revision: z.string(),
  image: z.string(),
  updatedAt: z.string(),
})

const deploymentInfoSchema = z.object({
  clusterId: z.string(),
  clusterName: z.string(),
  name: z.string(),
  namespace: z.string(),
  replicas: z.number().int(),
  ready: z.number().int(),
  image: z.string(),
  imageVersion: z.string(),
  status: z.enum(['Running', 'Pending', 'Failed', 'Scaling']),
  lastUpdated: z.string(),
  age: z.string(),
  rolloutHistory: z.array(rolloutInfoSchema),
})

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

function deriveImageVersion(image: string): string {
  if (!image || image === 'unknown') return 'unknown'
  const digestIndex = image.indexOf('@')
  if (digestIndex > -1) return image.slice(digestIndex + 1)
  const tagIndex = image.lastIndexOf(':')
  if (tagIndex > -1 && tagIndex < image.length - 1) return image.slice(tagIndex + 1)
  return 'latest'
}

function deriveStatus(params: {
  ready: number
  replicas: number
  available: number
  unavailable: number
  generation?: number
  observedGeneration?: number
}): 'Running' | 'Pending' | 'Failed' | 'Scaling' {
  const { ready, replicas, available, unavailable, generation, observedGeneration } = params

  if (
    generation !== undefined &&
    observedGeneration !== undefined &&
    generation > observedGeneration
  ) {
    return 'Scaling'
  }

  if (replicas === 0) return 'Pending'
  if (unavailable > 0 && ready === 0) return 'Failed'
  if (ready === replicas && available === replicas) return 'Running'
  if (ready > 0 || available > 0) return 'Scaling'
  return 'Pending'
}

function findLastUpdated(deployment: {
  metadata?: { creationTimestamp?: Date | string }
  status?: {
    conditions?: Array<{ lastUpdateTime?: Date | string; lastTransitionTime?: Date | string }>
  }
}): string {
  const conditionTimes = (deployment.status?.conditions ?? [])
    .flatMap((condition) => [condition.lastUpdateTime, condition.lastTransitionTime])
    .filter(Boolean)
    .map((value) => new Date(value as Date | string).toISOString())
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  if (conditionTimes.length > 0) return conditionTimes[0]
  return deployment.metadata?.creationTimestamp
    ? new Date(deployment.metadata.creationTimestamp).toISOString()
    : new Date(0).toISOString()
}

async function getClusterContextFromPool(clusterId?: string): Promise<{
  kc: import('@kubernetes/client-node').KubeConfig
  clusterId: string
  clusterName: string
}> {
  if (clusterId) {
    const kc = await clusterClientPool.getClient(clusterId)
    return { kc, clusterId, clusterName: clusterId }
  }
  // Fallback: use first registered cluster
  const [first] = await db
    .select({ id: clustersTable.id, name: clustersTable.name })
    .from(clustersTable)
    .limit(1)
  if (!first) throw new Error('No clusters registered')
  const kc = await clusterClientPool.getClient(first.id)
  return { kc, clusterId: first.id, clusterName: first.name }
}

export const deploymentsRouter = router({
  list: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/api/deployments', protect: true, tags: ['deployments'] },
    })
    .input(z.object({ clusterId: z.string().uuid().optional() }).optional())
    .output(z.array(deploymentInfoSchema))
    .query(async ({ input }): Promise<DeploymentInfo[]> => {
      return cached(CACHE_KEYS.k8sDeploymentsListGlobal(), K8S_DEPLOYMENTS_CACHE_TTL, async () => {
        const { kc, clusterId, clusterName } = await getClusterContextFromPool(input?.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        const [{ items: deployments }, { items: replicaSets }] = await Promise.all([
          api.listDeploymentForAllNamespaces(),
          api.listReplicaSetForAllNamespaces(),
        ])

        const rolloutMap = new Map<string, RolloutInfo[]>()

        for (const rs of replicaSets ?? []) {
          const namespace = rs.metadata?.namespace ?? 'default'
          const owners = rs.metadata?.ownerReferences ?? []
          const deploymentOwner = owners.find((owner) => owner.kind === 'Deployment' && owner.name)
          if (!deploymentOwner?.name) continue

          const key = `${namespace}/${deploymentOwner.name}`
          const image = rs.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'
          const revision = rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? 'n/a'
          const updatedAt = rs.metadata?.creationTimestamp
            ? new Date(rs.metadata.creationTimestamp).toISOString()
            : new Date(0).toISOString()

          const existing = rolloutMap.get(key) ?? []
          existing.push({ revision, image, updatedAt })
          rolloutMap.set(key, existing)
        }

        for (const [key, history] of rolloutMap.entries()) {
          history.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          rolloutMap.set(key, history.slice(0, 3))
        }

        return (deployments ?? []).map((deployment) => {
          const name = deployment.metadata?.name ?? 'unknown'
          const namespace = deployment.metadata?.namespace ?? 'default'
          const replicas = deployment.spec?.replicas ?? 0
          const ready = deployment.status?.readyReplicas ?? 0
          const available = deployment.status?.availableReplicas ?? 0
          const unavailable =
            deployment.status?.unavailableReplicas ?? Math.max(replicas - ready, 0)
          const image = deployment.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'
          const key = `${namespace}/${name}`

          return {
            clusterId,
            clusterName,
            name,
            namespace,
            replicas,
            ready,
            image,
            imageVersion: deriveImageVersion(image),
            status: deriveStatus({
              ready,
              replicas,
              available,
              unavailable,
              generation: deployment.metadata?.generation,
              observedGeneration: deployment.status?.observedGeneration,
            }),
            lastUpdated: findLastUpdated(deployment),
            age: computeAge(deployment.metadata?.creationTimestamp),
            rolloutHistory: rolloutMap.get(key) ?? [],
          }
        })
      })
    }),

  listByCluster: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/api/deployments/by-cluster',
        protect: true,
        tags: ['deployments'],
      },
    })
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(z.array(deploymentInfoSchema))
    .query(async ({ input }): Promise<DeploymentInfo[]> => {
      const cacheKey = CACHE_KEYS.k8sDeploymentsList(input.clusterId)
      return cached(cacheKey, K8S_DEPLOYMENTS_CACHE_TTL, async () => {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const clusterName = input.clusterId
        const api = kc.makeApiClient(k8s.AppsV1Api)
        const [{ items: deployments }, { items: replicaSets }] = await Promise.all([
          api.listDeploymentForAllNamespaces(),
          api.listReplicaSetForAllNamespaces(),
        ])

        const rolloutMap = new Map<string, RolloutInfo[]>()

        for (const rs of replicaSets ?? []) {
          const namespace = rs.metadata?.namespace ?? 'default'
          const owners = rs.metadata?.ownerReferences ?? []
          const deploymentOwner = owners.find((owner) => owner.kind === 'Deployment' && owner.name)
          if (!deploymentOwner?.name) continue

          const key = `${namespace}/${deploymentOwner.name}`
          const image = rs.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'
          const revision = rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? 'n/a'
          const updatedAt = rs.metadata?.creationTimestamp
            ? new Date(rs.metadata.creationTimestamp).toISOString()
            : new Date(0).toISOString()

          const existing = rolloutMap.get(key) ?? []
          existing.push({ revision, image, updatedAt })
          rolloutMap.set(key, existing)
        }

        for (const [key, history] of rolloutMap.entries()) {
          history.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          rolloutMap.set(key, history.slice(0, 3))
        }

        return (deployments ?? []).map((deployment) => {
          const name = deployment.metadata?.name ?? 'unknown'
          const namespace = deployment.metadata?.namespace ?? 'default'
          const replicas = deployment.spec?.replicas ?? 0
          const ready = deployment.status?.readyReplicas ?? 0
          const available = deployment.status?.availableReplicas ?? 0
          const unavailable =
            deployment.status?.unavailableReplicas ?? Math.max(replicas - ready, 0)
          const image = deployment.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'
          const key = `${namespace}/${name}`

          return {
            clusterId: input.clusterId,
            clusterName,
            name,
            namespace,
            replicas,
            ready,
            image,
            imageVersion: deriveImageVersion(image),
            status: deriveStatus({
              ready,
              replicas,
              available,
              unavailable,
              generation: deployment.metadata?.generation,
              observedGeneration: deployment.status?.observedGeneration,
            }),
            lastUpdated: findLastUpdated(deployment),
            age: computeAge(deployment.metadata?.creationTimestamp),
            rolloutHistory: rolloutMap.get(key) ?? [],
          }
        })
      })
    }),

  listDetail: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      const cacheKey = `${CACHE_KEYS.k8sDeploymentsList(input.clusterId)}:detail`
      return cached(cacheKey, K8S_DEPLOYMENTS_CACHE_TTL, async () => {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        const { items: deployments } = await api.listDeploymentForAllNamespaces()

        return (deployments ?? []).map((d) => {
          const name = d.metadata?.name ?? 'unknown'
          const namespace = d.metadata?.namespace ?? 'default'
          const replicas = d.spec?.replicas ?? 0
          const ready = d.status?.readyReplicas ?? 0
          const updated = d.status?.updatedReplicas ?? 0
          const available = d.status?.availableReplicas ?? 0
          const unavailable = d.status?.unavailableReplicas ?? 0
          const image = d.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'

          const strategy = d.spec?.strategy
          const conditions = (d.status?.conditions ?? []).map((c) => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason ?? undefined,
            message: c.message ?? undefined,
            lastTransitionTime: c.lastTransitionTime
              ? new Date(c.lastTransitionTime as unknown as string).toISOString()
              : undefined,
          }))

          const selector = (d.spec?.selector?.matchLabels as Record<string, string>) ?? {}

          return {
            name,
            namespace,
            replicas,
            readyReplicas: ready,
            updatedReplicas: updated,
            availableReplicas: available,
            unavailableReplicas: unavailable,
            image,
            status: deriveStatus({
              ready,
              replicas,
              available,
              unavailable: d.status?.unavailableReplicas ?? Math.max(replicas - ready, 0),
              generation: d.metadata?.generation,
              observedGeneration: d.status?.observedGeneration,
            }),
            age: computeAge(d.metadata?.creationTimestamp),
            strategyType: strategy?.type ?? 'RollingUpdate',
            maxSurge: strategy?.rollingUpdate?.maxSurge?.toString() ?? null,
            maxUnavailable: strategy?.rollingUpdate?.maxUnavailable?.toString() ?? null,
            selector,
            conditions,
          }
        })
      })
    }),

  restart: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/api/deployments/restart',
        protect: true,
        tags: ['deployments'],
      },
    })
    .input(
      z.object({
        name: z.string(),
        namespace: z.string(),
        clusterId: z.string().uuid().optional(),
      }),
    )
    .output(z.object({ success: z.boolean(), restartedAt: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { kc } = await getClusterContextFromPool(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
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
        if (redis) await redis.del(CACHE_KEYS.k8sDeploymentsListGlobal())
        await logAudit(
          ctx,
          'deployment.restart',
          'deployment',
          `${input.namespace}/${input.name}`,
          {
            namespace: input.namespace,
          },
        )
        return { success: true, restartedAt: now }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to restart deployment ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),

  scale: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/api/deployments/scale',
        protect: true,
        tags: ['deployments'],
      },
    })
    .input(
      z.object({
        name: z.string(),
        namespace: z.string(),
        clusterId: z.string().uuid().optional(),
        replicas: z.number().int().min(0).max(50),
      }),
    )
    .output(z.object({ success: z.boolean(), replicas: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { kc } = await getClusterContextFromPool(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        await api.patchNamespacedDeployment({
          name: input.name,
          namespace: input.namespace,
          body: { spec: { replicas: input.replicas } },
        })
        const redis = await getRedisClient()
        if (redis) await redis.del(CACHE_KEYS.k8sDeploymentsListGlobal())
        await logAudit(ctx, 'deployment.scale', 'deployment', `${input.namespace}/${input.name}`, {
          replicas: input.replicas,
        })
        return { success: true, replicas: input.replicas }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to scale deployment ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),
})
