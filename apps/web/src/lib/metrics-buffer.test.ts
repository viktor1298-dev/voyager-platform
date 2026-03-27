import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetricsBuffer, convertSSEEvent } from './metrics-buffer.js'
import type { MetricsDataPoint } from '../components/metrics/MetricsAreaChart.js'
import type { MetricsStreamEvent } from '@voyager/types'

function makePoint(timestamp: string, cpu = 50): MetricsDataPoint {
  return {
    timestamp,
    bucketStart: null,
    bucketEnd: null,
    cpu,
    memory: 60,
    pods: 10,
    networkBytesIn: 1000,
    networkBytesOut: 2000,
  }
}

describe('MetricsBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('toArray() returns empty array for fresh buffer', () => {
    const buffer = new MetricsBuffer(65, 15 * 60_000)
    expect(buffer.toArray()).toEqual([])
    expect(buffer.size).toBe(0)
    expect(buffer.hasData).toBe(false)
  })

  it('push() adds points, toArray() returns them oldest-to-newest', () => {
    const buffer = new MetricsBuffer(65, 15 * 60_000)
    const p1 = makePoint('2026-03-28T11:58:00Z', 10)
    const p2 = makePoint('2026-03-28T11:59:00Z', 20)
    const p3 = makePoint('2026-03-28T12:00:00Z', 30)

    buffer.push(p1)
    buffer.push(p2)
    buffer.push(p3)

    const arr = buffer.toArray()
    expect(arr).toHaveLength(3)
    expect(arr[0].cpu).toBe(10)
    expect(arr[1].cpu).toBe(20)
    expect(arr[2].cpu).toBe(30)
    expect(buffer.size).toBe(3)
    expect(buffer.hasData).toBe(true)
  })

  it('buffer does not exceed capacity (push 80 points with capacity 65)', () => {
    const buffer = new MetricsBuffer(65, 60 * 60_000) // 1h range so no time eviction

    for (let i = 0; i < 80; i++) {
      const ts = new Date(Date.now() - (80 - i) * 1000).toISOString()
      buffer.push(makePoint(ts, i))
    }

    expect(buffer.size).toBe(65)
    const arr = buffer.toArray()
    expect(arr).toHaveLength(65)
    // Oldest should be point 15 (index 0 was pushed at i=15 after 80-65=15 overwrites)
    expect(arr[0].cpu).toBe(15)
    expect(arr[64].cpu).toBe(79)
  })

  it('time-based eviction removes points older than rangeMs from now', () => {
    const rangeMs = 5 * 60_000 // 5 minutes
    const buffer = new MetricsBuffer(65, rangeMs)

    // Add a point 10 minutes ago (should be evicted)
    buffer.push(makePoint('2026-03-28T11:50:00Z', 1))
    // Add a point 3 minutes ago (should stay)
    buffer.push(makePoint('2026-03-28T11:57:00Z', 2))
    // Add a point 1 minute ago (should stay)
    buffer.push(makePoint('2026-03-28T11:59:00Z', 3))

    const arr = buffer.toArray()
    // The 10-min-ago point should have been evicted
    expect(arr).toHaveLength(2)
    expect(arr[0].cpu).toBe(2)
    expect(arr[1].cpu).toBe(3)
  })

  it('clear() resets buffer to empty state', () => {
    const buffer = new MetricsBuffer(65, 15 * 60_000)
    buffer.push(makePoint('2026-03-28T11:59:00Z'))
    buffer.push(makePoint('2026-03-28T12:00:00Z'))
    expect(buffer.size).toBe(2)

    buffer.clear()
    expect(buffer.size).toBe(0)
    expect(buffer.hasData).toBe(false)
    expect(buffer.toArray()).toEqual([])
  })

  it('duplicate timestamps are accepted (no dedup)', () => {
    const buffer = new MetricsBuffer(65, 15 * 60_000)
    const ts = '2026-03-28T12:00:00Z'
    buffer.push(makePoint(ts, 10))
    buffer.push(makePoint(ts, 20))

    expect(buffer.size).toBe(2)
    const arr = buffer.toArray()
    expect(arr[0].cpu).toBe(10)
    expect(arr[1].cpu).toBe(20)
  })
})

describe('convertSSEEvent', () => {
  it('maps MetricsStreamEvent to MetricsDataPoint correctly', () => {
    const event: MetricsStreamEvent = {
      clusterId: 'test-cluster-123',
      timestamp: '2026-03-28T12:00:00Z',
      cpu: 45.2,
      memory: 67.8,
      pods: 42,
      networkBytesIn: 1024000,
      networkBytesOut: 512000,
    }

    const point = convertSSEEvent(event)

    expect(point).toEqual({
      timestamp: '2026-03-28T12:00:00Z',
      bucketStart: null,
      bucketEnd: null,
      cpu: 45.2,
      memory: 67.8,
      pods: 42,
      networkBytesIn: 1024000,
      networkBytesOut: 512000,
    })
  })

  it('handles null metric values from SSE event', () => {
    const event: MetricsStreamEvent = {
      clusterId: 'test-cluster-123',
      timestamp: '2026-03-28T12:00:00Z',
      cpu: null,
      memory: null,
      pods: null,
      networkBytesIn: null,
      networkBytesOut: null,
    }

    const point = convertSSEEvent(event)

    expect(point.cpu).toBeNull()
    expect(point.memory).toBeNull()
    expect(point.pods).toBeNull()
    expect(point.networkBytesIn).toBeNull()
    expect(point.networkBytesOut).toBeNull()
    expect(point.bucketStart).toBeNull()
    expect(point.bucketEnd).toBeNull()
  })
})
