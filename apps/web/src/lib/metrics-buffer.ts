import type { MetricsStreamEvent } from '@voyager/types'
import type { MetricsDataPoint } from '../components/metrics/MetricsAreaChart.js'

/**
 * Fixed-capacity circular buffer for SSE metrics data points.
 * Provides dual eviction: capacity-based (circular overwrite) and
 * time-based (active removal of stale entries outside rangeMs).
 */
export class MetricsBuffer {
  private buffer: (MetricsDataPoint | undefined)[]
  private head = 0
  private count = 0
  private readonly capacity: number
  private readonly rangeMs: number

  constructor(capacity: number, rangeMs: number) {
    this.capacity = capacity
    this.rangeMs = rangeMs
    this.buffer = new Array(capacity)
  }

  /** Add a point at the head position, wrapping around on overflow. */
  push(point: MetricsDataPoint): void {
    this.buffer[this.head] = point
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
    this.evictOutOfRange()
  }

  /** Remove points older than rangeMs from now (walk from tail). */
  private evictOutOfRange(): void {
    const cutoff = Date.now() - this.rangeMs
    while (this.count > 0) {
      const tailIndex = (this.head - this.count + this.capacity) % this.capacity
      const point = this.buffer[tailIndex]
      if (point && new Date(point.timestamp).getTime() < cutoff) {
        this.count--
      } else {
        break
      }
    }
  }

  /** Return ordered array from tail to head (oldest to newest) for Recharts consumption. */
  toArray(): MetricsDataPoint[] {
    const result: MetricsDataPoint[] = []
    for (let i = 0; i < this.count; i++) {
      const index = (this.head - this.count + i + this.capacity) % this.capacity
      const point = this.buffer[index]
      if (point) result.push(point)
    }
    return result
  }

  /** Reset buffer to empty state. */
  clear(): void {
    this.head = 0
    this.count = 0
  }

  get size(): number {
    return this.count
  }

  get hasData(): boolean {
    return this.count > 0
  }
}

/** Convert an SSE MetricsStreamEvent to a MetricsDataPoint for chart consumption. */
export function convertSSEEvent(event: MetricsStreamEvent): MetricsDataPoint {
  return {
    timestamp: event.timestamp,
    bucketStart: null,
    bucketEnd: null,
    cpu: event.cpu,
    memory: event.memory,
    pods: event.pods,
    networkBytesIn: event.networkBytesIn,
    networkBytesOut: event.networkBytesOut,
  }
}
