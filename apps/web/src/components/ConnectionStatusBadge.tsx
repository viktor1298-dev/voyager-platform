'use client'

import type { ConnectionState } from '@/hooks/useResourceSSE'

const STATE_CONFIG: Record<ConnectionState, { color: string; label: string; pulse: boolean }> = {
  connected: { color: 'var(--color-status-active)', label: 'Live', pulse: true },
  reconnecting: { color: 'var(--color-status-warning)', label: 'Reconnecting...', pulse: true },
  disconnected: { color: 'var(--color-status-error)', label: 'Disconnected', pulse: false },
  initializing: { color: 'var(--color-status-idle)', label: 'Connecting...', pulse: true },
}

export function ConnectionStatusBadge({ state }: { state: ConnectionState }) {
  const config = STATE_CONFIG[state]
  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="status"
      aria-live="polite"
      data-connection={state}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full transition-colors duration-150${config.pulse ? ' animate-pulse' : ''}`}
        style={{ background: config.color }}
      />
      <span
        className="text-xs font-mono transition-colors duration-150"
        style={{ color: config.color }}
      >
        {config.label}
      </span>
    </span>
  )
}
