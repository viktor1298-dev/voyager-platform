import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import {
  clusters as clustersTable,
  db,
  healthHistory,
  metricsHistory,
  events,
} from '@voyager/db'
import { protectedProcedure, router } from '../trpc.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'
import { eq, gte, and, sql, avg, sum } from 'drizzle-orm'

/** Shared constant for health-check polling interval (minutes) */
const HEALTH_CHECK_INTERVAL_MINUTES = 5

const timeRangeSchema = z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h')

type TimeRange = z.infer<typeof timeRangeSchema>

/** Interval configuration per time range */
const TIME_RANGE_CONFIG: Record<TimeRange, { intervalMs: number; points: number }> = {
  '1h': { intervalMs: 60 * 1000, points: 60 },
  '6h': { intervalMs: 5 * 60 * 1000, points: 72 },
  '24h': { intervalMs: 60 * 60 * 1000, points: 24 },
  '7d': { intervalMs: 6 * 60 * 60 * 1000, points: 28 },
  '30d': { intervalMs: 24 * 60 * 60 * 1000, points: 30 },
} as const

function getTimeRangeStart(range: TimeRange): Date {
  const { intervalMs, points } = TIME_RANGE_CONFIG[range]
  return new Date(Date.now() - intervalMs * points)
}

function bucketTimestamp(ts: Date, intervalMs: number, start: number): string {
  const bucket = Math.floor((ts.getTime() - start) / intervalMs)
  return new Date(start + (bucket + 1) * intervalMs).toISOString()
}

