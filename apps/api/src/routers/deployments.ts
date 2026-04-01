import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { CACHE_TTL } from '@voyager/config'
import { clusters as clustersTable, db } from '@voyager/db'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { cached, getRedisClient } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import {
  computeAge,
  deriveDeploymentStatus,
  deriveImageVersion,
  mapDeployment,
} from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { adminProcedure, protectedProcedure, router } from '../trpc.js'

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
      return cached(
        CACHE_KEYS.k8sDeploymentsListGlobal(),
        CACHE_TTL.K8S_RESOURCES_SEC,
        async () => {
          try {
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
              const deploymentOwner = owners.find(
                (owner) => owner.kind === 'Deployment' && owner.name,
              )
              if (!deploymentOwner?.name) continue

              const key = `${namespace}/${deploymentOwner.name}`
              const image = rs.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'
              const revision =
                rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? 'n/a'
              const updatedAt = rs.metadata?.creationTimestamp
                ? new Date(rs.metadata.creationTimestamp).toISOString()
                : new Date(0).toISOString()

              const existing = rolloutMap.get(key) ?? []
              existing.push({ revision, image, updatedAt })
              rolloutMap.set(key, existing)
            }

            for (const [key, history] of rolloutMap.entries()) {
              history.sort(
                (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
              )
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
                status: deriveDeploymentStatus({
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
          } catch (err) {
            throw handleK8sError(err, 'list deployments')
          }
        },
      )
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
      // Read from WatchManager in-memory store when available
      const watchedDeps = watchManager.getResources(input.clusterId, 'deployments')
      if (watchedDeps) {
        return (watchedDeps as k8s.V1Deployment[]).map((d) =>
          mapDeployment(d, input.clusterId, input.clusterId),
        )
      }

      // Fallback: fetch from K8s API via cached()
      const cacheKey = CACHE_KEYS.k8sDeploymentsList(input.clusterId)
      return cached(cacheKey, CACHE_TTL.K8S_RESOURCES_SEC, async () => {
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
            status: deriveDeploymentStatus({
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
      // Helper to map a deployment to the detail shape
      const mapDetail = (d: k8s.V1Deployment) => {
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
          status: deriveDeploymentStatus({
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
      }

      // Read from WatchManager in-memory store when available
      const watchedDepsDetail = watchManager.getResources(input.clusterId, 'deployments')
      if (watchedDepsDetail) {
        return (watchedDepsDetail as k8s.V1Deployment[]).map(mapDetail)
      }

      // Fallback: fetch from K8s API via cached()
      const cacheKey = `${CACHE_KEYS.k8sDeploymentsList(input.clusterId)}:detail`
      return cached(cacheKey, CACHE_TTL.K8S_RESOURCES_SEC, async () => {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        const { items: deployments } = await api.listDeploymentForAllNamespaces()
        return (deployments ?? []).map(mapDetail)
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
        const { kc } = await getClusterContextFromPool(input.clusterId)
        const api = kc.makeApiClient(k8s.AppsV1Api)
        await api.deleteNamespacedDeployment({
          name: input.name,
          namespace: input.namespace,
        })
        const redis = await getRedisClient()
        if (redis) await redis.del(CACHE_KEYS.k8sDeploymentsListGlobal())
        await logAudit(ctx, 'deployment.delete', 'deployment', `${input.namespace}/${input.name}`, {
          namespace: input.namespace,
        })
        return { success: true }
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete deployment ${input.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
      }
    }),
})
