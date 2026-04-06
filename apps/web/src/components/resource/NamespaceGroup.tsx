'use client'

import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { chevronVariants } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface NamespaceGroupProps {
  namespace: string
  count: number
  children: ReactNode
  defaultOpen?: boolean
  /** Target open state for fold/unfold all commands */
  forceOpen?: boolean
  /** Incremented on each fold/unfold click — triggers the one-shot command */
  foldKey?: number
}

export function NamespaceGroup({
  namespace,
  count,
  children,
  defaultOpen = true,
  forceOpen,
  foldKey = 0,
}: NamespaceGroupProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)

  // Apply fold/unfold as a one-shot command (not a persistent lock).
  // Watching foldKey ensures the effect fires only when the user clicks
  // Fold/Unfold NS — individual namespace clicks are never overridden.
  useEffect(() => {
    if (foldKey > 0) {
      setInternalOpen(forceOpen ?? true)
    }
  }, [foldKey])
  const reducedMotion = useReducedMotion()

  const springTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 350, damping: 24 }

  return (
    <Collapsible open={internalOpen} onOpenChange={setInternalOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
        <motion.div
          variants={chevronVariants}
          animate={internalOpen ? 'expanded' : 'collapsed'}
          transition={springTransition}
        >
          <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
        </motion.div>
        <span className="text-xs font-semibold font-mono text-[var(--color-text-secondary)]">
          {namespace}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold">
          {count}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 border-l-2 border-[var(--color-accent)]/20 ml-2 pl-2">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
