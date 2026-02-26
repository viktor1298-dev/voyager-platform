import { TRPCError } from '@trpc/server'
import { clusters, nodes } from '@voyager/db'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { encryptCredential } from '../lib/credential-crypto.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { cached, invalidateK8sCache } from '../lib/cache.js'
import {
  awsConnectionConfigSchema,
  azureConnectionConfigSchema,
  connectionConfigSchema,
  gkeConnectionConfigSchema,
  kubeconfigConnectionConfigSchema,
  minikubeConnectionConfigSchema,
} from '../lib/connection-config.js'
import { validateClusterConnection } from '../lib/k8s-client-factory.js'
import * as k8s from '@kubernetes/client-node'
import { normalizeProvider, VALID_PROVIDERS } from '../lib/providers.js'
import { createAuthorizationService } from '../lib/authorization.js'
import { adminProcedure, authorizedProcedure, protectedProcedure, router } from '../trpc.js'

const ENCRYPTION_KEY = process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''
const isEncryptionEnabled = /^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)

function encryptConnectionConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!isEncryptionEnabled) return config
  const json = JSON.stringify(config)
  return { __encrypted: encryptCredential(json, ENCRYPTION_KEY) }
}

const K8S_CACHE_TTL = 30 // seconds

const parseOptionalDateInput = (value: string | Date | null | undefined, fieldName: string) => {
  if (value === undefined || value === null) {
    return value
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid ${fieldName}: expected ISO date string or Date`,
    })
  }

  return parsed
}

const providerSchema = z.enum(VALID_PROVIDERS)
const environmentSchema = z.enum(['production', 'staging', 'development'])
const healthStatusSchema = z.enum(['healthy', 'degraded', 'critical', 'unreachable', 'unknown'])

const providerConnectionInputSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('kubeconfig'), connectionConfig: kubeconfigConnectionConfigSchema }),
  z.object({ provider: z.literal('aws'), connectionConfig: awsConnectionConfigSchema }),
  z.object({ provider: z.literal('azure'), connectionConfig: azureConnectionConfigSchema }),
  z.object({ provider: z.literal('gke'), connectionConfig: gkeConnectionConfigSchema }),
  z.object({ provider: z.literal('minikube'), connectionConfig: minikubeConnectionConfigSchema }),
])

// shared connectionConfigSchema imported from lib/connection-config

const clusterSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    provider: providerSchema,
    environment: environmentSchema,
    endpoint: z.string().nullable().optional(),
    connectionConfig: z.record(z.string(), z.unknown()).or(connectionConfigSchema).optional(),
    status: z.string().nullable().optional(),
    healthStatus: healthStatusSchema.nullable().optional(),
    lastHealthCheck: z.union([z.string(), z.date()]).nullable().optional(),
    version: z.string().nullable().optional(),
    nodesCount: z.number().int().nullable().optional(),
    lastConnectedAt: z.union([z.string(), z.date()]).nullable().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough()

const nodeSchema = z
  .object({
    id: z.string(),
    clusterId: z.string(),
  })
  .passthrough()

const liveNodeSchema = z.object({
  name: z.string().nullable().optional(),
  status: z.string(),
  role: z.string(),
  kubeletVersion: z.string().nullable().optional(),
  os: z.string().nullable().optional(),
  cpu: z.string().nullable().optional(),
  memory: z.string().nullable().optional(),
  pods: z.string().nullable().optional(),
})

const liveEventSchema = z.object({
  type: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  namespace: z.string().nullable().optional(),
  involvedObject: z.string(),
  count: z.number().nullable().optional(),
  lastTimestamp: z.union([z.string(), z.date()]).nullable().optional(),
})

const liveDeploymentSchema = z.object({
  name: z.string().nullable().optional(),
  namespace: z.string().nullable().optional(),
  replicas: z.number().nullable().optional(),
  readyReplicas: z.number(),
  availableReplicas: z.number(),
})

const CONNECTION_REFUSED_PATTERNS = ['econnrefused', 'connection refused', 'enotfound']
const AUTH_FAILED_PATTERNS = ['unauthorized', 'forbidden', 'authentication', '401', '403', 'invalid token']
const TIMEOUT_PATTERNS = ['etimedout', 'timeout', 'timed out', 'aborterror']

function mapValidateConnectionError(error: unknown): TRPCError {
  if (error instanceof TRPCError) {
    return error
  }

  const message = error instanceof Error ? error.message : 'Unknown connection error'
  const lower = message.toLowerCase()

  if (CONNECTION_REFUSED_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return new TRPCError({
      code: 'BAD_GATEWAY',
      message: `Cluster API is unreachable: ${message}`,
    })
  }

  if (AUTH_FAILED_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return new TRPCError({
      code: 'UNAUTHORIZED',
      message: `Authentication failed while validating cluster connection: ${message}`,
    })
  }

  if (TIMEOUT_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return new TRPCError({
      code: 'GATEWAY_TIMEOUT',
      message: `Timed out while validating cluster connection: ${message}`,
    })
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Cluster connection validation failed: ${message}`,
  })
}

