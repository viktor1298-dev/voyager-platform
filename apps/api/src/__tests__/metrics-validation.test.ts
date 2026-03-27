import { describe, expect, it, vi } from 'vitest'

// Mock @voyager/db to avoid real DB connection during module load
vi.mock('@voyager/db', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => Promise.resolve([])) })) })),
    })),
  },
  metricsHistory: {},
  nodeMetricsHistory: {},
  healthHistory: {},
  clusters: {},
  events: {},
}))

// Mock auth to avoid SSO/DB chain
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

import { timeRangeSchema, GRAFANA_RANGES } from '../routers/metrics.js'

describe('PIPE-05: Metrics time range validation', () => {
  const validRanges = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '2d', '7d']

  it('accepts each of the 10 Grafana-standard ranges', () => {
    for (const range of validRanges) {
      const result = timeRangeSchema.parse(range)
      expect(result).toBe(range)
    }
  })

  it('rejects old range 30s', () => {
    expect(() => timeRangeSchema.parse('30s')).toThrow()
  })

  it('rejects old range 1m', () => {
    expect(() => timeRangeSchema.parse('1m')).toThrow()
  })

  it('rejects old range 30d', () => {
    expect(() => timeRangeSchema.parse('30d')).toThrow()
  })

  it('defaults to 24h when no value provided', () => {
    const result = timeRangeSchema.parse(undefined)
    expect(result).toBe('24h')
  })

  it('GRAFANA_RANGES array has exactly 10 entries', () => {
    expect(GRAFANA_RANGES).toHaveLength(10)
    expect([...GRAFANA_RANGES]).toEqual(validRanges)
  })
})
