'use client'

import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { TimelineEventDot } from './TimelineEventDot'
import { swimLaneVariants, DURATION, EASING, STAGGER } from '@/lib/animation-constants'
import { useRef, useState, useEffect } from 'react'

interface EventLike {
  type: string
  reason: string
  message: string
  namespace: string
  involvedObject: string | { kind?: string; name?: string; namespace?: string } | null
  count: number | null
  lastTimestamp: string | null
}

interface TimelineSwimLaneProps {
  resourceType: string
  events: EventLike[]
  timelineStart: number
  timelineEnd: number
  isCollapsed: boolean
  onToggle: () => void
}

export function TimelineSwimLane({
  resourceType,
  events,
  timelineStart,
  timelineEnd,
  isCollapsed,
  onToggle,
}: TimelineSwimLaneProps) {
  const laneRef = useRef<HTMLDivElement>(null)
  const [laneWidth, setLaneWidth] = useState(0)

  useEffect(() => {
    if (!laneRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setLaneWidth(entry.contentRect.width)
      }
    })
    observer.observe(laneRef.current)
    return () => observer.disconnect()
  }, [])

  // Cap stagger at 300ms total
  const dotDelay = events.length > 0 ? Math.min(STAGGER.fast, 0.3 / events.length) : 0

  return (
    <motion.div
      variants={swimLaneVariants}
      className="flex items-stretch border-b border-[var(--color-border)]/30 last:border-b-0"
    >
      {/* Label column */}
      <button
        type="button"
        onClick={onToggle}
        className="w-[120px] shrink-0 flex items-center gap-1.5 px-2 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        <ChevronRight
          className={`h-3 w-3 text-[var(--color-text-dim)] transition-transform duration-150 ${
            isCollapsed ? '' : 'rotate-90'
          }`}
        />
        <span className="text-[12px] font-semibold text-[var(--color-text-secondary)] truncate">
          {resourceType}
        </span>
        <span className="text-[10px] font-mono text-[var(--color-text-dim)] ml-auto">
          {events.length}
        </span>
      </button>

      {/* Lane area */}
      <div ref={laneRef} className="flex-1 relative min-h-[28px]" style={{ overflow: 'visible' }}>
        {!isCollapsed &&
          laneWidth > 0 &&
          events.map((event, idx) => (
            <motion.div
              key={`${event.namespace}-${event.reason}-${event.lastTimestamp}-${idx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * dotDelay, duration: DURATION.fast }}
            >
              <TimelineEventDot
                event={event}
                timelineStart={timelineStart}
                timelineEnd={timelineEnd}
                laneWidth={laneWidth}
              />
            </motion.div>
          ))}
      </div>
    </motion.div>
  )
}
