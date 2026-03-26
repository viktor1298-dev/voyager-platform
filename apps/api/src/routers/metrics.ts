import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import {
  clusters as clustersTable,
  db,
  healthHistory,
  metricsHistory,
  nodeMetricsHistory,
  events,
} from '@voyager/db'
import { protectedProcedure, router } from '../trpc.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'
import { eq, gte, and, sql } from 'drizzle-orm'

/** Shared constant for health-check polling interval (minutes) */
const HEALTH_CHECK_INTERVAL_MINUTES = 5

const timeRangeSchema = z.enum(['30s', '1m', '5m', '1h', '6h', '24h', '7d', '30d']).default('24h')

type TimeRange = z.infer<typeof timeRangeSchema>

type BucketPoint<T> = {
  timestamp: string
  bucketStart: string
  bucketEnd: string
  value: T
}

type RangeConfig = {
  rangeMs: number
  intervalMs: number
}

/**
 * Grafana-style bucket configuration:
 * - response always includes all expected timestamps in range
 * - bucket timestamp is the bucket END time (stable x-axis tick / hover anchor)
 * - bucketStart/bucketEnd preserve exact boundaries for tooltip precision
 */
const TIME_RANGE_CONFIG: Record<TimeRange, RangeConfig> = {
  '30s': { rangeMs: 30 * 1000, intervalMs: 5 * 1000 },
  '1m': { rangeMs: 60 * 1000, intervalMs: 10 * 1000 },
  '5m': { rangeMs: 5 * 60 * 1000, intervalMs: 30 * 1000 },
  '1h': { rangeMs: 60 * 60 * 1000, intervalMs: 60 * 1000 },
  '6h': { rangeMs: 6 * 60 * 60 * 1000, intervalMs: 5 * 60 * 1000 },
  '24h': { rangeMs: 24 * 60 * 60 * 1000, intervalMs: 60 * 60 * 1000 },
  '7d': { rangeMs: 7 * 24 * 60 * 60 * 1000, intervalMs: 6 * 60 * 60 * 1000 },
  '30d': { rangeMs: 30 * 24 * 60 * 60 * 1000, intervalMs: 24 * 60 * 60 * 1000 },
} as const

function alignFloor(timestampMs: number, intervalMs: number): number {
  return Math.floor(timestampMs / intervalMs) * intervalMs
}

function getBucketTimeline(range: TimeRange, now = new Date()): { start: Date; end: Date; buckets: Array<{ bucketStartMs: number; bucketEndMs: number; timestamp: string; bucketStart: string; bucketEnd: string }> } {
  const { rangeMs, intervalMs } = TIME_RANGE_CONFIG[range]
  const endMs = alignFloor(now.getTime(), intervalMs)
  const startMs = endMs - rangeMs
  const bucketCount = Math.ceil(rangeMs / intervalMs)

  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStartMs = startMs + index * intervalMs
    const bucketEndMs = bucketStartMs + intervalMs
    return {
      bucketStartMs,
      bucketEndMs,
      timestamp: new Date(bucketEndMs).toISOString(),
      bucketStart: new Date(bucketStartMs).toISOString(),
      bucketEnd: new Date(bucketEndMs).toISOString(),
    }
  })

  return {
    start: new Date(startMs),
    end: new Date(endMs),
    buckets,
  }
}

function getBucketIndex(timestamp: Date | string, startMs: number, intervalMs: number, bucketCount: number): number {
  const timestampMs = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
  const index = Math.floor((timestampMs - startMs) / intervalMs)
  if (index < 0 || index >= bucketCount) return -1
  return index
}

function buildSeries<T>(
  timeline: ReturnType<typeof getBucketTimeline>,
  values: Array<T | null>,
): Array<BucketPoint<T | null>> {
  return timeline.buckets.map((bucket, index) => ({
    timestamp: bucket.timestamp,
    bucketStart: bucket.bucketStart,
    bucketEnd: bucket.bucketEnd,
    value: values[index] ?? null,
  }))
}

