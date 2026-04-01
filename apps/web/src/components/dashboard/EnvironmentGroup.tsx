'use client'

import { ENV_META, type ClusterEnvironment } from '@/lib/cluster-meta'
import { DURATION, EASING } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface EnvironmentGroupProps {
  environment: ClusterEnvironment
  clusterCount: number
  children: ReactNode
}

export function EnvironmentGroup({ environment, clusterCount, children }: EnvironmentGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const reduced = useReducedMotion()
  const meta = ENV_META[environment]

  if (clusterCount === 0) return null

  return (
    <section className="mb-5">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="group/header mb-2.5 flex w-full items-center gap-2 px-1 text-left"
      >
        <span
          className="inline-block h-2 w-2 rounded-full transition-transform group-hover/header:scale-[1.3]"
          style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
          {meta.sectionLabel}
        </span>
        <span className="text-[11px] text-[var(--color-text-dim)]">
          {clusterCount} cluster{clusterCount !== 1 ? 's' : ''}
        </span>
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: DURATION.fast }}
          className="text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover/header:opacity-100"
        >
          <ChevronDown className="h-3 w-3" />
        </motion.span>
        <div className="ml-1 flex-1 h-px bg-gradient-to-r from-[var(--color-border)] to-transparent" />
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: EASING.spring.stiffness,
                damping: EASING.spring.damping,
              },
              opacity: { duration: DURATION.fast, delay: 0.05 },
            }}
            className="overflow-hidden"
            style={{
              overflow: 'clip',
              overflowClipMargin: '20px',
              paddingTop: 6,
              paddingBottom: 10,
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
