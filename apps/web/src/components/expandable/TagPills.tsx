'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { EASING, STAGGER } from '@/lib/animation-constants'

interface TagPillsProps {
  tags: Record<string, string>
}

export function TagPills({ tags }: TagPillsProps) {
  const reducedMotion = useReducedMotion()
  const entries = Object.entries(tags)

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value], index) => {
        const delay = reducedMotion ? 0 : Math.min(index * STAGGER.fast, STAGGER.max)
        return (
          <motion.span
            key={key}
            initial={reducedMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { ...EASING.bouncy, delay }}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-white/[0.03] border border-[var(--color-border)]/40 rounded-md font-mono text-[10px]"
          >
            <span className="text-[var(--color-accent)]">{key}</span>
            <span className="text-[var(--color-text-muted)]/60">=</span>
            <span className="text-[var(--color-text-secondary)]">{value}</span>
          </motion.span>
        )
      })}
    </div>
  )
}
