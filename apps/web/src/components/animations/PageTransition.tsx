'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { pageVariants } from '@/lib/animation-constants'
import { type ReactNode, useEffect, useState } from 'react'

interface PageTransitionProps {
  children: ReactNode
  className?: string
}

/**
 * Page transition wrapper.
 * If the browser supports View Transitions API (handled by Next.js via globals.css),
 * this becomes a thin passthrough. Falls back to Motion for older browsers.
 *
 * View Transitions detection happens post-mount to avoid SSR hydration mismatch.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const reduced = useReducedMotion()
  const [hasViewTransitions, setHasViewTransitions] = useState(false)

  useEffect(() => {
    if ('startViewTransition' in document) {
      setHasViewTransitions(true)
    }
  }, [])

  // Skip Motion when reduced motion preferred or browser handles transitions natively
  if (reduced || hasViewTransitions) {
    return <div className={className}>{children}</div>
  }

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
