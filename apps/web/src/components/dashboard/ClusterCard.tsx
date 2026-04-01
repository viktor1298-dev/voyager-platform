'use client'

import { ENV_META, type ClusterEnvironment } from '@/lib/cluster-meta'
import { dashboardCardVariants, cardHover, cardTap, DURATION } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useCallback, useRef } from 'react'

interface ClusterCardProps {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  nodeCount: number
  runningPods: number
  totalPods: number
  source: 'live' | 'db'
  environment: ClusterEnvironment
  index: number
}

function getHealthLabel(status: string | null): { label: string; colorVar: string } {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') {
    return { label: 'healthy', colorVar: 'var(--color-status-active)' }
  }
  if (s === 'warning' || s === 'degraded') {
    return { label: 'degraded', colorVar: 'var(--color-status-warning)' }
  }
  return { label: 'critical', colorVar: 'var(--color-status-error)' }
}

function StatusDot({ status }: { status: string | null }) {
  const { label, colorVar } = getHealthLabel(status)
  const pulseClass =
    label === 'degraded'
      ? 'animate-glow-warning'
      : label === 'critical'
        ? 'animate-glow-critical'
        : ''

  return (
    <span
      className={`inline-block h-2 w-2 flex-shrink-0 rounded-full transition-transform group-hover:scale-[1.3] ${pulseClass}`}
      style={{ backgroundColor: colorVar, boxShadow: `0 0 6px ${colorVar}` }}
    />
  )
}

export function ClusterCard({
  id,
  name,
  provider,
  version,
  status,
  nodeCount,
  runningPods,
  totalPods,
  source,
  environment,
  index,
}: ClusterCardProps) {
  const reduced = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  const { label: healthLabel, colorVar: healthColor } = getHealthLabel(status)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = (((e.clientX - rect.left) / rect.width) * 100).toFixed(1)
    const y = (((e.clientY - rect.top) / rect.height) * 100).toFixed(1)
    cardRef.current.style.setProperty('--mouse-x', `${x}%`)
    cardRef.current.style.setProperty('--mouse-y', `${y}%`)
  }, [])

  return (
    <motion.div
      ref={cardRef}
      custom={index}
      variants={reduced ? undefined : dashboardCardVariants}
      initial={reduced ? false : 'hidden'}
      animate="visible"
      exit="exit"
      whileHover={reduced ? undefined : cardHover}
      whileTap={reduced ? undefined : cardTap}
      onMouseMove={handleMouseMove}
      className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3.5 px-4 cursor-pointer transition-colors hover:border-[var(--color-accent-glow)] hover:bg-[var(--color-bg-card-hover)] hover:[box-shadow:var(--shadow-card-hover)]"
    >
      {/* Radial mouse spotlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--color-accent-glow), transparent 40%)`,
          opacity: 0.4,
        }}
      />

      {/* Left accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-sm opacity-60 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: ENV_META[environment].color }}
      />

      <Link href={`/clusters/${id}`} className="relative z-10 flex flex-col gap-2.5">
        {/* Row 1 — Identity */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={status} />
            <span className="truncate text-[13px] font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-white dark:group-hover:text-white">
              {name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {source === 'live' && (
              <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium bg-[var(--color-status-active)]/10 text-[var(--color-status-active)]">
                <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--color-status-active)] animate-pulse" />
                SSE
              </span>
            )}
            <span className="text-[11px] text-[var(--color-text-dim)] transition-colors group-hover:text-[var(--color-text-muted)]">
              {provider}
              {version ? ` · v${version}` : ''}
            </span>
          </div>
        </div>

        {/* Row 2 — Metrics */}
        <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-text-secondary)]">
          <span>
            <span className="tabular-nums font-semibold text-[var(--color-text-secondary)]">
              {nodeCount}
            </span>{' '}
            nodes
          </span>
          {(runningPods > 0 || totalPods > 0) && (
            <span>
              <span className="tabular-nums font-semibold text-[var(--color-text-secondary)]">
                {runningPods}
              </span>
              <span className="text-[var(--color-text-dim)]">/{totalPods}</span> pods
            </span>
          )}
          <span className="font-medium" style={{ color: healthColor }}>
            ● {healthLabel}
          </span>
        </div>
      </Link>
    </motion.div>
  )
}
