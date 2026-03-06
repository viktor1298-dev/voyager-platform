'use client'

import { useClusterContext } from '@/stores/cluster-context'
import type { Widget } from '@/stores/dashboard-layout'

export function LogTailWidget({ widget }: { widget: Widget }) {
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const maxLines = (widget.config?.maxLines as number) ?? 50

  return (
    <div className="h-full p-4 flex flex-col">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] pl-2 mb-3">
        Log Tail
      </h3>
      {!activeClusterId ? (
        <p className="text-xs text-[var(--color-text-dim)]">No cluster selected</p>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg bg-black/30 border border-[var(--color-border)]/40 p-2">
          <p className="text-[10px] font-mono text-[var(--color-text-dim)]">
            Cluster: {activeClusterId} · Max lines: {maxLines}
          </p>
          <p className="text-[10px] font-mono text-[var(--color-status-healthy)]/60 mt-1">
            [Live log tail — connect to cluster to stream logs]
          </p>
        </div>
      )}
    </div>
  )
}
