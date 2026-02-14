import { z } from 'zod'
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
  REQUEST_SUCCESS: 13,
  REQUEST_ERROR: 17,
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

/** Request rate baseline ranges */
const REQUEST_BASE = 200
const REQUEST_AMPLITUDE = 100
const REQUEST_SUCCESS_NOISE = 50
const REQUEST_ERROR_BASE = 5
const REQUEST_ERROR_NOISE = 15

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

  requestRates: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      return generateTimeSeries(input.range, (i) => {
        const base = REQUEST_BASE + Math.sin(i * 0.4) * REQUEST_AMPLITUDE
        return {
          success: Math.round(
            base + seededRandom(i * SEED.REQUEST_SUCCESS) * REQUEST_SUCCESS_NOISE,
          ),
          error: Math.round(
            REQUEST_ERROR_BASE + seededRandom(i * SEED.REQUEST_ERROR) * REQUEST_ERROR_NOISE,
          ),
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
})
