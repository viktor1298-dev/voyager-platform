import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetricsBuffer, convertSSEEvent } from '../metrics-buffer'

// Inline the MetricsDataPoint shape to avoid importing from component file
interface MetricsDataPoint {
  timestamp: string
  bucketStart?: string | null
  bucketEnd?: string | null
  cpu: number | null
  memory: number | null
  pods: number | null
  networkBytesIn?: number | null
  networkBytesOut?: number | null
}

function makePoint(offsetMs: number, cpu = 50): MetricsDataPoint {
  return {
    timestamp: new Date(Date.now() + offsetMs).toISOString(),
    bucketStart: null,
    bucketEnd: null,
    cpu,
    memory: 60,
    pods: 10,
  }
}

describe('MetricsBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty', () => {
    const buf = new MetricsBuffer(10, 60_000)
    expect(buf.size).toBe(0)
    expect(buf.hasData).toBe(false)
    expect(buf.toArray()).toEqual([])
  })

  it('adds points and reports correct size', () => {
    const buf = new MetricsBuffer(10, 300_000)
    buf.push(makePoint(0, 10))
    buf.push(makePoint(1000, 20))
    buf.push(makePoint(2000, 30))

    expect(buf.size).toBe(3)
    expect(buf.hasData).toBe(true)
  })

  it('returns points in insertion order (oldest first)', () => {
    const buf = new MetricsBuffer(10, 300_000)
    const p1 = makePoint(0, 10)
    const p2 = makePoint(1000, 20)
    const p3 = makePoint(2000, 30)

    buf.push(p1)
    buf.push(p2)
    buf.push(p3)

    const arr = buf.toArray()
    expect(arr).toHaveLength(3)
    expect(arr[0]!.cpu).toBe(10)
    expect(arr[1]!.cpu).toBe(20)
    expect(arr[2]!.cpu).toBe(30)
  })

  it('wraps around when capacity is exceeded', () => {
    const buf = new MetricsBuffer(3, 300_000)

    buf.push(makePoint(0, 1))
    buf.push(makePoint(1000, 2))
    buf.push(makePoint(2000, 3))
    expect(buf.size).toBe(3)

    // Push a 4th point — should overwrite the oldest
    buf.push(makePoint(3000, 4))
    expect(buf.size).toBe(3)

    const arr = buf.toArray()
    expect(arr.map((p) => p.cpu)).toEqual([2, 3, 4])
  })

  it('wraps around multiple times', () => {
    const buf = new MetricsBuffer(3, 300_000)

    for (let i = 0; i < 10; i++) {
      buf.push(makePoint(i * 1000, i))
    }

    expect(buf.size).toBe(3)
    const arr = buf.toArray()
    expect(arr.map((p) => p.cpu)).toEqual([7, 8, 9])
  })

  it('evicts points older than rangeMs', () => {
    const rangeMs = 60_000 // 1 minute
    const buf = new MetricsBuffer(100, rangeMs)

    // Add a point at "now"
    buf.push(makePoint(0, 1))

    // Advance time by 90 seconds (past the 60s range)
    vi.advanceTimersByTime(90_000)

    // Add a new point — this triggers eviction
    buf.push(makePoint(0, 2))

    // The old point should be evicted
    expect(buf.size).toBe(1)
    expect(buf.toArray()[0]!.cpu).toBe(2)
  })

  it('keeps points within rangeMs during eviction', () => {
    const rangeMs = 60_000
    const buf = new MetricsBuffer(100, rangeMs)

    // Add points at 0, 10s, 20s, 30s
    for (let i = 0; i < 4; i++) {
      buf.push(makePoint(i * 10_000, i))
      vi.advanceTimersByTime(10_000)
    }

    // Now at T+40s. Points at T+0 and T+10 are 40s and 30s old (within 60s range)
    // Add another point to trigger eviction
    buf.push(makePoint(0, 99))
    expect(buf.size).toBeGreaterThanOrEqual(4) // all within range
  })

  it('clears the buffer', () => {
    const buf = new MetricsBuffer(10, 300_000)
    buf.push(makePoint(0, 1))
    buf.push(makePoint(1000, 2))

    expect(buf.size).toBe(2)
    buf.clear()
    expect(buf.size).toBe(0)
    expect(buf.hasData).toBe(false)
    expect(buf.toArray()).toEqual([])
  })

  it('works correctly after clear and re-push', () => {
    const buf = new MetricsBuffer(5, 300_000)
    buf.push(makePoint(0, 1))
    buf.push(makePoint(1000, 2))
    buf.clear()

    buf.push(makePoint(2000, 3))
    expect(buf.size).toBe(1)
    expect(buf.toArray()[0]!.cpu).toBe(3)
  })
})

describe('convertSSEEvent', () => {
  it('converts MetricsStreamEvent to MetricsDataPoint', () => {
    const event = {
      clusterId: 'test-cluster',
      timestamp: '2026-03-15T12:00:00Z',
      cpu: 45.5,
      memory: 72.3,
      pods: 15,
      networkBytesIn: 1024,
      networkBytesOut: 2048,
    }

    const result = convertSSEEvent(event)

    expect(result).toEqual({
      timestamp: '2026-03-15T12:00:00Z',
      bucketStart: null,
      bucketEnd: null,
      cpu: 45.5,
      memory: 72.3,
      pods: 15,
      networkBytesIn: 1024,
      networkBytesOut: 2048,
    })
  })

  it('handles null metric values', () => {
    const event = {
      clusterId: 'test-cluster',
      timestamp: '2026-03-15T12:00:00Z',
      cpu: null,
      memory: null,
      pods: null,
      networkBytesIn: null,
      networkBytesOut: null,
    }

    const result = convertSSEEvent(event)
    expect(result.cpu).toBeNull()
    expect(result.memory).toBeNull()
    expect(result.pods).toBeNull()
  })
})
