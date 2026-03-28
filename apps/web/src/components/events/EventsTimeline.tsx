'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import { TimelineSwimLane } from './TimelineSwimLane'
import { listContainerVariants, STAGGER } from '@/lib/animation-constants'

interface EventLike {
  type: string
  reason: string
  message: string
  namespace: string
  involvedObject: string
  count: number | null
  lastTimestamp: string | null
}

interface EventsTimelineProps {
  events: EventLike[]
}

/** Extract resource kind from involvedObject ("Pod/my-pod" -> "Pod") */
function getResourceKind(involvedObject: string): string {
  if (!involvedObject || involvedObject === '\u2014') return 'Unknown'
  if (involvedObject.includes('/')) {
    return involvedObject.split('/')[0]
  }
  return 'Other'
}

/** Format time axis label depending on total range */
function formatTickLabel(ts: number, rangeSec: number): string {
  const d = new Date(ts)
  if (rangeSec < 3600) {
    // < 1h: HH:MM:SS
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }
  if (rangeSec < 86400) {
    // 1h-24h: HH:MM
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  // > 24h: Mon Day
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Choose tick interval in ms based on range */
function computeTickInterval(rangeSec: number): number {
  if (rangeSec <= 300) return 60_000 // 1 min
  if (rangeSec <= 900) return 300_000 // 5 min
  if (rangeSec <= 3600) return 900_000 // 15 min
  if (rangeSec <= 21600) return 3600_000 // 1h
  if (rangeSec <= 86400) return 14400_000 // 4h
  return 86400_000 // 1 day
}

export function EventsTimeline({ events }: EventsTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set())
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragCurrent, setDragCurrent] = useState<number | null>(null)
  const timeAxisRef = useRef<HTMLDivElement>(null)

  // Calculate time range from events
  const { fullStart, fullEnd } = useMemo(() => {
    const timestamps = events
      .filter((e) => e.lastTimestamp)
      .map((e) => new Date(e.lastTimestamp!).getTime())

    if (timestamps.length === 0) {
      const now = Date.now()
      return { fullStart: now - 3600_000, fullEnd: now }
    }

    const min = Math.min(...timestamps)
    const max = Math.max(...timestamps)
    // Add 5% padding on each side
    const padding = Math.max((max - min) * 0.05, 60_000)
    return { fullStart: min - padding, fullEnd: max + padding }
  }, [events])

  const timelineStart = zoomRange?.start ?? fullStart
  const timelineEnd = zoomRange?.end ?? fullEnd
  const rangeSec = (timelineEnd - timelineStart) / 1000

  // Group events by resource kind
  const groupedLanes = useMemo(() => {
    const map = new Map<string, EventLike[]>()
    for (const event of events) {
      const kind = getResourceKind(event.involvedObject)
      if (!map.has(kind)) map.set(kind, [])
      map.get(kind)!.push(event)
    }
    // Sort lanes by event count (most active first)
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [events])

  // Compute tick marks
  const ticks = useMemo(() => {
    const interval = computeTickInterval(rangeSec)
    const start = Math.ceil(timelineStart / interval) * interval
    const result: number[] = []
    for (let t = start; t <= timelineEnd; t += interval) {
      result.push(t)
    }
    return result
  }, [timelineStart, timelineEnd, rangeSec])

  const toggleLane = useCallback((resourceType: string) => {
    setCollapsedLanes((prev) => {
      const next = new Set(prev)
      if (next.has(resourceType)) {
        next.delete(resourceType)
      } else {
        next.add(resourceType)
      }
      return next
    })
  }, [])

  const resetZoom = useCallback(() => {
    setZoomRange(null)
  }, [])

  // Drag-to-zoom handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timeAxisRef.current) return
      const rect = timeAxisRef.current.getBoundingClientRect()
      const fraction = (e.clientX - rect.left) / rect.width
      const ts = timelineStart + fraction * (timelineEnd - timelineStart)
      setDragStart(ts)
      setDragCurrent(ts)
    },
    [timelineStart, timelineEnd],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragStart === null || !timeAxisRef.current) return
      const rect = timeAxisRef.current.getBoundingClientRect()
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const ts = timelineStart + fraction * (timelineEnd - timelineStart)
      setDragCurrent(ts)
    },
    [dragStart, timelineStart, timelineEnd],
  )

  const handleMouseUp = useCallback(() => {
    if (dragStart !== null && dragCurrent !== null) {
      const start = Math.min(dragStart, dragCurrent)
      const end = Math.max(dragStart, dragCurrent)
      // Only zoom if selection is meaningful (>1% of range)
      if ((end - start) / (timelineEnd - timelineStart) > 0.01) {
        setZoomRange({ start, end })
      }
    }
    setDragStart(null)
    setDragCurrent(null)
  }, [dragStart, dragCurrent, timelineStart, timelineEnd])

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          No events in the selected time range.
        </p>
      </div>
    )
  }

  // Drag selection overlay
  const dragLeftPercent =
    dragStart !== null && dragCurrent !== null
      ? ((Math.min(dragStart, dragCurrent) - timelineStart) / (timelineEnd - timelineStart)) * 100
      : 0
  const dragWidthPercent =
    dragStart !== null && dragCurrent !== null
      ? (Math.abs(dragCurrent - dragStart) / (timelineEnd - timelineStart)) * 100
      : 0

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden"
    >
      {/* Header with zoom reset */}
      {zoomRange && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)]/50 bg-white/[0.02]">
          <span className="text-[10px] font-mono text-[var(--color-text-dim)]">
            Zoomed: {formatTickLabel(zoomRange.start, rangeSec)} -{' '}
            {formatTickLabel(zoomRange.end, rangeSec)}
          </span>
          <button
            type="button"
            onClick={resetZoom}
            className="flex items-center gap-1 text-[10px] text-[var(--color-accent)] hover:underline"
          >
            <RotateCcw className="h-3 w-3" />
            Reset zoom
          </button>
        </div>
      )}

      {/* Time axis */}
      <div
        ref={timeAxisRef}
        className="relative h-6 border-b border-[var(--color-border)]/50 ml-[120px] select-none cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {ticks.map((tick) => {
          const leftPercent = ((tick - timelineStart) / (timelineEnd - timelineStart)) * 100
          return (
            <div
              key={tick}
              className="absolute top-0 h-full flex flex-col items-center"
              style={{ left: `${leftPercent}%` }}
            >
              <div className="w-px h-2 bg-[var(--color-border)]" />
              <span className="text-[9px] font-mono text-[var(--color-text-dim)] whitespace-nowrap mt-0.5">
                {formatTickLabel(tick, rangeSec)}
              </span>
            </div>
          )
        })}

        {/* Drag selection overlay */}
        {dragStart !== null && dragCurrent !== null && dragWidthPercent > 0.5 && (
          <div
            className="absolute top-0 h-full bg-[var(--color-accent)]/10 border-l border-r border-[var(--color-accent)]/30"
            style={{ left: `${dragLeftPercent}%`, width: `${dragWidthPercent}%` }}
          />
        )}
      </div>

      {/* Swim lanes */}
      <div className="overflow-y-auto max-h-[600px]">
        <motion.div variants={listContainerVariants} initial="hidden" animate="visible">
          {groupedLanes.map(([resourceType, laneEvents]) => (
            <TimelineSwimLane
              key={resourceType}
              resourceType={resourceType}
              events={laneEvents}
              timelineStart={timelineStart}
              timelineEnd={timelineEnd}
              isCollapsed={collapsedLanes.has(resourceType)}
              onToggle={() => toggleLane(resourceType)}
            />
          ))}
        </motion.div>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-[var(--color-border)]/30 bg-white/[0.01]">
        <p className="text-[9px] text-[var(--color-text-dim)]">
          Drag across the time axis to zoom. Hover dots for details. Click lane labels to collapse.
        </p>
      </div>
    </div>
  )
}
