'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { chevronVariants, expandVariants } from '@/lib/animation-constants'

interface ExpandableTableRowProps {
  cells: ReactNode
  detail: ReactNode
  columnCount: number
  defaultExpanded?: boolean
}

export function ExpandableTableRow({
  cells,
  detail,
  columnCount,
  defaultExpanded = false,
}: ExpandableTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const reducedMotion = useReducedMotion()

  const springTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 350, damping: 24 }

  return (
    <>
      {/* Summary row */}
      <tr
        className={[
          'cursor-pointer transition-colors duration-150',
          isExpanded ? 'bg-[var(--color-accent)]/[0.03]' : 'hover:bg-white/[0.02]',
        ].join(' ')}
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        {cells}
        <td className="w-8 pr-3 text-right">
          <motion.span
            className="inline-flex text-[var(--color-text-muted)]"
            variants={chevronVariants}
            animate={isExpanded ? 'expanded' : 'collapsed'}
            transition={springTransition}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </td>
      </tr>

      {/* Detail row */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <tr key="detail">
            <td colSpan={columnCount + 1} className="p-0">
              <motion.div
                variants={expandVariants}
                initial="collapsed"
                animate="expanded"
                exit="exit"
                style={{ overflow: 'hidden' }}
              >
                <div className="border-t border-[var(--color-border)]/30 bg-[var(--color-accent)]/[0.01]">
                  {detail}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  )
}
