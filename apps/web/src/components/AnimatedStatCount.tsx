'use client'

/**
 * P3-006: Animated stat count-up using useMotionValue + animate()
 * 800ms decelerate easing for numbers, instant for non-numeric values
 */

import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef } from 'react'

interface AnimatedStatCountProps {
  value: string
  className?: string
}

function isNumeric(val: string): boolean {
  const trimmed = val.trim()
  // Match pure numbers or "X / Y" patterns
  return /^\d+(\s*\/\s*\d+)?$/.test(trimmed)
}

function parseNum(val: string): number {
  const n = Number.parseInt(val.replace(/[^0-9]/g, ''), 10)
  return Number.isNaN(n) ? 0 : n
}

/** Animate a single number */
function AnimatedNumber({ target, className }: { target: number; className?: string }) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => Math.floor(v))
  const prevTarget = useRef(0)

  useEffect(() => {
    const from = prevTarget.current
    prevTarget.current = target
    const duration = target > 1000 ? 1.2 : 0.8
    const controls = animate(count, target, {
      duration,
      ease: [0, 0, 0.2, 1],
      from,
    })
    return () => controls.stop()
  }, [target, count])

  return (
    <motion.span className={className}>
      {rounded}
    </motion.span>
  )
}

export function AnimatedStatCount({ value, className }: AnimatedStatCountProps) {
  if (!isNumeric(value) || value === '—') {
    return <span className={className}>{value}</span>
  }

  // Handle "X / Y" pattern (running pods / total pods)
  const slashMatch = value.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (slashMatch) {
    const a = parseInt(slashMatch[1] ?? '0', 10)
    const b = parseInt(slashMatch[2] ?? '0', 10)
    return (
      <span className={className}>
        <AnimatedNumber target={a} />
        {' / '}
        <AnimatedNumber target={b} />
      </span>
    )
  }

  const num = parseNum(value)
  return <AnimatedNumber target={num} className={className} />
}
