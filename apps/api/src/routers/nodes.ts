import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { LIMITS } from '@voyager/config'
import { nodes } from '@voyager/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'
import { mapNode } from '../lib/resource-mappers.js'
import { watchManager } from '../lib/watch-manager.js'
import { adminProcedure, authorizedProcedure, protectedProcedure, router } from '../trpc.js'

export const nodesRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(nodes).where(eq(nodes.clusterId, input.clusterId))
    }),

  listLive: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)

        // Fetch node metrics separately (Metrics API is NOT watchable)
        const nodeMetricsMap = new Map<string, { cpuNano: number; memBytes: number }>()
        try {
          const metricsClient = new k8s.Metrics(kc)
          const nodeMetrics = await cached(CACHE_KEYS.k8sNodeMetrics(input.clusterId), 15, () =>
            metricsClient.getNodeMetrics(),
          )
          for (const nm of nodeMetrics.items) {
            const name = nm.metadata?.name
            if (!name) continue
            nodeMetricsMap.set(name, {
              cpuNano: parseCpuToNano(nm.usage?.cpu ?? '0'),
              memBytes: parseMemToBytes(nm.usage?.memory ?? '0'),
            })
          }
        } catch {
          // metrics-server may not be available
        }

        // Read nodes from WatchManager in-memory store when available
        if (watchManager.isWatching(input.clusterId)) {
          const rawNodes = watchManager.getResources(input.clusterId, 'nodes') as k8s.V1Node[]
          return rawNodes.map((node) => mapNode(node, nodeMetricsMap))
        }

        // Fallback: fetch from K8s API via cached()
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const nodesResponse = await cached(CACHE_KEYS.k8sNodes(input.clusterId), 15, () =>
          coreV1.listNode(),
        )
        return nodesResponse.items.map((node) => mapNode(node, nodeMetricsMap))
      } catch (err) {
        handleK8sError(err, 'list nodes live')
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [node] = await ctx.db.select().from(nodes).where(eq(nodes.id, input.id))
      if (!node) throw new TRPCError({ code: 'NOT_FOUND', message: 'Node not found' })
      return node
    }),

  upsert: adminProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        name: z.string().min(1).max(LIMITS.NAME_MAX),
        status: z.string().max(LIMITS.STATUS_MAX).optional(),
        role: z.string().max(LIMITS.STATUS_MAX).optional(),
        cpuCapacity: z.number().int().optional(),
        cpuAllocatable: z.number().int().optional(),
        memoryCapacity: z.number().optional(),
        memoryAllocatable: z.number().optional(),
        podsCount: z.number().int().optional(),
        k8sVersion: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(nodes)
        .where(and(eq(nodes.clusterId, input.clusterId), eq(nodes.name, input.name)))
      if (existing.length > 0) {
        const [updated] = await ctx.db
          .update(nodes)
          .set(input)
          .where(eq(nodes.id, existing[0].id))
          .returning()
        return updated
      }
      const [created] = await ctx.db.insert(nodes).values(input).returning()
      return created
    }),
})
