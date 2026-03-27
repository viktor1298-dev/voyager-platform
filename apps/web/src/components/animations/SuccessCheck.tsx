'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { successCheckVariants } from '@/lib/animation-constants'

interface SuccessCheckProps {
  className?: string
  size?: number
}

export function SuccessCheck({ className, size = 16 }: SuccessCheckProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
        <path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <motion.path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={successCheckVariants}
        initial="hidden"
        animate="visible"
      />
    </svg>
  )
}
