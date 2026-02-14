'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { DURATION, EASING } from '@/lib/animation-constants'
import type { ReactNode } from 'react'

type Direction = 'up' | 'down' | 'left' | 'right'

const offsets: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 8 },
  down: { y: -8 },
  left: { x: 8 },
  right: { x: -8 },
}

interface SlideInProps {
  children: ReactNode
  className?: string
  direction?: Direction
  delay?: number
}

export function SlideIn({ children, className, direction = 'up', delay = 0 }: SlideInProps) {
  const reduced = useReducedMotion()

  if (reduced) return <div className={className}>{children}</div>

  const offset = offsets[direction]

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...offset }}
      transition={{ duration: DURATION.normal, ease: EASING.default, delay }}
    >
      {children}
    </motion.div>
  )
}
