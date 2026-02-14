import { TRPCError } from '@trpc/server'
import { clusters, nodes } from '@voyager/db'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { cached, invalidateK8sCache } from '../lib/cache'
import { getAppsV1Api, getCoreV1Api, getVersionApi } from '../lib/k8s'
import { normalizeProvider } from '../lib/providers'

const K8S_CACHE_TTL = 30 // seconds
import { adminProcedure, protectedProcedure, router } from '../trpc'

export const clustersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const allClusters = await ctx.db.select().from(clusters)
    const nodeCounts = await ctx.db
      .select({
        clusterId: nodes.clusterId,
        count: count().as('count'),
      })
      .from(nodes)
      .groupBy(nodes.clusterId)
    const countMap = new Map(nodeCounts.map((n) => [n.clusterId, n.count]))
    return allClusters.map((c) => ({
      ...c,
      nodeCount: countMap.get(c.id) ?? 0,
    }))
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [cluster] = await ctx.db.select().from(clusters).where(eq(clusters.id, input.id))
      if (!cluster) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
      const clusterNodes = await ctx.db.select().from(nodes).where(eq(nodes.clusterId, input.id))
      return { ...cluster, nodes: clusterNodes }
    }),

  live: protectedProcedure.query(async () => {
    try {
      const [
        versionInfo,
        nodesResponse,
        podsResponse,
        nsResponse,
        eventsResponse,
        deploymentsResponse,
      ] = await Promise.all([
        cached('k8s:version', K8S_CACHE_TTL, () => getVersionApi().getCode()),
        cached('k8s:nodes', K8S_CACHE_TTL, () => getCoreV1Api().listNode()),
        cached('k8s:pods', K8S_CACHE_TTL, () => getCoreV1Api().listPodForAllNamespaces()),
        cached('k8s:namespaces', K8S_CACHE_TTL, () => getCoreV1Api().listNamespace()),
        cached('k8s:events', K8S_CACHE_TTL, () => getCoreV1Api().listEventForAllNamespaces()),
        cached('k8s:deployments', K8S_CACHE_TTL, () =>
          getAppsV1Api().listDeploymentForAllNamespaces(),
        ),
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

      const namespaces = nsResponse.items.map((ns) => ns.metadata?.name).filter(Boolean)

      const events = eventsResponse.items
        .sort((a, b) => {
          const aTime = (a.lastTimestamp || a.metadata?.creationTimestamp) as unknown as
            | string
            | undefined
          const bTime = (b.lastTimestamp || b.metadata?.creationTimestamp) as unknown as
            | string
            | undefined
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
        name: 'minikube',
        provider: 'minikube',
        version: `v${versionInfo.major}.${versionInfo.minor}`,
        status,
        nodes: k8sNodes,
        totalPods,
        runningPods,
        namespaces,
        events,
        deployments,
        endpoint: 'https://192.168.49.2:8443',
      }
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to fetch from K8s API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }),

  liveNodes: protectedProcedure.query(async () => {
    try {
      const nodesResponse = await cached('k8s:nodes', K8S_CACHE_TTL, () =>
        getCoreV1Api().listNode(),
      )
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
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      try {
        const limit = input?.limit ?? 50
        const eventsResponse = await cached('k8s:events', K8S_CACHE_TTL, () =>
          getCoreV1Api().listEventForAllNamespaces(),
        )
        return eventsResponse.items
          .sort(
            (a, b) =>
              new Date(
                ((b.lastTimestamp || b.metadata?.creationTimestamp) as unknown as string) ?? 0,
              ).getTime() -
              new Date(
                ((a.lastTimestamp || a.metadata?.creationTimestamp) as unknown as string) ?? 0,
              ).getTime(),
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

  invalidateCache: adminProcedure.mutation(async () => {
    const count = await invalidateK8sCache()
    return { invalidated: count }
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        provider: z.string().min(1).max(50),
        endpoint: z.string().url().max(500),
        status: z.string().max(50).optional(),
        nodesCount: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(clusters)
        .values({
          ...input,
          provider: normalizeProvider(input.provider),
          status: input.status ?? 'unreachable',
          nodesCount: input.nodesCount ?? 0,
        })
        .returning()
      return created
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        provider: z.string().min(1).max(50).optional(),
        endpoint: z.string().url().max(500).optional(),
        status: z.string().max(50).optional(),
        version: z.string().max(50).optional(),
        nodesCount: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updates: Record<string, unknown> = {}
      if (data.name !== undefined) updates.name = data.name
      if (data.provider !== undefined) updates.provider = normalizeProvider(data.provider)
      if (data.endpoint !== undefined) updates.endpoint = data.endpoint
      if (data.status !== undefined) updates.status = data.status
      if (data.version !== undefined) updates.version = data.version
      if (data.nodesCount !== undefined) updates.nodesCount = data.nodesCount
      const [updated] = await ctx.db
        .update(clusters)
        .set(updates)
        .where(eq(clusters.id, id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
      return updated
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(clusters).where(eq(clusters.id, input.id)).returning()
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
      return deleted
    }),
})
