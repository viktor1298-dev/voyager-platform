'use client'

import { useCrosshairOptional } from './CrosshairProvider'

interface CrosshairCursorProps {
  /** Y-axis height of the chart area (from Recharts coordinates) */
  height?: number
  /** Y offset from top of chart area */
  top?: number
}

/**
 * Custom Recharts cursor that renders a vertical crosshair line.
 * Reads position from CrosshairProvider context for synchronized display
 * across multiple panels.
 */
export function CrosshairCursor({ height = 240, top = 0 }: CrosshairCursorProps) {
  const crosshair = useCrosshairOptional()
  const activeX = crosshair?.activeX

  if (activeX == null) return null

  return (
    <line
      x1={activeX}
      y1={top}
      x2={activeX}
      y2={top + height}
      stroke="var(--color-text-dim)"
      strokeWidth={1}
      strokeDasharray="4 3"
      pointerEvents="none"
    />
  )
}
