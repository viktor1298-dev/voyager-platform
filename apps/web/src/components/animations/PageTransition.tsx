'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { pageVariants } from '@/lib/animation-constants'
import type { ReactNode } from 'react'

interface PageTransitionProps {
  children: ReactNode
  className?: string
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const reduced = useReducedMotion()

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={pageVariants}
    >
      {children}
    </motion.div>
  )
}
