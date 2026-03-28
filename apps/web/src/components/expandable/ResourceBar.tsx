'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { EASING } from '@/lib/animation-constants'

interface ResourceBarProps {
  label: string
  icon?: ReactNode
  used: number
  total: number
  unit?: string
  colorClass?: string
}

export function ResourceBar({ label, icon, used, total, unit, colorClass }: ResourceBarProps) {
  const reducedMotion = useReducedMotion()
  const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0

  const autoColorClass =
    colorClass ??
    (percent >= 85
      ? 'bg-gradient-to-r from-red-500 to-red-400'
      : percent >= 70
        ? 'bg-gradient-to-r from-amber-500 to-amber-400'
        : 'bg-gradient-to-r from-indigo-400 to-indigo-500')

  const unitSuffix = unit ? ` ${unit}` : ''

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-[var(--color-text-secondary)] font-medium">
          {icon && (
            <span className="text-[var(--color-text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
              {icon}
            </span>
          )}
          {label}
        </span>
        <span className="text-[var(--color-text-muted)] font-mono">
          {used}
          {unitSuffix} / {total}
          {unitSuffix}{' '}
          <span className="text-[var(--color-text-secondary)]">({Math.round(percent)}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          className={['h-full rounded-full', autoColorClass].join(' ')}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, ease: EASING.decelerate }}
        />
      </div>
    </div>
  )
}
