'use client'

import { motion } from 'motion/react'
import { Skeleton } from '@/components/ui/skeleton'
import { listContainerVariants } from '@/lib/animation-constants'
import { RbacCell } from './RbacCell'
import { Shield } from 'lucide-react'

interface RbacMatrixProps {
  subjects: string[]
  resources: string[]
  matrix: Record<string, Record<string, string[]>>
  onCellClick: (subject: string, resource: string) => void
  isLoading?: boolean
}

export function RbacMatrix({
  subjects,
  resources,
  matrix,
  onCellClick,
  isLoading,
}: RbacMatrixProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, r) => (
          <div key={r} className="flex gap-1">
            <Skeleton className="h-9 w-[200px]" />
            {Array.from({ length: 6 }).map((_, c) => (
              <Skeleton key={c} className="h-9 w-[80px]" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">
          <Shield className="h-8 w-8 text-[var(--color-text-dim)]" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">No RBAC Bindings</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
          No RBAC bindings found. Check cluster role bindings.
        </p>
      </div>
    )
  }

  // Limit displayed resources for readability (show top 20)
  const displayResources = resources.slice(0, 20)

  return (
    <motion.div
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
      className="overflow-auto rounded-lg border border-[var(--color-border)]"
    >
      <div className="inline-block min-w-full">
        <table className="border-collapse">
          <thead>
            <tr>
              {/* Sticky corner cell */}
              <th className="sticky left-0 z-20 bg-[var(--color-bg-card)] border-b border-r border-[var(--color-border)]/40 p-2 min-w-[200px] w-[200px]">
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Subject
                </span>
              </th>
              {/* Column headers */}
              {displayResources.map((resource) => (
                <th
                  key={resource}
                  className="border-b border-[var(--color-border)]/40 p-1 min-w-[80px] w-[80px]"
                >
                  <div className="h-[60px] flex items-end justify-center">
                    <span
                      className="text-[11px] font-semibold text-[var(--color-text-muted)] whitespace-nowrap origin-bottom-left"
                      style={{
                        writingMode: 'vertical-lr',
                        transform: 'rotate(180deg)',
                      }}
                    >
                      {resource}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject, rowIdx) => (
              <tr
                key={subject}
                className="hover:bg-white/[0.02] dark:hover:bg-white/[0.02] transition-colors"
              >
                {/* Sticky row label */}
                <td className="sticky left-0 z-10 bg-[var(--color-bg-card)] border-r border-b border-[var(--color-border)]/20 px-3 py-1">
                  <span
                    className="text-[12px] font-semibold font-mono text-[var(--color-text-primary)] truncate block max-w-[190px]"
                    title={subject}
                  >
                    {subject}
                  </span>
                </td>
                {/* CRUD cells */}
                {displayResources.map((resource, colIdx) => {
                  const verbs = matrix[subject]?.[resource] ?? []
                  return (
                    <td
                      key={resource}
                      className="border-b border-[var(--color-border)]/10 text-center"
                    >
                      <RbacCell
                        verbs={verbs}
                        onClick={() => onCellClick(subject, resource)}
                        index={rowIdx * displayResources.length + colIdx}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