export const clustersRouter = router({
  list: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/api/clusters', protect: true, tags: ['clusters'] } })
    .input(z.void())
    .output(z.array(clusterSchema.omit({ connectionConfig: true }).extend({ hasCredentials: z.boolean(), nodeCount: z.number().int() })))
    .query(async ({ ctx }) => {
      const authz = createAuthorizationService(ctx.db)
      const allClusters = await ctx.db.select().from(clusters)
      const allowedClusterIds =
        ctx.user.role === 'admin'
          ? null
          : await authz.checkBatch(
              { type: 'user', id: ctx.user.id },
              'cluster',
              allClusters.map((cluster) => cluster.id),
              'viewer',
            )

      const visibleClusters =
        ctx.user.role === 'admin' ? allClusters : allClusters.filter((cluster) => allowedClusterIds?.has(cluster.id))

      const nodeCounts = await ctx.db
        .select({
          clusterId: nodes.clusterId,
          count: count().as('count'),
        })
        .from(nodes)
        .groupBy(nodes.clusterId)
      const countMap = new Map(nodeCounts.map((n) => [n.clusterId, n.count]))

      return visibleClusters.map((c) => {
        const { connectionConfig, ...rest } = c
        return {
          ...rest,
          hasCredentials: connectionConfig != null && Object.keys(connectionConfig).length > 0,
          nodeCount: countMap.get(c.id) ?? 0,
        }
      })
    }),

  get: authorizedProcedure('cluster', 'viewer')
    .meta({
      openapi: { method: 'GET', path: '/api/clusters/{id}', protect: true, tags: ['clusters'] },
    })
    .input(z.object({ id: z.string().uuid() }))
    .output(clusterSchema.omit({ connectionConfig: true }).extend({ hasCredentials: z.boolean(), nodes: z.array(nodeSchema) }))
    .query(async ({ ctx, input }) => {
      const [cluster] = await ctx.db.select().from(clusters).where(eq(clusters.id, input.id))
      if (!cluster) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
      const clusterNodes = await ctx.db.select().from(nodes).where(eq(nodes.clusterId, input.id))
      const { connectionConfig, ...rest } = cluster
      return { ...rest, hasCredentials: connectionConfig != null && Object.keys(connectionConfig).length > 0, nodes: clusterNodes }
    }),

  live: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/api/clusters/live', protect: true, tags: ['clusters'] },
    })
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(
      z.object({
        name: z.string(),
        provider: z.string(),
        version: z.string(),
        status: z.string(),
        nodes: z.array(liveNodeSchema),
        totalPods: z.number().int(),
        runningPods: z.number().int(),
        namespaces: z.array(z.string()),
        events: z.array(liveEventSchema),
        deployments: z.array(liveDeploymentSchema),
        endpoint: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const [cluster] = await ctx.db.select().from(clusters).where(eq(clusters.id, input.clusterId))

        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const appsV1 = kc.makeApiClient(k8s.AppsV1Api)
        const versionApi = kc.makeApiClient(k8s.VersionApi)

        const cachePrefix = `k8s:${input.clusterId}`
        const [versionInfo, nodesResponse, podsResponse, nsResponse, eventsResponse, deploymentsResponse] =
          await Promise.all([
            cached(`${cachePrefix}:version`, K8S_CACHE_TTL, () => versionApi.getCode()),
            cached(`${cachePrefix}:nodes`, K8S_CACHE_TTL, () => coreV1.listNode()),
            cached(`${cachePrefix}:pods`, K8S_CACHE_TTL, () => coreV1.listPodForAllNamespaces()),
            cached(`${cachePrefix}:namespaces`, K8S_CACHE_TTL, () => coreV1.listNamespace()),
            cached(`${cachePrefix}:events`, K8S_CACHE_TTL, () => coreV1.listEventForAllNamespaces()),
            cached(`${cachePrefix}:deployments`, K8S_CACHE_TTL, () => appsV1.listDeploymentForAllNamespaces()),
          ])

        const k8sNodes = nodesResponse.items.map((node) => ({
          name: node.metadata?.name,
          status:
            node.status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True'
              ? 'ready'
              : 'not-ready',
          role:
            node.metadata?.labels?.['node-role.kubernetes.io/control-plane'] !== undefined
              ? 'control-plane'
              : 'worker',
          kubeletVersion: node.status?.nodeInfo?.kubeletVersion,
          os: node.status?.nodeInfo?.osImage,
          cpu: node.status?.capacity?.cpu,
          memory: node.status?.capacity?.memory,
          pods: node.status?.capacity?.pods,
        }))

        const totalPods = podsResponse.items.length
        const runningPods = podsResponse.items.filter((p) => p.status?.phase === 'Running').length

        const namespaces = nsResponse.items.map((ns) => ns.metadata?.name).filter(Boolean) as string[]

        const events = eventsResponse.items
          .sort((a, b) => {
            const aTime = (a.lastTimestamp || a.metadata?.creationTimestamp) as unknown as string | undefined
            const bTime = (b.lastTimestamp || b.metadata?.creationTimestamp) as unknown as string | undefined
            return new Date(bTime ?? 0).getTime() - new Date(aTime ?? 0).getTime()
          })
          .slice(0, 50)
          .map((event) => ({
            type: event.type,
            reason: event.reason,
            message: event.message,
            namespace: event.metadata?.namespace,
            involvedObject: `${event.involvedObject?.kind}/${event.involvedObject?.name}`,
            count: event.count,
            lastTimestamp: event.lastTimestamp || event.metadata?.creationTimestamp,
          }))

        const deployments = deploymentsResponse.items.map((d) => ({
          name: d.metadata?.name,
          namespace: d.metadata?.namespace,
          replicas: d.spec?.replicas,
          readyReplicas: d.status?.readyReplicas ?? 0,
          availableReplicas: d.status?.availableReplicas ?? 0,
        }))

        const allNodesReady = k8sNodes.every((n) => n.status === 'ready')
        const status = allNodesReady ? 'healthy' : 'degraded'

        return {
          name: cluster?.name ?? 'unknown',
          provider: cluster?.provider ?? 'unknown',
          version: `v${versionInfo.major}.${versionInfo.minor}`,
          status,
          nodes: k8sNodes,
          totalPods,
          runningPods,
          namespaces,
          events,
          deployments,
          endpoint: cluster?.endpoint ?? kc.getCurrentCluster()?.server ?? 'unknown',
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch from K8s API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  liveNodes: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/api/clusters/live/nodes', protect: true, tags: ['clusters'] },
    })
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(
      z.array(
        z.object({
          name: z.string().nullable().optional(),
          status: z.string(),
          roles: z.array(z.string()),
          version: z.string().nullable().optional(),
          os: z.string().nullable().optional(),
          arch: z.string().nullable().optional(),
          cpu: z.string().nullable().optional(),
          memory: z.string().nullable().optional(),
          pods: z.string(),
          createdAt: z.union([z.string(), z.date()]).nullable().optional(),
        }),
      ),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const nodesResponse = await cached(`k8s:${input.clusterId}:nodes`, K8S_CACHE_TTL, () => coreV1.listNode())
        return nodesResponse.items.map((node) => {
          const conditions = node.status?.conditions || []
          const ready = conditions.find((c) => c.type === 'Ready')
          return {
            name: node.metadata?.name,
            status: ready?.status === 'True' ? 'Ready' : 'NotReady',
            roles: Object.keys(node.metadata?.labels || {})
              .filter((l) => l.startsWith('node-role.kubernetes.io/'))
              .map((l) => l.replace('node-role.kubernetes.io/', '')),
            version: node.status?.nodeInfo?.kubeletVersion,
            os: node.status?.nodeInfo?.osImage,
            arch: node.status?.nodeInfo?.architecture,
            cpu: node.status?.capacity?.cpu,
            memory: node.status?.capacity?.memory,
            pods: `${node.status?.allocatable?.pods}`,
            createdAt: node.metadata?.creationTimestamp,
          }
        })
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch nodes from K8s API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  liveEvents: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/api/clusters/live/events', protect: true, tags: ['clusters'] },
    })
    .input(z.object({ clusterId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }))
    .output(
      z.array(
        z.object({
          type: z.string().nullable().optional(),
          reason: z.string().nullable().optional(),
          message: z.string().nullable().optional(),
          namespace: z.string().nullable().optional(),
          object: z.string(),
          count: z.number().nullable().optional(),
          lastSeen: z.union([z.string(), z.date()]).nullable().optional(),
        }),
      ),
    )
    .query(async ({ input }) => {
      try {
        const limit = input.limit ?? 50
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const eventsResponse = await cached(`k8s:${input.clusterId}:events`, K8S_CACHE_TTL, () =>
          coreV1.listEventForAllNamespaces(),
        )
        return eventsResponse.items
          .sort(
            (a, b) =>
              new Date(((b.lastTimestamp || b.metadata?.creationTimestamp) as unknown as string) ?? 0).getTime() -
              new Date(((a.lastTimestamp || a.metadata?.creationTimestamp) as unknown as string) ?? 0).getTime(),
          )
          .slice(0, limit)
          .map((e) => ({
            type: e.type,
            reason: e.reason,
            message: e.message,
            namespace: e.metadata?.namespace,
            object: `${e.involvedObject?.kind}/${e.involvedObject?.name}`,
            count: e.count,
            lastSeen: e.lastTimestamp || e.metadata?.creationTimestamp,
          }))
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch events from K8s API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  liveStatus: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/api/clusters/live/status', protect: true, tags: ['clusters'] },
    })
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(
      z.object({
        version: z.string(),
        nodeCount: z.number().int(),
        podCount: z.number().int(),
        runningPods: z.number().int(),
        namespaceCount: z.number().int(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const versionApi = kc.makeApiClient(k8s.VersionApi)

        const cachePrefix = `k8s:${input.clusterId}`
        const [versionInfo, nodesRes, podsRes, nsRes] = await Promise.all([
          cached(`${cachePrefix}:version`, K8S_CACHE_TTL, () => versionApi.getCode()),
          cached(`${cachePrefix}:nodes`, K8S_CACHE_TTL, () => coreV1.listNode()),
          cached(`${cachePrefix}:pods`, K8S_CACHE_TTL, () => coreV1.listPodForAllNamespaces()),
          cached(`${cachePrefix}:namespaces`, K8S_CACHE_TTL, () => coreV1.listNamespace()),
        ])

        return {
          version: `v${versionInfo.major}.${versionInfo.minor}`,
          nodeCount: nodesRes.items.length,
          podCount: podsRes.items.length,
          runningPods: podsRes.items.filter((p) => p.status?.phase === 'Running').length,
          namespaceCount: nsRes.items.length,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch cluster status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  validateConnection: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/api/clusters/validate-connection',
        protect: true,
        tags: ['clusters'],
      },
    })
    .input(
      z.object({
        provider: providerSchema,
        endpoint: z.string().url().max(500).optional(),
        connectionConfig: z.record(z.string(), z.unknown()),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
        message: z.string(),
        context: z.string().optional(),
        version: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const connectionConfigSchemaByProvider = {
          kubeconfig: kubeconfigConnectionConfigSchema,
          'aws': awsConnectionConfigSchema,
          'azure': azureConnectionConfigSchema,
          'gke': gkeConnectionConfigSchema,
          minikube: minikubeConnectionConfigSchema,
        } as const

        const parsedConnectionConfig = connectionConfigSchemaByProvider[input.provider].safeParse(
          input.connectionConfig,
        )

        if (!parsedConnectionConfig.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid connectionConfig for selected provider',
          })
        }

        const result = await validateClusterConnection(input.provider, parsedConnectionConfig.data)
        return {
          success: result.reachable,
          message: result.message,
          context: result.context,
          version: result.version,
        }
      } catch (error) {
        throw mapValidateConnectionError(error)
      }
    }),

  invalidateCache: adminProcedure
    .meta({
      openapi: { method: 'POST', path: '/api/clusters/cache/invalidate', protect: true, tags: ['clusters'] },
    })
    .input(z.void())
    .output(z.object({ invalidated: z.number().int() }))
    .mutation(async () => {
      const count = await invalidateK8sCache()
      return { invalidated: count }
    }),

  create: adminProcedure
    .meta({ openapi: { method: 'POST', path: '/api/clusters', protect: true, tags: ['clusters'] } })
    .input(
      z.object({
        name: z.string().min(1).max(255),
        provider: providerSchema,
        environment: environmentSchema.optional(),
        endpoint: z.string().url().max(500).optional(),
        connectionConfig: connectionConfigSchema.optional(),
        status: z.string().max(50).optional(),
        healthStatus: healthStatusSchema.optional(),
        lastHealthCheck: z.union([z.string().datetime(), z.date()]).optional(),
        nodesCount: z.number().int().min(0).optional(),
      }),
    )
    .output(clusterSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.connectionConfig !== undefined) {
        const parsed = providerConnectionInputSchema.safeParse({
          provider: input.provider,
          connectionConfig: input.connectionConfig,
        })
        if (!parsed.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid connectionConfig for selected provider',
          })
        }
      }

      const parsedLastHealthCheck = parseOptionalDateInput(input.lastHealthCheck, 'lastHealthCheck')

      const [created] = await ctx.db
        .insert(clusters)
        .values({
          name: input.name,
          provider: normalizeProvider(input.provider),
          environment: input.environment ?? 'development',
          endpoint: input.endpoint ?? null,
          connectionConfig: encryptConnectionConfig(input.connectionConfig ?? {}),
          status: input.status ?? 'unreachable',
          healthStatus: input.healthStatus ?? 'unknown',
          lastHealthCheck: parsedLastHealthCheck,
          nodesCount: input.nodesCount ?? 0,
        })
        .returning()
      await logAudit(ctx, 'cluster.create', 'cluster', created.id, {
        name: input.name,
        provider: input.provider,
      })
      return created
    }),

  update: adminProcedure
    .meta({ openapi: { method: 'PATCH', path: '/api/clusters/{id}', protect: true, tags: ['clusters'] } })
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        provider: providerSchema.optional(),
        environment: environmentSchema.optional(),
        endpoint: z.string().url().max(500).nullable().optional(),
        connectionConfig: connectionConfigSchema.optional(),
        status: z.string().max(50).optional(),
        healthStatus: healthStatusSchema.optional(),
        lastHealthCheck: z.union([z.string().datetime(), z.date()]).nullable().optional(),
        version: z.string().max(50).optional(),
        nodesCount: z.number().int().min(0).optional(),
      }),
    )
    .output(clusterSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const [existing] = await ctx.db.select().from(clusters).where(eq(clusters.id, id))
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })

      if (data.connectionConfig !== undefined) {
        const effectiveProvider = data.provider ?? existing.provider
        const parsed = providerConnectionInputSchema.safeParse({
          provider: effectiveProvider,
          connectionConfig: data.connectionConfig,
        })
        if (!parsed.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid connectionConfig for selected provider',
          })
        }
      }

      const updates: Record<string, unknown> = {}
      if (data.name !== undefined) updates.name = data.name
      if (data.provider !== undefined) updates.provider = normalizeProvider(data.provider)
      if (data.environment !== undefined) updates.environment = data.environment
      if (data.endpoint !== undefined) updates.endpoint = data.endpoint
      if (data.connectionConfig !== undefined) {
        updates.connectionConfig = encryptConnectionConfig(data.connectionConfig)
      }
      if (data.status !== undefined) updates.status = data.status
      if (data.healthStatus !== undefined) updates.healthStatus = data.healthStatus
      if (data.lastHealthCheck !== undefined) {
        updates.lastHealthCheck = parseOptionalDateInput(data.lastHealthCheck, 'lastHealthCheck')
      }
      if (data.version !== undefined) updates.version = data.version
      if (data.nodesCount !== undefined) updates.nodesCount = data.nodesCount
      const [updated] = await ctx.db.update(clusters).set(updates).where(eq(clusters.id, id)).returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
      clusterClientPool.invalidate(id)
      await logAudit(ctx, 'cluster.update', 'cluster', id, data)
      return updated
    }),

  delete: adminProcedure
    .meta({
      openapi: { method: 'DELETE', path: '/api/clusters/{id}', protect: true, tags: ['clusters'] },
    })
    .input(z.object({ id: z.string().uuid() }))
    .output(clusterSchema)
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(clusters).where(eq(clusters.id, input.id)).returning()
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
      clusterClientPool.invalidate(input.id)
      await logAudit(ctx, 'cluster.delete', 'cluster', input.id, { name: deleted.name })
      return deleted
    }),
})
