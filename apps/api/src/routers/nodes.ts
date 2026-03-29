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
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)

        const nodesResponse = await cached(CACHE_KEYS.k8sNodes(input.clusterId), 15, () =>
          coreV1.listNode(),
        )

        // Fetch node metrics for CPU/Memory usage
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

        return nodesResponse.items.map((node) => {
          const name = node.metadata?.name ?? ''
          const metrics = nodeMetricsMap.get(name)

          // Parse capacity and allocatable
          const cpuCapacityNano = parseCpuToNano(node.status?.capacity?.cpu ?? '0')
          const cpuAllocatableNano = parseCpuToNano(node.status?.allocatable?.cpu ?? '0')
          const memCapacityBytes = parseMemToBytes(node.status?.capacity?.memory ?? '0')
          const memAllocatableBytes = parseMemToBytes(node.status?.allocatable?.memory ?? '0')
          const podsCapacity = Number.parseInt(node.status?.capacity?.pods ?? '0', 10) || 0
          const podsAllocatable = Number.parseInt(node.status?.allocatable?.pods ?? '0', 10) || 0
          const ephStorageCapacity = parseMemToBytes(
            node.status?.capacity?.['ephemeral-storage'] ?? '0',
          )
          const ephStorageAllocatable = parseMemToBytes(
            node.status?.allocatable?.['ephemeral-storage'] ?? '0',
          )

          // Calculate usage percentages
          const cpuPercent =
            metrics && cpuAllocatableNano > 0
              ? Math.round((metrics.cpuNano / cpuAllocatableNano) * 1000) / 10
              : null
          const memPercent =
            metrics && memAllocatableBytes > 0
              ? Math.round((metrics.memBytes / memAllocatableBytes) * 1000) / 10
              : null

          // Conditions
          const conditions = (node.status?.conditions ?? []).map((c) => ({
            type: c.type ?? '',
            status: c.status ?? 'Unknown',
            reason: c.reason ?? undefined,
            message: c.message ?? undefined,
            lastTransitionTime: c.lastTransitionTime
              ? new Date(c.lastTransitionTime as unknown as string).toISOString()
              : undefined,
          }))

          // Taints
          const taints = (node.spec?.taints ?? []).map((t) => ({
            key: t.key ?? '',
            value: t.value ?? '',
            effect: t.effect ?? '',
          }))

          // Addresses
          const addresses = (node.status?.addresses ?? []).map((a) => ({
            type: a.type ?? '',
            address: a.address ?? '',
          }))

          return {
            name,
            status:
              node.status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True'
                ? 'Ready'
                : 'NotReady',
            role:
              node.metadata?.labels?.['node-role.kubernetes.io/control-plane'] !== undefined
                ? 'control-plane'
                : 'worker',
            kubeletVersion: node.status?.nodeInfo?.kubeletVersion ?? '',
            os: node.status?.nodeInfo?.osImage ?? '',
            cpuCapacityMillis: Math.round(cpuCapacityNano / 1_000_000),
            cpuAllocatableMillis: Math.round(cpuAllocatableNano / 1_000_000),
            memCapacityMi: Math.round(memCapacityBytes / (1024 * 1024)),
            memAllocatableMi: Math.round(memAllocatableBytes / (1024 * 1024)),
            podsCapacity,
            podsAllocatable,
            ephStorageCapacityGi: Math.round(ephStorageCapacity / (1024 * 1024 * 1024)),
            ephStorageAllocatableGi: Math.round(ephStorageAllocatable / (1024 * 1024 * 1024)),
            cpuUsageMillis: metrics ? Math.round(metrics.cpuNano / 1_000_000) : null,
            memUsageMi: metrics ? Math.round(metrics.memBytes / (1024 * 1024)) : null,
            cpuPercent,
            memPercent,
            labels: (node.metadata?.labels as Record<string, string>) ?? {},
            taints,
            conditions,
            addresses,
          }
        })
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
