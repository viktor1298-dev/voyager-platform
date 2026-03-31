'use client'

import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { resolveResourceStatus } from '@/lib/resource-status.js'
import { resourceStatusGlow } from '@/lib/animation-constants.js'

interface ResourceStatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZE_CLASSES = {
  sm: { badge: 'gap-1 px-1.5 py-0.5 text-[10px] rounded-md', icon: 'h-3 w-3' },
  md: { badge: 'gap-1.5 px-2.5 py-0.5 text-xs rounded-lg', icon: 'h-3.5 w-3.5' },
} as const

export function ResourceStatusBadge({ status, size = 'md', className }: ResourceStatusBadgeProps) {
  const { colorVar, Icon, animation } = resolveResourceStatus(status)
  const shouldReduceMotion = useReducedMotion()
  const sizeClasses = SIZE_CLASSES[size]

  const isGlow = animation === 'glow-critical' || animation === 'glow-fatal'
  const isSpin = animation === 'spin'
  const glowKey = animation === 'glow-critical' ? 'critical' : 'fatal'

  const badgeStyle = {
    color: colorVar,
    backgroundColor: `color-mix(in srgb, ${colorVar} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${colorVar} ${isGlow ? '25' : '20'}%, transparent)`,
  }

  const badge = (
    <span
      className={cn(
        'inline-flex items-center font-medium border whitespace-nowrap',
        sizeClasses.badge,
        className,
      )}
      style={badgeStyle}
      role="status"
      aria-label={`Status: ${status}`}
    >
      <Icon
        className={cn(
          sizeClasses.icon,
          'shrink-0',
          isSpin && !shouldReduceMotion && 'animate-spin',
        )}
        style={isSpin && !shouldReduceMotion ? { animationDuration: '2s' } : undefined}
        aria-hidden="true"
      />
      {status}
    </span>
  )

  // Wrap in motion.span for glow animation on Critical/Fatal
  if (isGlow && !shouldReduceMotion) {
    return (
      <motion.span
        className="inline-flex rounded-lg"
        initial="idle"
        animate={glowKey}
        variants={resourceStatusGlow}
      >
        {badge}
      </motion.span>
    )
  }

  return badge
}