export const metricsRouter = router({
  /** IP2-003: Cluster health timeline from healthHistory table */
  clusterHealth: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const { intervalMs, points } = TIME_RANGE_CONFIG[input.range]
      const start = getTimeRangeStart(input.range)

      const rows = await db
        .select()
        .from(healthHistory)
        .where(gte(healthHistory.checkedAt, start))
        .orderBy(healthHistory.checkedAt)

      if (rows.length === 0) return []

      const startMs = start.getTime()
      const buckets = new Map<string, { healthy: number; degraded: number; offline: number; total: number }>()

      for (const row of rows) {
        const ts = bucketTimestamp(new Date(row.checkedAt), intervalMs, startMs)
        if (!buckets.has(ts)) buckets.set(ts, { healthy: 0, degraded: 0, offline: 0, total: 0 })
        const b = buckets.get(ts)!
        b.total++
        if (row.status === 'healthy') b.healthy++
        else if (row.status === 'degraded') b.degraded++
        else b.offline++
      }

      return Array.from(buckets.entries()).map(([timestamp, b]) => ({
        timestamp,
        healthy: b.total > 0 ? Math.round((b.healthy / b.total) * 100) : 0,
        degraded: b.total > 0 ? Math.round((b.degraded / b.total) * 100) : 0,
        offline: b.total > 0 ? Math.round((b.offline / b.total) * 100) : 0,
      }))
    }),

  /** IP2-004: Resource usage timeline from metricsHistory table */
  resourceUsage: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const { intervalMs } = TIME_RANGE_CONFIG[input.range]
      const start = getTimeRangeStart(input.range)

      const rows = await db
        .select()
        .from(metricsHistory)
        .where(gte(metricsHistory.timestamp, start))
        .orderBy(metricsHistory.timestamp)

      if (rows.length === 0) return []

      const startMs = start.getTime()
      const buckets = new Map<string, { cpuSum: number; memSum: number; count: number }>()

      for (const row of rows) {
        const ts = bucketTimestamp(new Date(row.timestamp), intervalMs, startMs)
        if (!buckets.has(ts)) buckets.set(ts, { cpuSum: 0, memSum: 0, count: 0 })
        const b = buckets.get(ts)!
        b.cpuSum += row.cpuPercent
        b.memSum += row.memPercent
        b.count++
      }

      return Array.from(buckets.entries()).map(([timestamp, b]) => ({
        timestamp,
        cpu: Math.round(b.cpuSum / b.count),
        memory: Math.round(b.memSum / b.count),
      }))
    }),

  /** IP2-005: Uptime history from healthHistory records */
  uptimeHistory: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const start = getTimeRangeStart(input.range)

      const rows = await db
        .select({
          clusterId: healthHistory.clusterId,
          status: healthHistory.status,
        })
        .from(healthHistory)
        .where(gte(healthHistory.checkedAt, start))

      if (rows.length === 0) return []

      // Group by cluster
      const clusterStats = new Map<string, { total: number; healthy: number }>()
      for (const row of rows) {
        if (!clusterStats.has(row.clusterId)) clusterStats.set(row.clusterId, { total: 0, healthy: 0 })
        const s = clusterStats.get(row.clusterId)!
        s.total++
        if (row.status === 'healthy') s.healthy++
      }

      // Get cluster names
      const clusterList = await db
        .select({ id: clustersTable.id, name: clustersTable.name })
        .from(clustersTable)

      const nameMap = new Map(clusterList.map((c) => [c.id, c.name]))

      return Array.from(clusterStats.entries()).map(([clusterId, stats]) => {
        const uptime = +(stats.healthy / stats.total * 100).toFixed(2)
        const totalMinutes = stats.total * HEALTH_CHECK_INTERVAL_MINUTES
        const downMinutes = Math.round((stats.total - stats.healthy) * HEALTH_CHECK_INTERVAL_MINUTES)
        return {
          cluster: nameMap.get(clusterId) ?? clusterId,
          uptime,
          downtime: downMinutes,
        }
      })
    }),

  /** IP2-006: Alerts timeline from events table (Warning-type K8s events) */
  alertsTimeline: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const start = getTimeRangeStart(input.range)

      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.kind, 'Warning'), gte(events.timestamp, start)))
        .orderBy(events.timestamp)

      if (rows.length === 0) return []

      // Map reason → severity heuristic
      const getSeverity = (reason: string | null): string => {
        if (!reason) return 'warning'
        const r = reason.toLowerCase()
        if (r.includes('oom') || r.includes('crashloop') || r.includes('failed')) return 'critical'
        if (r.includes('backoff') || r.includes('unhealthy') || r.includes('evict')) return 'warning'
        return 'info'
      }

      return rows.map((row) => ({
        timestamp: new Date(row.timestamp).toISOString(),
        severity: getSeverity(row.reason),
        type: row.reason ?? 'Unknown',
        count: 1,
      }))
    }),

  /**
   * Current snapshot of CPU/memory usage from the live K8s metrics-server.
   * Falls back to null values when metrics-server is unavailable.
   * Includes error/status info so frontend can display meaningful messages.
   */
  currentStats: protectedProcedure
    .query(async () => {
      const TIMEOUT_MS = 20_000
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Metrics collection timed out')), TIMEOUT_MS),
      )

      try {
        const result = await Promise.race([
          (async () => {
            const allClusters = await db.select({ id: clustersTable.id }).from(clustersTable)

            let totalCpuNano = 0
            let totalMemBytes = 0
            let totalCpuAllocatable = 0
            let totalMemAllocatable = 0
            let totalPodCount = 0
            let hasData = false
            const errors: string[] = []

            for (const cluster of allClusters) {
              try {
                const kc = await clusterClientPool.getClient(cluster.id)
                const coreApi = kc.makeApiClient(k8s.CoreV1Api)
                const metricsClient = new k8s.Metrics(kc)

                const [nodeMetrics, nodesResponse] = await Promise.all([
                  metricsClient.getNodeMetrics(),
                  coreApi.listNode(),
                ])

                const capacityMap = new Map<string, { cpuNano: number; memBytes: number }>()
                for (const node of nodesResponse.items) {
                  const name = node.metadata?.name
                  if (name) {
                    capacityMap.set(name, {
                      cpuNano: parseCpuToNano(node.status?.allocatable?.cpu ?? '0'),
                      memBytes: parseMemToBytes(node.status?.allocatable?.memory ?? '0'),
                    })
                  }
                }

                for (const node of nodeMetrics.items) {
                  totalCpuNano += parseCpuToNano(node.usage?.cpu ?? '0')
                  totalMemBytes += parseMemToBytes(node.usage?.memory ?? '0')
                  const cap = capacityMap.get(node.metadata?.name ?? '')
                  if (cap) {
                    totalCpuAllocatable += cap.cpuNano
                    totalMemAllocatable += cap.memBytes
                  }
                }

                try {
                  const pods = await coreApi.listPodForAllNamespaces()
                  totalPodCount += pods.items?.length ?? 0
                } catch { /* ignore */ }

                hasData = true
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                if (msg.includes('403')) {
                  errors.push(`Cluster ${cluster.id}: metrics-server access denied (RBAC)`)
                } else if (msg.includes('Zod')) {
                  errors.push(`Cluster ${cluster.id}: invalid credentials`)
                } else {
                  errors.push(`Cluster ${cluster.id}: ${msg.slice(0, 100)}`)
                }
              }
            }

            if (!hasData) {
              return {
                cpuPercent: null, memoryPercent: null,
                cpuCores: null, memoryBytes: null,
                podCount: 0, timestamp: new Date().toISOString(),
                status: 'unavailable' as const,
                message: errors.length > 0
                  ? `Metrics unavailable: ${errors.join('; ')}`
                  : 'No clusters returned metrics data. Metrics server may not be available.',
              }
            }

            return {
              cpuPercent: totalCpuAllocatable > 0
                ? Math.round((totalCpuNano / totalCpuAllocatable) * 1000) / 10
                : null,
              memoryPercent: totalMemAllocatable > 0
                ? Math.round((totalMemBytes / totalMemAllocatable) * 1000) / 10
                : null,
              cpuCores: totalCpuNano / 1e9,
              memoryBytes: totalMemBytes,
              podCount: totalPodCount,
              timestamp: new Date().toISOString(),
              status: 'ok' as const,
              message: errors.length > 0 ? `Partial: ${errors.join('; ')}` : null,
            }
          })(),
          timeoutPromise,
        ])

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return {
          cpuPercent: null, memoryPercent: null,
          cpuCores: null, memoryBytes: null,
          podCount: 0, timestamp: new Date().toISOString(),
          status: 'error' as const,
          message: msg.includes('timed out')
            ? 'Metrics collection timed out. Metrics server may not be responding.'
            : `Metrics error: ${msg}`,
        }
      }
    }),

  /** M-P3-002: Per-cluster time-series from metricsHistory, bucketed by range */
  history: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), range: timeRangeSchema }))
    .query(async ({ input }) => {
      const { intervalMs } = TIME_RANGE_CONFIG[input.range]
      const start = getTimeRangeStart(input.range)

      const rows = await db
        .select()
        .from(metricsHistory)
        .where(and(
          eq(metricsHistory.clusterId, input.clusterId),
          gte(metricsHistory.timestamp, start),
        ))
        .orderBy(metricsHistory.timestamp)

      if (rows.length === 0) return []

      const startMs = start.getTime()
      const buckets = new Map<string, {
        cpuSum: number; memSum: number; podSum: number
        netInSum: number; netOutSum: number; count: number
      }>()

      for (const row of rows) {
        const ts = bucketTimestamp(new Date(row.timestamp), intervalMs, startMs)
        if (!buckets.has(ts)) buckets.set(ts, { cpuSum: 0, memSum: 0, podSum: 0, netInSum: 0, netOutSum: 0, count: 0 })
        const b = buckets.get(ts)!
        b.cpuSum += row.cpuPercent
        b.memSum += row.memPercent
        b.podSum += row.podCount
        b.netInSum += row.networkBytesIn ?? 0
        b.netOutSum += row.networkBytesOut ?? 0
        b.count++
      }

      return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([timestamp, b]) => ({
          timestamp,
          cpu: Math.round(b.cpuSum / b.count * 10) / 10,
          memory: Math.round(b.memSum / b.count * 10) / 10,
          pods: Math.round(b.podSum / b.count),
          networkBytesIn: Math.round(b.netInSum / b.count),
          networkBytesOut: Math.round(b.netOutSum / b.count),
        }))
    }),

  /** M-P3-002: Live per-node resource snapshot from K8s metrics-server */
  nodeBreakdown: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      const TIMEOUT_MS = 15_000
      try {
        const result = await Promise.race([
          (async () => {
            const kc = await clusterClientPool.getClient(input.clusterId)
            const coreApi = kc.makeApiClient(k8s.CoreV1Api)
            const metricsClient = new k8s.Metrics(kc)

            const [nodeMetrics, nodesResponse] = await Promise.all([
              metricsClient.getNodeMetrics(),
              coreApi.listNode(),
            ])

            const capacityMap = new Map<string, { cpuNano: number; memBytes: number; cpuAllocNano: number; memAllocBytes: number }>()
            for (const node of nodesResponse.items) {
              const name = node.metadata?.name
              if (name) {
                capacityMap.set(name, {
                  cpuNano: parseCpuToNano(node.status?.capacity?.cpu ?? '0'),
                  memBytes: parseMemToBytes(node.status?.capacity?.memory ?? '0'),
                  cpuAllocNano: parseCpuToNano(node.status?.allocatable?.cpu ?? '0'),
                  memAllocBytes: parseMemToBytes(node.status?.allocatable?.memory ?? '0'),
                })
              }
            }

            return nodeMetrics.items.map((node) => {
              const name = node.metadata?.name ?? 'unknown'
              const usedCpuNano = parseCpuToNano(node.usage?.cpu ?? '0')
              const usedMemBytes = parseMemToBytes(node.usage?.memory ?? '0')
              const cap = capacityMap.get(name)

              const cpuPercent = cap && cap.cpuAllocNano > 0
                ? Math.round((usedCpuNano / cap.cpuAllocNano) * 1000) / 10
                : null
              const memPercent = cap && cap.memAllocBytes > 0
                ? Math.round((usedMemBytes / cap.memAllocBytes) * 1000) / 10
                : null

              return {
                name,
                cpuPercent,
                memPercent,
                cpuCores: +(usedCpuNano / 1e9).toFixed(2),
                memGb: +(usedMemBytes / (1024 ** 3)).toFixed(2),
                cpuAllocCores: cap ? +(cap.cpuAllocNano / 1e9).toFixed(2) : null,
                memAllocGb: cap ? +(cap.memAllocBytes / (1024 ** 3)).toFixed(2) : null,
              }
            })
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Node breakdown timed out')), TIMEOUT_MS),
          ),
        ])
        return result
      } catch (err) {
        console.warn(`[metrics] nodeBreakdown failed for ${input.clusterId}:`, err instanceof Error ? err.message : err)
        return []
      }
    }),

  /** IP4-004: Multi-cluster metrics aggregation for dashboard */
  aggregatedMetrics: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const start = getTimeRangeStart(input.range)

      const rows = await db
        .select({
          clusterId: metricsHistory.clusterId,
          avgCpu: sql<number>`avg(${metricsHistory.cpuPercent})`.as('avg_cpu'),
          avgMem: sql<number>`avg(${metricsHistory.memPercent})`.as('avg_mem'),
          totalPods: sql<number>`max(${metricsHistory.podCount})`.as('total_pods'),
          totalNodes: sql<number>`max(${metricsHistory.nodeCount})`.as('total_nodes'),
        })
        .from(metricsHistory)
        .where(gte(metricsHistory.timestamp, start))
        .groupBy(metricsHistory.clusterId)

      // Get cluster names
      const clusterList = await db
        .select({ id: clustersTable.id, name: clustersTable.name })
        .from(clustersTable)
      const nameMap = new Map(clusterList.map((c) => [c.id, c.name]))

      const perCluster = rows.map((row) => ({
        clusterId: row.clusterId,
        clusterName: nameMap.get(row.clusterId) ?? row.clusterId,
        avgCpu: Math.round(Number(row.avgCpu) * 10) / 10,
        avgMem: Math.round(Number(row.avgMem) * 10) / 10,
        totalPods: Number(row.totalPods),
        totalNodes: Number(row.totalNodes),
      }))

      const totalClusters = perCluster.length
      const totalCpuAvg = totalClusters > 0
        ? Math.round(perCluster.reduce((s, c) => s + c.avgCpu, 0) / totalClusters * 10) / 10
        : 0
      const totalMemAvg = totalClusters > 0
        ? Math.round(perCluster.reduce((s, c) => s + c.avgMem, 0) / totalClusters * 10) / 10
        : 0
      const totalPods = perCluster.reduce((s, c) => s + c.totalPods, 0)
      const totalNodes = perCluster.reduce((s, c) => s + c.totalNodes, 0)

      return {
        summary: { totalCpuAvg, totalMemAvg, totalPods, totalNodes, clusterCount: totalClusters },
        perCluster,
      }
    }),
})
