'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { STAGGER } from '@/lib/animation-constants'

interface Condition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

interface ConditionsListProps {
  conditions: Condition[]
}

function formatAge(isoTime?: string): string {
  if (!isoTime) return ''
  const diff = Date.now() - new Date(isoTime).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ConditionsList({ conditions }: ConditionsListProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div className="space-y-1">
      {conditions.map((condition, index) => {
        const delay = reducedMotion ? 0 : Math.min(index * STAGGER.fast, STAGGER.max)
        const isTrue = condition.status === 'True'
        const isFalse = condition.status === 'False'

        return (
          <motion.div
            key={condition.type}
            initial={reducedMotion ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.15, ease: [0.25, 0.1, 0.25, 1], delay }
            }
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[11px] hover:bg-white/[0.02] transition-colors duration-150"
          >
            {/* Status dot */}
            <span
              className={[
                'h-1.5 w-1.5 rounded-full shrink-0',
                isTrue
                  ? 'bg-emerald-400'
                  : isFalse
                    ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]'
                    : 'bg-amber-400',
              ].join(' ')}
            />

            {/* Type */}
            <span className="text-[var(--color-text-primary)] font-medium min-w-[120px]">
              {condition.type}
            </span>

            {/* Status */}
            <span
              className={[
                'font-mono min-w-[44px]',
                isTrue ? 'text-emerald-400' : isFalse ? 'text-red-400' : 'text-amber-400',
              ].join(' ')}
            >
              {condition.status}
            </span>

            {/* Reason */}
            {condition.reason && (
              <span className="text-[var(--color-text-muted)] truncate flex-1">
                {condition.reason}
              </span>
            )}

            {/* Age */}
            {condition.lastTransitionTime && (
              <span className="text-[var(--color-text-muted)] shrink-0 font-mono">
                {formatAge(condition.lastTransitionTime)}
              </span>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
