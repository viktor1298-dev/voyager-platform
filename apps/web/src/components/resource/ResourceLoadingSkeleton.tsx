'use client'

import { motion } from 'motion/react'
import { DURATION, EASING, STAGGER } from '@/lib/animation-constants'

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: STAGGER.fast,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.normal, ease: EASING.decelerate },
  },
}

/** Shimmer skeleton that mirrors the ResourcePageScaffold layout */
export function ResourceLoadingSkeleton() {
  return (
    <motion.div
      className="space-y-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      role="status"
      aria-label="Loading resources"
    >
      {/* Search bar */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <div className="flex-1 h-10 rounded-xl skeleton-shimmer" />
        <div className="h-10 w-24 rounded-xl skeleton-shimmer" />
        <div className="h-10 w-28 rounded-xl skeleton-shimmer" />
      </motion.div>

      {/* Namespace group 1 */}
      <motion.div variants={itemVariants} className="space-y-1.5">
        <div className="flex items-center gap-2 py-2">
          <div className="h-4 w-4 rounded skeleton-shimmer" />
          <div className="h-4 w-28 rounded skeleton-shimmer" />
          <div className="h-5 w-6 rounded-full skeleton-shimmer" />
        </div>
        {[0.92, 0.85, 0.78, 0.88].map((w, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="h-12 rounded-xl skeleton-shimmer"
            style={{ width: `${w * 100}%` }}
          />
        ))}
      </motion.div>

      {/* Namespace group 2 */}
      <motion.div variants={itemVariants} className="space-y-1.5">
        <div className="flex items-center gap-2 py-2">
          <div className="h-4 w-4 rounded skeleton-shimmer" />
          <div className="h-4 w-36 rounded skeleton-shimmer" />
          <div className="h-5 w-6 rounded-full skeleton-shimmer" />
        </div>
        {[0.88, 0.95, 0.82].map((w, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="h-12 rounded-xl skeleton-shimmer"
            style={{ width: `${w * 100}%` }}
          />
        ))}
      </motion.div>

      {/* Namespace group 3 (partial) */}
      <motion.div variants={itemVariants} className="space-y-1.5">
        <div className="flex items-center gap-2 py-2">
          <div className="h-4 w-4 rounded skeleton-shimmer" />
          <div className="h-4 w-24 rounded skeleton-shimmer" />
          <div className="h-5 w-6 rounded-full skeleton-shimmer" />
        </div>
        {[0.9, 0.84].map((w, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="h-12 rounded-xl skeleton-shimmer"
            style={{ width: `${w * 100}%` }}
          />
        ))}
      </motion.div>
    </motion.div>
  )
}

/** Table-style loading skeleton for Nodes and similar table pages */
export function TableLoadingSkeleton({ rows = 5, cols = 7 }: { rows?: number; cols?: number }) {
  const colWidths = [160, 70, 70, 100, 90, 80, 90]
  return (
    <motion.div
      className="rounded-xl border border-[var(--color-border)] overflow-hidden"
      style={{ background: 'var(--color-bg-card)' }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      role="status"
      aria-label="Loading table"
    >
      {/* Table header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center gap-4 px-4 py-3 border-b border-[var(--color-border)]"
      >
        {Array.from({ length: Math.min(cols, colWidths.length) }).map((_, i) => (
          <div
            key={i}
            className="h-3.5 rounded skeleton-shimmer"
            style={{ width: `${colWidths[i % colWidths.length]}px` }}
          />
        ))}
      </motion.div>

      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          variants={itemVariants}
          className="flex items-center gap-4 px-4 py-3.5 border-b border-[var(--color-border)]/30 last:border-0"
        >
          {Array.from({ length: Math.min(cols, colWidths.length) }).map((_, j) => (
            <div
              key={j}
              className="h-4 rounded skeleton-shimmer"
              style={{
                width: `${colWidths[j % colWidths.length] * (0.7 + Math.random() * 0.3)}px`,
              }}
            />
          ))}
        </motion.div>
      ))}
    </motion.div>
  )
}

/** Section-based loading skeleton for pages like Autoscaling, CRDs, RBAC */
export function SectionLoadingSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      role="status"
      aria-label="Loading sections"
    >
      {/* Metric cards row */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--color-border)] p-4 space-y-2"
            style={{ background: 'var(--color-bg-card)' }}
          >
            <div className="h-3 w-24 rounded skeleton-shimmer" />
            <div className="h-8 w-16 rounded skeleton-shimmer" />
          </div>
        ))}
      </motion.div>

      {/* Content sections */}
      {Array.from({ length: sections }).map((_, s) => (
        <motion.div key={s} variants={itemVariants} className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 w-5 rounded skeleton-shimmer" />
            <div className="h-5 w-32 rounded skeleton-shimmer" />
            <div className="h-5 w-8 rounded-full skeleton-shimmer" />
          </div>
          {[0.95, 0.9, 0.88].map((w, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              className="h-11 rounded-xl skeleton-shimmer"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </motion.div>
      ))}
    </motion.div>
  )
}
