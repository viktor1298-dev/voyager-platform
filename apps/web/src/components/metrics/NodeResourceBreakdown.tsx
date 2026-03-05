'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Server } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NodeStats {
  name: string
  cpuPercent: number | null
  memPercent: number | null
  cpuCores: number
  memGb: number
  cpuAllocCores: number | null
  memAllocGb: number | null
}

interface NodeResourceBreakdownProps {
  nodes: NodeStats[]
  className?: string
}

function NodeRow({ node }: { node: NodeStats }) {
  const cpuColor =
    (node.cpuPercent ?? 0) > 85
      ? 'hsl(0,84%,60%)'
      : (node.cpuPercent ?? 0) > 65
      ? 'hsl(48,96%,53%)'
      : 'hsl(262,83%,58%)'
  const memColor =
    (node.memPercent ?? 0) > 85
      ? 'hsl(0,84%,60%)'
      : (node.memPercent ?? 0) > 65
      ? 'hsl(48,96%,53%)'
      : 'hsl(199,89%,48%)'

  return (
    <div className="py-3 border-b border-[var(--color-border)]/30 last:border-0">
      <div className="flex items-center gap-2 mb-2">
        <Server className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        <span className="text-xs font-mono font-medium text-[var(--color-text-primary)]">{node.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {/* CPU */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">CPU</span>
            <span className="text-[11px] font-mono" style={{ color: cpuColor }}>
              {node.cpuPercent != null ? `${node.cpuPercent}%` : '—'}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
            {node.cpuPercent != null && (
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(node.cpuPercent, 100)}%`, background: cpuColor }}
              />
            )}
          </div>
          <p className="text-[10px] text-[var(--color-text-dim)] font-mono mt-0.5">
            {node.cpuCores.toFixed(2)}c
            {node.cpuAllocCores != null ? ` / ${node.cpuAllocCores.toFixed(1)}c` : ''}
          </p>
        </div>
        {/* Memory */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Memory</span>
            <span className="text-[11px] font-mono" style={{ color: memColor }}>
              {node.memPercent != null ? `${node.memPercent}%` : '—'}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
            {node.memPercent != null && (
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(node.memPercent, 100)}%`, background: memColor }}
              />
            )}
          </div>
          <p className="text-[10px] text-[var(--color-text-dim)] font-mono mt-0.5">
            {node.memGb.toFixed(2)} GB
            {node.memAllocGb != null ? ` / ${node.memAllocGb.toFixed(1)} GB` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

export function NodeResourceBreakdown({ nodes, className }: NodeResourceBreakdownProps) {
  const [open, setOpen] = useState(true)

  if (!nodes.length) return null

  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />
          )}
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Node Breakdown
          </span>
          <span className="text-xs text-[var(--color-text-muted)] font-mono">
            ({nodes.length} nodes)
          </span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-2">
          {nodes.map((node) => (
            <NodeRow key={node.name} node={node} />
          ))}
        </div>
      )}
    </div>
  )
}
