'use client'

/**
 * P3-007: Button micro-interactions
 * whileHover scale:1.02 + whileTap scale:0.97
 */

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { DURATION } from '@/lib/animation-constants'
import type { ComponentPropsWithoutRef } from 'react'

type MotionButtonProps = ComponentPropsWithoutRef<typeof motion.button>

export function MotionButton({ children, className, ...props }: MotionButtonProps) {
  const reduced = useReducedMotion()

  return (
    <motion.button
      whileHover={reduced ? undefined : { scale: 1.02 }}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={{ duration: DURATION.instant, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  )
}
