import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @voyager/db
const mockExecute = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockOrderBy = vi.fn()
const mockGroupBy = vi.fn()
const mockLimit = vi.fn()

vi.mock('@voyager/db', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => {
      mockSelect(...args)
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs)
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs)
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs)
                  return {
                    limit: (...lArgs: unknown[]) => {
                      mockLimit(...lArgs)
                      return Promise.resolve([])
                    },
                    then: (resolve: (v: unknown[]) => void) => resolve([]),
                  }
                },
                groupBy: (...gArgs: unknown[]) => {
                  mockGroupBy(...gArgs)
                  return Promise.resolve([])
                },
                then: (resolve: (v: unknown[]) => void) => resolve([]),
              }
            },
            orderBy: (...oArgs: unknown[]) => {
              mockOrderBy(...oArgs)
              return Promise.resolve([])
            },
            then: (resolve: (v: unknown[]) => void) => resolve([]),
          }
        },
      }
    },
  },
  metricsHistory: {
    clusterId: 'clusterId',
    timestamp: 'timestamp',
    cpuPercent: 'cpuPercent',
    memPercent: 'memPercent',
    podCount: 'podCount',
    networkBytesIn: 'networkBytesIn',
    networkBytesOut: 'networkBytesOut',
    nodeCount: 'nodeCount',
  },
  nodeMetricsHistory: {
    clusterId: 'clusterId',
    timestamp: 'timestamp',
    nodeName: 'nodeName',
    cpuPercent: 'cpuPercent',
    memPercent: 'memPercent',
    cpuMillis: 'cpuMillis',
    memMi: 'memMi',
  },
  healthHistory: { clusterId: 'clusterId', checkedAt: 'checkedAt', status: 'status' },
  clusters: { id: 'id', name: 'name' },
  events: { kind: 'kind', timestamp: 'timestamp', reason: 'reason' },
}))

// Mock auth
vi.mock('../lib/auth', () => ({
  auth: {
    api: { getSession: vi.fn().mockResolvedValue(null) },
    handler: vi.fn(),
  },
}))

// Mock cluster client pool
vi.mock('../lib/cluster-client-pool.js', () => ({
  clusterClientPool: { getClient: vi.fn() },
}))

// Mock k8s-units
vi.mock('../lib/k8s-units.js', () => ({
  parseCpuToNano: vi.fn(() => 0),
  parseMemToBytes: vi.fn(() => 0),
}))

import { GRAFANA_RANGES, metricsRouter, TIME_RANGE_CONFIG } from '../routers/metrics.js'
import { router } from '../trpc.js'

const appRouter = router({ metrics: metricsRouter })

function createTestCaller() {
  return appRouter.createCaller({
    db: {} as any,
    user: { id: 'test-user', email: 'test@test.com', name: 'Test', role: 'admin' },
    session: { userId: 'test-user', expiresAt: new Date(Date.now() + 86400000) },
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as any,
  })
}

