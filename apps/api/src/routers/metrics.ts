import { z } from 'zod'
import { protectedProcedure, router } from '../trpc'

const timeRangeSchema = z.enum(['24h', '7d', '30d']).default('24h')

interface TimeSeriesPoint {
  timestamp: string
  value: number
  label?: string
}

interface MultiSeriesPoint {
  timestamp: string
  [key: string]: string | number
}

function getIntervalMs(range: '24h' | '7d' | '30d'): { intervalMs: number; points: number } {
  switch (range) {
    case '24h':
      return { intervalMs: 60 * 60 * 1000, points: 24 } // hourly
    case '7d':
      return { intervalMs: 6 * 60 * 60 * 1000, points: 28 } // every 6h
    case '30d':
      return { intervalMs: 24 * 60 * 60 * 1000, points: 30 } // daily
  }
}

function generateTimeSeries(
  range: '24h' | '7d' | '30d',
  generator: (i: number, total: number) => Record<string, number>,
): MultiSeriesPoint[] {
  const { intervalMs, points } = getIntervalMs(range)
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
      return generateTimeSeries(input.range, (i, total) => {
        const base = seededRandom(i * 3 + 1)
        const healthy = Math.round(70 + base * 25)
        const degraded = Math.round(5 + seededRandom(i * 3 + 2) * 15)
        const offline = Math.max(0, 100 - healthy - degraded)
        return { healthy, degraded, offline }
      })
    }),

  resourceUsage: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      return generateTimeSeries(input.range, (i) => {
        const cpuBase = 35 + Math.sin(i * 0.5) * 15
        const memBase = 55 + Math.cos(i * 0.3) * 10
        return {
          cpu: Math.round(cpuBase + seededRandom(i * 7) * 10),
          memory: Math.round(memBase + seededRandom(i * 11) * 8),
        }
      })
    }),

  requestRates: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      return generateTimeSeries(input.range, (i) => {
        const base = 200 + Math.sin(i * 0.4) * 100
        return {
          success: Math.round(base + seededRandom(i * 13) * 50),
          error: Math.round(5 + seededRandom(i * 17) * 15),
        }
      })
    }),

  uptimeHistory: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      const clusterNames = ['prod-us-east', 'prod-eu-west', 'staging', 'dev-local']
      return clusterNames.map((name, idx) => ({
        cluster: name,
        uptime: +(99.0 + seededRandom(idx * 31 + input.range.length) * 0.99).toFixed(2),
        downtime: Math.round(seededRandom(idx * 37) * 30),
      }))
    }),

  alertsTimeline: protectedProcedure
    .input(z.object({ range: timeRangeSchema }))
    .query(({ input }) => {
      const { intervalMs, points } = getIntervalMs(input.range)
      const now = Date.now()
      const start = now - intervalMs * points
      const severities = ['critical', 'warning', 'info'] as const
      const alertTypes = [
        'HighCPU',
        'HighMemory',
        'PodCrashLoop',
        'NodeNotReady',
        'DiskPressure',
        'CertExpiring',
      ]

      const alertCount = Math.round(8 + seededRandom(points) * 12)
      return Array.from({ length: alertCount }, (_, i) => ({
        timestamp: new Date(start + seededRandom(i * 41) * (now - start)).toISOString(),
        severity: severities[Math.floor(seededRandom(i * 43) * severities.length)],
        type: alertTypes[Math.floor(seededRandom(i * 47) * alertTypes.length)],
        count: Math.round(1 + seededRandom(i * 53) * 5),
      })).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }),
})
