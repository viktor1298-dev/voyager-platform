'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { timeAgo } from '@/lib/time-utils'

interface EventLike {
  type: string
  reason: string
  message: string
  namespace: string
  involvedObject: string | { kind?: string; name?: string; namespace?: string } | null
  count: number | null
  lastTimestamp: string | null
}

interface TimelineEventDotProps {
  event: EventLike
  timelineStart: number
  timelineEnd: number
  laneWidth: number
}

function involvedObjectText(obj: EventLike['involvedObject']): string {
  if (!obj) return '—'
  if (typeof obj === 'string') return obj
  return [obj.kind, obj.name].filter(Boolean).join('/') || '—'
}

function getEventColor(type: string): string {
  const lower = type.toLowerCase()
  if (lower.includes('error') || lower.includes('failed') || lower === 'warning') {
    if (lower === 'warning') return 'var(--color-timeline-warning)'
    return 'var(--color-timeline-error)'
  }
  return 'var(--color-timeline-normal)'
}

function getEventKind(involvedObject: EventLike['involvedObject']): string {
  if (!involvedObject) return ''
  if (typeof involvedObject === 'object') return involvedObject.kind || ''
  if (involvedObject.includes('/')) {
    return involvedObject.split('/')[0]
  }
  return ''
}

export function TimelineEventDot({
  event,
  timelineStart,
  timelineEnd,
  laneWidth,
}: TimelineEventDotProps) {
  const [showPopover, setShowPopover] = useState(false)
  const dotRef = useRef<HTMLDivElement>(null)

  const eventTime = event.lastTimestamp ? new Date(event.lastTimestamp).getTime() : timelineStart
  const range = timelineEnd - timelineStart
  const leftPx = range > 0 ? ((eventTime - timelineStart) / range) * laneWidth : 0

  const color = getEventColor(event.type)

  const truncatedMessage =
    event.message.length > 200 ? `${event.message.slice(0, 200)}...` : event.message

  return (
    <div
      ref={dotRef}
      className="absolute top-1/2 -translate-y-1/2"
      style={{ left: `${leftPx}px` }}
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      {/* Dot */}
      <div
        className="w-2 h-2 rounded-full cursor-pointer transition-opacity duration-150"
        style={{
          backgroundColor: color,
          opacity: showPopover ? 1 : 0.8,
          transform: 'translate(-50%, 0)',
        }}
      />

      {/* Popover on hover */}
      <AnimatePresence>
        {showPopover && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-lg p-3"
          >
            <div className="space-y-2">
              {/* Type badge */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                  style={{
                    color,
                    background: `color-mix(in srgb, ${color} 15%, transparent)`,
                  }}
                >
                  {event.type}
                </span>
                <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
                  {event.reason}
                </span>
              </div>

              {/* Message */}
              <p className="text-[10px] text-[var(--color-text-muted)] font-mono leading-relaxed break-words">
                {truncatedMessage}
              </p>

              {/* Details grid */}
              <div className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1 text-[10px] font-mono border-t border-[var(--color-border)]/50 pt-2">
                {event.involvedObject && involvedObjectText(event.involvedObject) !== '—' && (
                  <>
                    <span className="text-[var(--color-text-dim)]">Object</span>
                    <span className="text-[var(--color-accent)] truncate">
                      {involvedObjectText(event.involvedObject)}
                    </span>
                  </>
                )}
                {event.lastTimestamp && (
                  <>
                    <span className="text-[var(--color-text-dim)]">Last seen</span>
                    <span className="text-[var(--color-text-secondary)]">
                      {timeAgo(event.lastTimestamp)}
                    </span>
                  </>
                )}
                {event.count != null && event.count > 0 && (
                  <>
                    <span className="text-[var(--color-text-dim)]">Count</span>
                    <span className="text-[var(--color-text-secondary)]">{event.count}</span>
                  </>
                )}
                <span className="text-[var(--color-text-dim)]">Namespace</span>
                <span className="text-[var(--color-text-secondary)]">{event.namespace}</span>
              </div>
            </div>

            {/* Arrow */}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '5px solid var(--color-bg-card)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
