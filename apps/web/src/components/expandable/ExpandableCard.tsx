'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { chevronVariants, EASING, expandVariants } from '@/lib/animation-constants'

interface ExpandableCardProps {
  summary: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

export function ExpandableCard({
  summary,
  children,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
}: ExpandableCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isControlled = expanded !== undefined
  const isExpanded = isControlled ? expanded : internalExpanded

  const handleToggle = () => {
    const next = !isExpanded
    if (!isControlled) setInternalExpanded(next)
    onExpandedChange?.(next)
  }
  const reducedMotion = useReducedMotion()

  const springTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 350, damping: 24 }

  return (
    <div
      className={[
        'overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-200',
        isExpanded
          ? 'border-[var(--color-accent)]/30 shadow-[0_4px_24px_rgba(129,140,248,0.06)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/20',
      ].join(' ')}
    >
      {/* Summary row */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors duration-150 text-left"
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex-1 min-w-0">{summary}</div>
        <motion.div
          variants={chevronVariants}
          animate={isExpanded ? 'expanded' : 'collapsed'}
          transition={springTransition}
          className="ml-3 shrink-0 text-[var(--color-muted-foreground)]"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </button>

      {/* Expanded detail area */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            variants={expandVariants}
            initial="collapsed"
            animate="expanded"
            exit="exit"
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-[var(--color-border)]/40 bg-[var(--color-accent)]/[0.01]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
