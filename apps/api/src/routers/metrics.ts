import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { clusters as clustersTable, db } from '@voyager/db'
import { protectedProcedure, router } from '../trpc.js'

const timeRangeSchema = z.enum(['24h', '7d', '30d']).default('24h')

type TimeRange = z.infer<typeof timeRangeSchema>

interface MultiSeriesPoint {
  timestamp: string
  [key: string]: string | number
}

/** Interval configuration per time range */
const TIME_RANGE_CONFIG: Record<TimeRange, { intervalMs: number; points: number }> = {
  '24h': { intervalMs: 60 * 60 * 1000, points: 24 },
  '7d': { intervalMs: 6 * 60 * 60 * 1000, points: 28 },
  '30d': { intervalMs: 24 * 60 * 60 * 1000, points: 30 },
} as const

/** Mock data seed multipliers for deterministic generation */
const SEED = {
  HEALTH_BASE: 1,
  HEALTH_DEGRADED: 2,
  RESOURCE_CPU: 7,
  RESOURCE_MEM: 11,
  UPTIME: 31,
  UPTIME_DOWNTIME: 37,
  ALERT_TIMESTAMP: 41,
  ALERT_SEVERITY: 43,
  ALERT_TYPE: 47,
  ALERT_COUNT: 53,
} as const

/** Mock cluster names — will be replaced with DB queries */
const MOCK_CLUSTER_NAMES = ['prod-us-east', 'prod-eu-west', 'staging', 'dev-local'] as const

/** Mock alert types — will be replaced with DB queries */
const MOCK_ALERT_TYPES = [
  'HighCPU',
  'HighMemory',
  'PodCrashLoop',
  'NodeNotReady',
  'DiskPressure',
  'CertExpiring',
] as const

const SEVERITIES = ['critical', 'warning', 'info'] as const

/** Health baseline ranges */
const HEALTH_BASE_MIN = 70
const HEALTH_BASE_RANGE = 25
const HEALTH_DEGRADED_MIN = 5
const HEALTH_DEGRADED_RANGE = 15

/** Resource usage baseline ranges */
const CPU_BASE = 35
const CPU_AMPLITUDE = 15
const CPU_NOISE_RANGE = 10
const MEMORY_BASE = 55
const MEMORY_AMPLITUDE = 10
const MEMORY_NOISE_RANGE = 8


/** Uptime baseline */
const UPTIME_BASE = 99.0
const UPTIME_RANGE = 0.99
const MAX_DOWNTIME_MINUTES = 30

/** Alert count range */
const MIN_ALERTS = 8
const ALERT_COUNT_RANGE = 12
const MIN_ALERT_OCCURRENCES = 1
const MAX_ALERT_OCCURRENCES = 5

function getIntervalConfig(range: TimeRange): { intervalMs: number; points: number } {
  return TIME_RANGE_CONFIG[range]
}

