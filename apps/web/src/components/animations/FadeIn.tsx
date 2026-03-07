'use client'

import { m } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { fadeVariants, DURATION, EASING } from '@/lib/animation-constants'
import type { ReactNode } from 'react'

interface FadeInProps {
  children: ReactNode
  className?: string
  delay?: number
}

export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  const reduced = useReducedMotion()

  if (reduced) return <div className={className}>{children}</div>

  return (
    <m.div
      className={className}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={{
        ...fadeVariants,
        visible: {
          ...fadeVariants.visible,
          transition: { duration: DURATION.normal, ease: EASING.default, delay },
        },
      }}
    >
      {children}
    </m.div>
  )
}
