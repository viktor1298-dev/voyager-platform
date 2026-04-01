'use client'

import { DURATION, EASING } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'

interface KpiStripProps {
  clusterCount: number
  totalNodes: number
  runningPods: number
  totalPods: number
  warningEvents: number
  healthCounts: { healthy: number; degraded: number; critical: number }
  isLoading: boolean
}

function AnimatedNumber({ value, duration }: { value: number; duration: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!ref.current || reduced) {
      if (ref.current) ref.current.textContent = String(value)
      return
    }
    const el = ref.current
    const start = performance.now()
    const durationMs = duration * 1000

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - (1 - progress) ** 3 // ease-out cubic
      el.textContent = String(Math.round(eased * value))
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [value, duration, reduced])

  return (
    <span ref={ref} className="tabular-nums font-semibold text-[var(--color-text-primary)]">
      {reduced ? value : 0}
    </span>
  )
}

function KpiDot({ color, animate }: { color: string; animate?: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${animate ? 'animate-glow-warning' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
    />
  )
}

function HealthDots({ counts }: { counts: KpiStripProps['healthCounts'] }) {
  return (
    <div className="ml-auto flex items-center gap-2.5">
      <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-status-active)] shadow-[0_0_4px_var(--color-status-active)] transition-transform hover:scale-150" />
        <span className="tabular-nums">{counts.healthy}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-status-warning)] shadow-[0_0_4px_var(--color-status-warning)] transition-transform hover:scale-150" />
        <span className="tabular-nums">{counts.degraded}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-status-error)] shadow-[0_0_4px_var(--color-status-error)] transition-transform hover:scale-150" />
        <span className="tabular-nums">{counts.critical}</span>
      </div>
    </div>
  )
}

function Separator() {
  return <div className="h-4 w-px bg-[var(--color-border)]" />
}

export function KpiStrip({
  clusterCount,
  totalNodes,
  runningPods,
  totalPods,
  warningEvents,
  healthCounts,
  isLoading,
}: KpiStripProps) {
  const reduced = useReducedMotion()

  if (isLoading) {
    return (
      <div className="mb-4 flex items-center gap-4 px-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-20 animate-pulse rounded bg-[var(--color-bg-secondary)]" />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      className="mb-4 flex items-center gap-4 px-1 text-xs text-[var(--color-text-muted)]"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASING.default }}
    >
      <div className="flex items-center gap-1.5">
        <KpiDot color="var(--color-status-active)" />
        <AnimatedNumber value={clusterCount} duration={DURATION.counter} />
        <span>clusters</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5">
        <AnimatedNumber value={totalNodes} duration={DURATION.counter} />
        <span>nodes</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5">
        <AnimatedNumber value={runningPods} duration={DURATION.counter} />
        <span className="text-[var(--color-text-dim)]">/{totalPods}</span>
        <span>pods</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5">
        <KpiDot color="var(--color-status-warning)" animate={warningEvents > 0} />
        <AnimatedNumber value={warningEvents} duration={DURATION.counter} />
        <span>warnings</span>
      </div>
      <HealthDots counts={healthCounts} />
    </motion.div>
  )
}