function generateTimeSeries(
  range: TimeRange,
  generator: (i: number, total: number) => Record<string, number>,
): MultiSeriesPoint[] {
  const { intervalMs, points } = getIntervalConfig(range)
  const now = Date.now()
  const start = now - intervalMs * points

  return Array.from({ length: points }, (_, i) => {
    const timestamp = new Date(start + intervalMs * (i + 1)).toISOString()
    return { timestamp, ...generator(i, points) }
  })
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// ── CPU/Memory helpers (mirrored from k8s-watchers for direct endpoint use) ──

function parseCpuToNanoMetrics(cpu: string): number {
  if (cpu.endsWith('n')) return Number.parseInt(cpu, 10)
  if (cpu.endsWith('u')) return Number.parseInt(cpu, 10) * 1000
  if (cpu.endsWith('m')) return Number.parseInt(cpu, 10) * 1e6
  return Number.parseFloat(cpu) * 1e9
}

function parseMemToBytesMetrics(mem: string): number {
  if (mem.endsWith('Ki')) return Number.parseInt(mem, 10) * 1024
  if (mem.endsWith('Mi')) return Number.parseInt(mem, 10) * 1024 * 1024
  if (mem.endsWith('Gi')) return Number.parseInt(mem, 10) * 1024 * 1024 * 1024
  return Number.parseInt(mem, 10)
}

export const metricsRouter = router({
  clusterHealth: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      return generateTimeSeries(input.range, (i) => {
        const base = seededRandom(i * 3 + SEED.HEALTH_BASE)
        const healthy = Math.round(HEALTH_BASE_MIN + base * HEALTH_BASE_RANGE)
        const degraded = Math.round(
          HEALTH_DEGRADED_MIN + seededRandom(i * 3 + SEED.HEALTH_DEGRADED) * HEALTH_DEGRADED_RANGE,
        )
        const offline = Math.max(0, 100 - healthy - degraded)
        return { healthy, degraded, offline }
      })
    }),

  resourceUsage: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      return generateTimeSeries(input.range, (i) => {
        const cpuBase = CPU_BASE + Math.sin(i * 0.5) * CPU_AMPLITUDE
        const memBase = MEMORY_BASE + Math.cos(i * 0.3) * MEMORY_AMPLITUDE
        return {
          cpu: Math.round(cpuBase + seededRandom(i * SEED.RESOURCE_CPU) * CPU_NOISE_RANGE),
          memory: Math.round(memBase + seededRandom(i * SEED.RESOURCE_MEM) * MEMORY_NOISE_RANGE),
        }
      })
    }),


  uptimeHistory: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      return MOCK_CLUSTER_NAMES.map((name, idx) => ({
        cluster: name,
        uptime: +(
          UPTIME_BASE +
          seededRandom(idx * SEED.UPTIME + input.range.length) * UPTIME_RANGE
        ).toFixed(2),
        downtime: Math.round(seededRandom(idx * SEED.UPTIME_DOWNTIME) * MAX_DOWNTIME_MINUTES),
      }))
    }),

  alertsTimeline: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      const { intervalMs, points } = getIntervalConfig(input.range)
      const now = Date.now()
      const start = now - intervalMs * points

      const alertCount = Math.round(MIN_ALERTS + seededRandom(points) * ALERT_COUNT_RANGE)
      return Array.from({ length: alertCount }, (_, i) => ({
        timestamp: new Date(
          start + seededRandom(i * SEED.ALERT_TIMESTAMP) * (now - start),
        ).toISOString(),
        severity: SEVERITIES[Math.floor(seededRandom(i * SEED.ALERT_SEVERITY) * SEVERITIES.length)],
        type: MOCK_ALERT_TYPES[
          Math.floor(seededRandom(i * SEED.ALERT_TYPE) * MOCK_ALERT_TYPES.length)
        ],
        count: Math.round(
          MIN_ALERT_OCCURRENCES + seededRandom(i * SEED.ALERT_COUNT) * MAX_ALERT_OCCURRENCES,
        ),
      })).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }),

  /**
   * Current snapshot of CPU/memory usage from the live K8s metrics-server.
   * Falls back to null values when metrics-server is unavailable.
   */
  currentStats: protectedProcedure
    .output(
      z.object({
        cpuPercent: z.number().nullable(),
        memoryPercent: z.number().nullable(),
        cpuCores: z.number().nullable(),
        memoryBytes: z.number().nullable(),
        podCount: z.number().int(),
        timestamp: z.string(),
      }),
    )
    .query(async () => {
      try {
        // IP3-003/IP3-007: Query ALL connected clusters, aggregate metrics
        const allClusters = await db.select({ id: clustersTable.id }).from(clustersTable)

        let totalCpuNano = 0
        let totalMemBytes = 0
        let totalCpuAllocatable = 0
        let totalMemAllocatable = 0
        let totalPodCount = 0
        let hasData = false

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
                  cpuNano: parseCpuToNanoMetrics(node.status?.allocatable?.cpu ?? '0'),
                  memBytes: parseMemToBytesMetrics(node.status?.allocatable?.memory ?? '0'),
                })
              }
            }

            for (const node of nodeMetrics.items) {
              totalCpuNano += parseCpuToNanoMetrics(node.usage?.cpu ?? '0')
              totalMemBytes += parseMemToBytesMetrics(node.usage?.memory ?? '0')
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
          } catch {
            // Skip clusters that fail — don't break aggregation
          }
        }

        if (!hasData) {
          return {
            cpuPercent: null, memoryPercent: null,
            cpuCores: null, memoryBytes: null,
            podCount: 0, timestamp: new Date().toISOString(),
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
        }
      } catch {
        return {
          cpuPercent: null, memoryPercent: null,
          cpuCores: null, memoryBytes: null,
          podCount: 0, timestamp: new Date().toISOString(),
        }
      }
    }),
})
