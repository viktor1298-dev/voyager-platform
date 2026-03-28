/**
 * LTTB — Largest Triangle Three Buckets downsampling algorithm.
 *
 * Reduces a time-series dataset to `threshold` points while preserving visual
 * shape. Works on any array of objects with a numeric-convertible timestamp
 * and one or more numeric value fields.
 *
 * Reference: Sveinn Steinarsson, "Downsampling Time Series for Visual
 * Representation" (2013), University of Iceland.
 *
 * @param data      - Source array (must be sorted by timestamp ascending)
 * @param threshold - Target number of output points (minimum 3)
 * @param getX      - Accessor for the X value (timestamp as epoch ms)
 * @param getY      - Accessor for the primary Y value used for triangle area calc
 * @returns Downsampled array (same element references, no cloning)
 */
export function lttb<T>(
  data: T[],
  threshold: number,
  getX: (d: T) => number,
  getY: (d: T) => number,
): T[] {
  const len = data.length
  if (threshold >= len || threshold < 3) return data

  const sampled: T[] = []
  const bucketSize = (len - 2) / (threshold - 2)

  // Always include the first point
  sampled.push(data[0]!)
  let prevIndex = 0

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate the average point in the next bucket (look-ahead)
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, len)

    let avgX = 0
    let avgY = 0
    const nextCount = nextBucketEnd - nextBucketStart
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += getX(data[j]!)
      avgY += getY(data[j]!)
    }
    avgX /= nextCount
    avgY /= nextCount

    // Find the point in the current bucket with the largest triangle area
    const curBucketStart = Math.floor(i * bucketSize) + 1
    const curBucketEnd = Math.floor((i + 1) * bucketSize) + 1

    const prevX = getX(data[prevIndex]!)
    const prevY = getY(data[prevIndex]!)

    let maxArea = -1
    let maxIndex = curBucketStart

    for (let j = curBucketStart; j < curBucketEnd; j++) {
      const area = Math.abs(
        (prevX - avgX) * (getY(data[j]!) - prevY) - (prevX - getX(data[j]!)) * (avgY - prevY),
      )
      if (area > maxArea) {
        maxArea = area
        maxIndex = j
      }
    }

    sampled.push(data[maxIndex]!)
    prevIndex = maxIndex
  }

  // Always include the last point
  sampled.push(data[len - 1]!)
  return sampled
}

/**
 * Convenience wrapper for MetricsDataPoint arrays.
 * Downsamples to `maxPoints` using the primary metric (first non-null numeric field)
 * as the Y-axis for triangle area calculation.
 */
export function downsampleMetrics<
  T extends {
    timestamp: string
    cpu?: number | null
    memory?: number | null
    pods?: number | null
  },
>(data: T[], maxPoints = 200): T[] {
  if (data.length <= maxPoints) return data

  return lttb(
    data,
    maxPoints,
    (d) => new Date(d.timestamp).getTime(),
    (d) => d.cpu ?? d.memory ?? d.pods ?? 0,
  )
}
