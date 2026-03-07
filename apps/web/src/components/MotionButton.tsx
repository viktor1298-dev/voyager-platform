'use client'

/**
 * P3-007: Button micro-interactions
 * whileHover scale:1.02 + whileTap scale:0.97
 */

import { m } from 'motion/react'
import type { ComponentPropsWithoutRef } from 'react'

type MotionButtonProps = ComponentPropsWithoutRef<typeof m.button>

export function MotionButton({ children, className, ...props }: MotionButtonProps) {
  return (
    <m.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.08, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </m.button>
  )
}