export const metricsRouter = router({
  /** IP2-003: Cluster health timeline from healthHistory table.
   *  Returns FULL time range with null-filled gaps (Grafana-style). */
  clusterHealth: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const timeline = getBucketTimeline(input.range)
      const { intervalMs } = TIME_RANGE_CONFIG[input.range]
      const startMs = timeline.start.getTime()
      const bucketCount = timeline.buckets.length

      const rows = await db
        .select()
        .from(healthHistory)
        .where(gte(healthHistory.checkedAt, timeline.start))
        .orderBy(healthHistory.checkedAt)

      const bucketStats = Array.from({ length: bucketCount }, () => ({
        healthy: 0,
        degraded: 0,
        offline: 0,
        total: 0,
      }))

      for (const row of rows) {
        const bucketIndex = getBucketIndex(new Date(row.checkedAt), startMs, intervalMs, bucketCount)
        if (bucketIndex === -1) continue

        const bucket = bucketStats[bucketIndex]!
        bucket.total++
        if (row.status === 'healthy') bucket.healthy++
        else if (row.status === 'degraded') bucket.degraded++
        else bucket.offline++
      }

      return timeline.buckets.map((bucket, index) => {
        const stats = bucketStats[index]!
        return {
          timestamp: bucket.timestamp,
          bucketStart: bucket.bucketStart,
          bucketEnd: bucket.bucketEnd,
          healthy: stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : null,
          degraded: stats.total > 0 ? Math.round((stats.degraded / stats.total) * 100) : null,
          offline: stats.total > 0 ? Math.round((stats.offline / stats.total) * 100) : null,
        }
      })
    }),

  /** IP2-004: Resource usage timeline from metricsHistory table.
   *  Returns FULL time range with null-filled gaps (Grafana-style). */
  resourceUsage: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const timeline = getBucketTimeline(input.range)
      const { intervalMs } = TIME_RANGE_CONFIG[input.range]
      const startMs = timeline.start.getTime()
      const bucketCount = timeline.buckets.length

      const rows = await db
        .select()
        .from(metricsHistory)
        .where(gte(metricsHistory.timestamp, timeline.start))
        .orderBy(metricsHistory.timestamp)

      const bucketStats = Array.from({ length: bucketCount }, () => ({
        cpuSum: 0,
        memSum: 0,
        count: 0,
      }))

      for (const row of rows) {
        const bucketIndex = getBucketIndex(new Date(row.timestamp), startMs, intervalMs, bucketCount)
        if (bucketIndex === -1) continue

        const bucket = bucketStats[bucketIndex]!
        bucket.cpuSum += row.cpuPercent
        bucket.memSum += row.memPercent
        bucket.count++
      }

      return timeline.buckets.map((bucket, index) => {
        const stats = bucketStats[index]!
        return {
          timestamp: bucket.timestamp,
          bucketStart: bucket.bucketStart,
          bucketEnd: bucket.bucketEnd,
          cpu: stats.count > 0 ? Math.round((stats.cpuSum / stats.count) * 10) / 10 : null,
          memory: stats.count > 0 ? Math.round((stats.memSum / stats.count) * 10) / 10 : null,
        }
      })
    }),

  /** IP2-005: Uptime history from healthHistory records */
  uptimeHistory: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const timeline = getBucketTimeline(input.range)

      const rows = await db
        .select({
          clusterId: healthHistory.clusterId,
          status: healthHistory.status,
        })
        .from(healthHistory)
        .where(gte(healthHistory.checkedAt, timeline.start))

      if (rows.length === 0) return []

      // Group by cluster
      const clusterStats = new Map<string, { total: number; healthy: number }>()
      for (const row of rows) {
        if (!clusterStats.has(row.clusterId)) clusterStats.set(row.clusterId, { total: 0, healthy: 0 })
        const stats = clusterStats.get(row.clusterId)!
        stats.total++
        if (row.status === 'healthy') stats.healthy++
      }

      const clusterList = await db
        .select({ id: clustersTable.id, name: clustersTable.name })
        .from(clustersTable)

      const nameMap = new Map(clusterList.map((cluster) => [cluster.id, cluster.name]))

      return Array.from(clusterStats.entries()).map(([clusterId, stats]) => {
        const uptime = +((stats.healthy / stats.total) * 100).toFixed(2)
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
      const timeline = getBucketTimeline(input.range)

      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.kind, 'Warning'), gte(events.timestamp, timeline.start)))
        .orderBy(events.timestamp)

      if (rows.length === 0) return []

      const getSeverity = (reason: string | null): 'critical' | 'warning' | 'info' => {
        if (!reason) return 'warning'
        const normalized = reason.toLowerCase()
        if (normalized.includes('oom') || normalized.includes('crashloop') || normalized.includes('failed')) return 'critical'
        if (normalized.includes('backoff') || normalized.includes('unhealthy') || normalized.includes('evict')) return 'warning'
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
      let timeoutHandle: NodeJS.Timeout | null = null
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Metrics collection timed out')), TIMEOUT_MS)
      })

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
                  const capacity = capacityMap.get(node.metadata?.name ?? '')
                  if (capacity) {
                    totalCpuAllocatable += capacity.cpuNano
                    totalMemAllocatable += capacity.memBytes
                  }
                }

                try {
                  const pods = await coreApi.listPodForAllNamespaces()
                  totalPodCount += pods.items?.length ?? 0
                } catch {
                  // ignore pod count failures
                }

                hasData = true
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                if (message.includes('403')) {
                  errors.push(`Cluster ${cluster.id}: metrics-server access denied (RBAC)`)
                } else if (message.includes('Zod')) {
                  errors.push(`Cluster ${cluster.id}: invalid credentials`)
                } else {
                  errors.push(`Cluster ${cluster.id}: ${message.slice(0, 100)}`)
                }
              }
            }

            if (!hasData) {
              return {
                cpuPercent: null,
                memoryPercent: null,
                cpuCores: null,
                memoryBytes: null,
                podCount: 0,
                timestamp: new Date().toISOString(),
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
        const message = err instanceof Error ? err.message : 'Unknown error'
        return {
          cpuPercent: null,
          memoryPercent: null,
          cpuCores: null,
          memoryBytes: null,
          podCount: 0,
          timestamp: new Date().toISOString(),
          status: 'error' as const,
          message: message.includes('timed out')
            ? 'Metrics collection timed out. Metrics server may not be responding.'
            : `Metrics error: ${message}`,
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }
    }),

  /** M-P3-002: Per-cluster time-series from metricsHistory, bucketed by range.
   *  Returns FULL time range with null-filled gaps (Grafana-style). */
  history: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), range: timeRangeSchema }))
    .query(async ({ input }) => {
      const timeline = getBucketTimeline(input.range)
      const { intervalMs } = TIME_RANGE_CONFIG[input.range]
      const startMs = timeline.start.getTime()
      const bucketCount = timeline.buckets.length

      const rows = await db
        .select()
        .from(metricsHistory)
        .where(and(
          eq(metricsHistory.clusterId, input.clusterId),
          gte(metricsHistory.timestamp, timeline.start),
        ))
        .orderBy(metricsHistory.timestamp)

      const bucketStats = Array.from({ length: bucketCount }, () => ({
        cpuSum: 0,
        memSum: 0,
        podSum: 0,
        netInSum: 0,
        netOutSum: 0,
        count: 0,
      }))

      for (const row of rows) {
        const bucketIndex = getBucketIndex(new Date(row.timestamp), startMs, intervalMs, bucketCount)
        if (bucketIndex === -1) continue

        const bucket = bucketStats[bucketIndex]!
        bucket.cpuSum += row.cpuPercent
        bucket.memSum += row.memPercent
        bucket.podSum += row.podCount
        bucket.netInSum += row.networkBytesIn ?? 0
        bucket.netOutSum += row.networkBytesOut ?? 0
        bucket.count++
      }

      return timeline.buckets.map((bucket, index) => {
        const stats = bucketStats[index]!
        const hasData = stats.count > 0
        return {
          timestamp: bucket.timestamp,
          bucketStart: bucket.bucketStart,
          bucketEnd: bucket.bucketEnd,
          cpu: hasData ? Math.round((stats.cpuSum / stats.count) * 10) / 10 : null,
          memory: hasData ? Math.round((stats.memSum / stats.count) * 10) / 10 : null,
          pods: hasData ? Math.round(stats.podSum / stats.count) : null,
          networkBytesIn: hasData ? Math.round(stats.netInSum / stats.count) : null,
          networkBytesOut: hasData ? Math.round(stats.netOutSum / stats.count) : null,
        }
      })
    }),

  /** M-P3-002: Live per-node resource snapshot from K8s metrics-server */
  nodeBreakdown: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      const TIMEOUT_MS = 15_000
      let timeoutHandle: NodeJS.Timeout | null = null
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
              const capacity = capacityMap.get(name)

              const cpuPercent = capacity && capacity.cpuAllocNano > 0
                ? Math.round((usedCpuNano / capacity.cpuAllocNano) * 1000) / 10
                : null
              const memPercent = capacity && capacity.memAllocBytes > 0
                ? Math.round((usedMemBytes / capacity.memAllocBytes) * 1000) / 10
                : null

              return {
                name,
                cpuPercent,
                memPercent,
                cpuCores: +(usedCpuNano / 1e9).toFixed(2),
                memGb: +(usedMemBytes / (1024 ** 3)).toFixed(2),
                cpuAllocCores: capacity ? +(capacity.cpuAllocNano / 1e9).toFixed(2) : null,
                memAllocGb: capacity ? +(capacity.memAllocBytes / (1024 ** 3)).toFixed(2) : null,
              }
            })
          })(),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('Node breakdown timed out')), TIMEOUT_MS)
          }),
        ])
        return result
      } catch (err) {
        console.warn(`[metrics] nodeBreakdown failed for ${input.clusterId}:`, err instanceof Error ? err.message : err)
        return []
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }
    }),

  /** IP4-004: Multi-cluster metrics aggregation for dashboard */
  aggregatedMetrics: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(async ({ input }) => {
      const timeline = getBucketTimeline(input.range)

      const rows = await db
        .select({
          clusterId: metricsHistory.clusterId,
          avgCpu: sql<number>`avg(${metricsHistory.cpuPercent})`.as('avg_cpu'),
          avgMem: sql<number>`avg(${metricsHistory.memPercent})`.as('avg_mem'),
          totalPods: sql<number>`max(${metricsHistory.podCount})`.as('total_pods'),
          totalNodes: sql<number>`max(${metricsHistory.nodeCount})`.as('total_nodes'),
        })
        .from(metricsHistory)
        .where(gte(metricsHistory.timestamp, timeline.start))
        .groupBy(metricsHistory.clusterId)

      const clusterList = await db
        .select({ id: clustersTable.id, name: clustersTable.name })
        .from(clustersTable)
      const nameMap = new Map(clusterList.map((cluster) => [cluster.id, cluster.name]))

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
        ? Math.round((perCluster.reduce((sum, cluster) => sum + cluster.avgCpu, 0) / totalClusters) * 10) / 10
        : 0
      const totalMemAvg = totalClusters > 0
        ? Math.round((perCluster.reduce((sum, cluster) => sum + cluster.avgMem, 0) / totalClusters) * 10) / 10
        : 0
      const totalPods = perCluster.reduce((sum, cluster) => sum + cluster.totalPods, 0)
      const totalNodes = perCluster.reduce((sum, cluster) => sum + cluster.totalNodes, 0)

      return {
        summary: { totalCpuAvg, totalMemAvg, totalPods, totalNodes, clusterCount: totalClusters },
        perCluster,
      }
    }),

  /** MX-003: Per-node time-series from nodeMetricsHistory */
  nodeTimeSeries: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid(), range: timeRangeSchema }))
    .query(async ({ input }) => {
      const timeline = getBucketTimeline(input.range)
      const start = timeline.start

      const rows = await db
        .select()
        .from(nodeMetricsHistory)
        .where(and(
          eq(nodeMetricsHistory.clusterId, input.clusterId),
          gte(nodeMetricsHistory.timestamp, start),
        ))
        .orderBy(nodeMetricsHistory.timestamp)
        .limit(10000)

      if (rows.length === 0) return []

      // Group by nodeName
      const nodeMap = new Map<string, { timestamps: string[]; cpuValues: number[]; memValues: number[]; cpuMillis: number[]; memMi: number[] }>()
      for (const row of rows) {
        if (!nodeMap.has(row.nodeName)) {
          nodeMap.set(row.nodeName, { timestamps: [], cpuValues: [], memValues: [], cpuMillis: [], memMi: [] })
        }
        const node = nodeMap.get(row.nodeName)!
        node.timestamps.push(new Date(row.timestamp).toISOString())
        node.cpuValues.push(row.cpuPercent)
        node.memValues.push(row.memPercent)
        node.cpuMillis.push(row.cpuMillis)
        node.memMi.push(row.memMi)
      }

      return Array.from(nodeMap.entries()).map(([nodeName, data]) => ({
        nodeName,
        ...data,
      }))
    }),
})
