import { TRPCError } from '@trpc/server'
import { clusters, healthHistory } from '@voyager/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getCoreV1Api } from '../lib/k8s'
import { protectedProcedure, router } from '../trpc'

const HEALTH_STATUS = ['healthy', 'degraded', 'critical', 'unknown'] as const
type HealthStatus = (typeof HEALTH_STATUS)[number]

const healthHistorySchema = z
  .object({
    id: z.string(),
    clusterId: z.string(),
    status: z.string(),
    responseTimeMs: z.number().int().nullable(),
    details: z.unknown().nullable().optional(),
    checkedAt: z.union([z.string(), z.date()]),
  })
  .passthrough()

async function performK8sHealthCheck(): Promise<{
  status: HealthStatus
  responseTimeMs: number
  details: Record<string, unknown>
}> {
  const start = Date.now()
  try {
    const coreApi = getCoreV1Api()
    const [nodesRes, podsRes] = await Promise.all([coreApi.listNode(), coreApi.listPodForAllNamespaces()])

    const responseTimeMs = Date.now() - start

    const totalNodes = nodesRes.items.length
    const readyNodes = nodesRes.items.filter(
      (n) => n.status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True',
    ).length

    const totalPods = podsRes.items.length
    const runningPods = podsRes.items.filter((p) => p.status?.phase === 'Running').length
    const podHealthRatio = totalPods > 0 ? runningPods / totalPods : 1

    let status: HealthStatus = 'healthy'
    if (readyNodes < totalNodes || podHealthRatio < 0.8) {
      status = 'degraded'
    }
    if (readyNodes === 0 || podHealthRatio < 0.5) {
      status = 'critical'
    }

    return {
      status,
      responseTimeMs,
      details: {
        totalNodes,
        readyNodes,
        totalPods,
        runningPods,
        podHealthRatio: Math.round(podHealthRatio * 100),
      },
    }
  } catch (error) {
    return {
      status: 'critical',
      responseTimeMs: Date.now() - start,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    }
  }
}

export const healthRouter = router({
  check: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/api/health/check/{clusterId}', protect: true, tags: ['health'] } })
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(healthHistorySchema)
    .query(async ({ ctx, input }) => {
      const [cluster] = await ctx.db.select().from(clusters).where(eq(clusters.id, input.clusterId))
      if (!cluster) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
      }

      const isMinikube = cluster.provider === 'minikube'
      const result = isMinikube
        ? await performK8sHealthCheck()
        : {
            status: 'unknown' as HealthStatus,
            responseTimeMs: 0,
            details: { reason: 'No live connection for DB-only clusters' },
          }

      const [entry] = await ctx.db
        .insert(healthHistory)
        .values({
          clusterId: input.clusterId,
          status: result.status,
          responseTimeMs: result.responseTimeMs,
          details: JSON.stringify(result.details),
        })
        .returning()

      return entry
    }),

  history: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/api/health/history/{clusterId}', protect: true, tags: ['health'] } })
    .input(z.object({ clusterId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }))
    .output(z.array(healthHistorySchema))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(healthHistory)
        .where(eq(healthHistory.clusterId, input.clusterId))
        .orderBy(desc(healthHistory.checkedAt))
        .limit(input.limit ?? 50)
      return rows.map((r) => ({
        ...r,
        details: r.details ? JSON.parse(r.details) : null,
      }))
    }),

  status: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/api/health/status', protect: true, tags: ['health'] } })
    .input(z.object({}))
    .output(
      z.array(
        z.object({
          clusterId: z.string(),
          clusterName: z.string(),
          provider: z.string(),
          status: z.string(),
          checkedAt: z.union([z.string(), z.date()]).nullable(),
          responseTimeMs: z.number().int().nullable(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const allClusters = await ctx.db.select().from(clusters)
      if (allClusters.length === 0) return []

      const allLatest = await ctx.db
        .selectDistinctOn([healthHistory.clusterId])
        .from(healthHistory)
        .orderBy(healthHistory.clusterId, desc(healthHistory.checkedAt))

      const latestMap = new Map<string, (typeof allLatest)[0]>()
      for (const entry of allLatest) {
        if (!latestMap.has(entry.clusterId)) {
          latestMap.set(entry.clusterId, entry)
        }
      }

      return allClusters.map((cluster) => {
        const latest = latestMap.get(cluster.id)
        return {
          clusterId: cluster.id,
          clusterName: cluster.name,
          provider: cluster.provider,
          status: (latest?.status ?? 'unknown') as HealthStatus,
          checkedAt: latest?.checkedAt ?? null,
          responseTimeMs: latest?.responseTimeMs ?? null,
        }
      })
    }),
})