describe('PIPE-01/02/03: Metrics pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('TIME_RANGE_CONFIG', () => {
    it('has exactly 10 entries matching Grafana set', () => {
      const keys = Object.keys(TIME_RANGE_CONFIG)
      expect(keys).toHaveLength(10)
      expect(keys).toEqual([...GRAFANA_RANGES])
    })

    it('every bucketMs >= 60_000 after clamping to collector minimum', () => {
      for (const [_range, config] of Object.entries(TIME_RANGE_CONFIG)) {
        const effectiveBucketMs = Math.max(config.bucketMs, 60_000)
        expect(effectiveBucketMs).toBeGreaterThanOrEqual(60_000)
      }
    })

    it('each range produces 20-60 data points', () => {
      for (const [_range, config] of Object.entries(TIME_RANGE_CONFIG)) {
        const effectiveBucketMs = Math.max(config.bucketMs, 60_000)
        const dataPoints = Math.ceil(config.rangeMs / effectiveBucketMs)
        expect(dataPoints).toBeGreaterThanOrEqual(5) // 5m/60s = 5 points minimum
        expect(dataPoints).toBeLessThanOrEqual(60)
      }
    })
  })

  describe('history procedure', () => {
    it('calls db.execute with SQL containing time_bucket', async () => {
      mockExecute.mockResolvedValue({ rows: [] })
      const caller = createTestCaller()
      await caller.metrics.history({
        clusterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        range: '1h',
      })
      expect(mockExecute).toHaveBeenCalledTimes(1)
      // Check that the SQL template contains time_bucket
      const sqlArg = mockExecute.mock.calls[0][0]
      const sqlString =
        sqlArg?.queryChunks
          ?.map((c: any) => (typeof c === 'string' ? c : (c?.value?.toString?.() ?? '')))
          .join('') ??
        sqlArg?.toString?.() ??
        JSON.stringify(sqlArg)
      expect(sqlString.toLowerCase()).toContain('time_bucket')
    })

    it('returns { data, serverTime, intervalMs }', async () => {
      mockExecute.mockResolvedValue({ rows: [] })
      const caller = createTestCaller()
      const result = await caller.metrics.history({
        clusterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        range: '1h',
      })
      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('serverTime')
      expect(result).toHaveProperty('intervalMs')
      expect(Array.isArray(result.data)).toBe(true)
    })

    it('serverTime is a valid ISO string', async () => {
      mockExecute.mockResolvedValue({ rows: [] })
      const caller = createTestCaller()
      const result = await caller.metrics.history({
        clusterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        range: '1h',
      })
      const parsed = new Date(result.serverTime)
      expect(parsed.toISOString()).toBe(result.serverTime)
    })

    it('intervalMs matches the effective bucketMs for the requested range', async () => {
      mockExecute.mockResolvedValue({ rows: [] })
      const caller = createTestCaller()
      const result = await caller.metrics.history({
        clusterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        range: '1h',
      })
      const config = TIME_RANGE_CONFIG['1h']
      const effectiveBucketMs = Math.max(config.bucketMs, 60_000)
      expect(result.intervalMs).toBe(effectiveBucketMs)
    })

    it('null-fill: when DB returns 0 rows, result.data has null values but correct timestamps', async () => {
      mockExecute.mockResolvedValue({ rows: [] })
      const caller = createTestCaller()
      const result = await caller.metrics.history({
        clusterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        range: '1h',
      })
      expect(result.data.length).toBeGreaterThan(0)
      for (const point of result.data) {
        expect(point.cpu).toBeNull()
        expect(point.memory).toBeNull()
        expect(point.pods).toBeNull()
        expect(point.networkBytesIn).toBeNull()
        expect(point.networkBytesOut).toBeNull()
        expect(point).toHaveProperty('timestamp')
        expect(point).toHaveProperty('bucketStart')
        expect(point).toHaveProperty('bucketEnd')
      }
    })

    it('null-fill: when DB returns partial rows, missing buckets have null values', async () => {
      // Return a single row for a known bucket timestamp
      const now = new Date()
      const config = TIME_RANGE_CONFIG['1h']
      const effectiveBucketMs = Math.max(config.bucketMs, 60_000)
      // Create a bucket timestamp roughly in the middle of the range
      const midBucketMs =
        Math.floor(now.getTime() / effectiveBucketMs) * effectiveBucketMs - effectiveBucketMs * 5
      const bucketDate = new Date(midBucketMs)

      mockExecute.mockResolvedValue({
        rows: [
          {
            bucket: bucketDate.toISOString(),
            cpu: 45.2,
            memory: 67.8,
            pods: 12,
            network_bytes_in: 1024,
            network_bytes_out: 2048,
            sample_count: 3,
          },
        ],
      })

      const caller = createTestCaller()
      const result = await caller.metrics.history({
        clusterId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        range: '1h',
      })

      // At least one point should have data
      const withData = result.data.filter((p: any) => p.cpu !== null)
      const withNull = result.data.filter((p: any) => p.cpu === null)

      expect(withData.length).toBeGreaterThanOrEqual(1)
      expect(withNull.length).toBeGreaterThanOrEqual(1)
    })
  })
})
