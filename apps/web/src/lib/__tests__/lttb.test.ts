import { describe, it, expect } from 'vitest'
import { lttb, downsampleMetrics } from '../lttb'

// Helper to generate linear test data
function generatePoints(count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => ({ x: i, y: i * 2 }))
}

describe('lttb', () => {
  const getX = (d: { x: number }) => d.x
  const getY = (d: { x: number; y: number }) => d.y

  it('returns original data when empty', () => {
    const result = lttb([], 10, getX, getY)
    expect(result).toEqual([])
  })

  it('returns original data for a single point', () => {
    const data = [{ x: 0, y: 5 }]
    const result = lttb(data, 10, getX, getY)
    expect(result).toEqual(data)
  })

  it('returns original data when fewer points than threshold', () => {
    const data = generatePoints(5)
    const result = lttb(data, 10, getX, getY)
    expect(result).toBe(data) // Same reference, not a copy
    expect(result).toHaveLength(5)
  })

  it('returns original data when points equal threshold', () => {
    const data = generatePoints(10)
    const result = lttb(data, 10, getX, getY)
    expect(result).toBe(data)
  })

  it('returns original data when threshold < 3', () => {
    const data = generatePoints(100)
    expect(lttb(data, 2, getX, getY)).toBe(data)
    expect(lttb(data, 1, getX, getY)).toBe(data)
    expect(lttb(data, 0, getX, getY)).toBe(data)
  })

  it('downsamples to the requested number of points', () => {
    const data = generatePoints(100)
    const result = lttb(data, 20, getX, getY)
    expect(result).toHaveLength(20)
  })

  it('always includes first and last points', () => {
    const data = generatePoints(100)
    const result = lttb(data, 10, getX, getY)
    expect(result[0]).toBe(data[0])
    expect(result[result.length - 1]).toBe(data[99])
  })

  it('returns same references (no cloning)', () => {
    const data = generatePoints(50)
    const result = lttb(data, 10, getX, getY)
    for (const point of result) {
      expect(data).toContain(point)
    }
  })

  it('preserves visual shape for a spike pattern', () => {
    // Create data with a clear spike at index 50
    const data = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: i === 50 ? 1000 : 1,
    }))
    const result = lttb(data, 10, getX, getY)

    // The spike should be preserved since it has the largest triangle area
    const spikePoint = data[50]!
    expect(result).toContain(spikePoint)
  })

  it('handles threshold of 3 (minimum meaningful downsample)', () => {
    const data = generatePoints(100)
    const result = lttb(data, 3, getX, getY)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe(data[0])
    expect(result[result.length - 1]).toBe(data[99])
  })
})

describe('downsampleMetrics', () => {
  function makeMetricsPoints(count: number) {
    const base = new Date('2026-01-01T00:00:00Z').getTime()
    return Array.from({ length: count }, (_, i) => ({
      timestamp: new Date(base + i * 10_000).toISOString(),
      cpu: Math.sin(i / 10) * 50 + 50,
      memory: i * 0.5,
      pods: Math.floor(i / 10),
    }))
  }

  it('returns original array when length <= maxPoints', () => {
    const data = makeMetricsPoints(50)
    expect(downsampleMetrics(data, 200)).toBe(data)
    expect(downsampleMetrics(data, 50)).toBe(data)
  })

  it('downsamples when length > maxPoints', () => {
    const data = makeMetricsPoints(500)
    const result = downsampleMetrics(data, 200)
    expect(result).toHaveLength(200)
  })

  it('uses default maxPoints of 200', () => {
    const data = makeMetricsPoints(500)
    const result = downsampleMetrics(data)
    expect(result).toHaveLength(200)
  })

  it('preserves first and last timestamps', () => {
    const data = makeMetricsPoints(500)
    const result = downsampleMetrics(data, 100)
    expect(result[0]!.timestamp).toBe(data[0]!.timestamp)
    expect(result[result.length - 1]!.timestamp).toBe(data[499]!.timestamp)
  })

  it('falls back to memory when cpu is null', () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime()
    const data = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(base + i * 10_000).toISOString(),
      cpu: null as number | null,
      memory: i * 10,
      pods: null as number | null,
    }))
    // Should not throw — uses memory as fallback Y
    const result = downsampleMetrics(data, 20)
    expect(result).toHaveLength(20)
  })
})
