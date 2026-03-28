'use client'

import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { motion } from 'motion/react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { chevronVariants } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface NamespaceGroupProps {
  namespace: string
  count: number
  children: ReactNode
  defaultOpen?: boolean
  /** Controlled open state — when defined, overrides internal state */
  forceOpen?: boolean
}

export function NamespaceGroup({
  namespace,
  count,
  children,
  defaultOpen = true,
  forceOpen,
}: NamespaceGroupProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = forceOpen !== undefined ? forceOpen : internalOpen
  const setOpen = (v: boolean) => {
    if (forceOpen === undefined) setInternalOpen(v)
  }
  const reducedMotion = useReducedMotion()

  const springTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 350, damping: 24 }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
        <motion.div
          variants={chevronVariants}
          animate={open ? 'expanded' : 'collapsed'}
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
