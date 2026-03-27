'use client'

/**
 * P3-006: Animated stat count-up using useMotionValue + animate()
 * 800ms decelerate easing for numbers, instant for non-numeric values
 * H1: Respects prefers-reduced-motion — skips animation when user prefers reduced
 */

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useRef } from 'react'
import { DURATION, EASING } from '@/lib/animation-constants'

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

/** Animate a single number — skips animation if user prefers reduced motion */
function AnimatedNumber({ target, className }: { target: number; className?: string }) {
  const prefersReduced = useReducedMotion()
  const count = useMotionValue(prefersReduced ? target : 0)
  const rounded = useTransform(count, (v) => Math.floor(v))
  const prevTarget = useRef(prefersReduced ? target : 0)

  useEffect(() => {
    if (prefersReduced) {
      // Skip animation — jump to final value immediately
      count.set(target)
      prevTarget.current = target
      return
    }
    const from = prevTarget.current
    prevTarget.current = target
    const duration = target > 1000 ? DURATION.counterLarge : DURATION.counter
    const controls = animate(count, target, {
      duration,
      ease: EASING.decelerate,
      from,
    })
    return () => controls.stop()
  }, [target, count, prefersReduced])

  return <motion.span className={className}>{rounded}</motion.span>
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
