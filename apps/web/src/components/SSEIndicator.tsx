'use client'

import type { SSEConnectionState } from '@voyager/types'

const STATE_CONFIG: Record<SSEConnectionState, { color: string; label: string }> = {
  connecting: { color: 'bg-yellow-500', label: 'Connecting...' },
  connected: { color: 'bg-green-500', label: 'Live' },
  reconnecting: { color: 'bg-orange-500', label: 'Reconnecting...' },
  disconnected: { color: 'bg-red-500', label: 'Disconnected' },
}

interface SSEIndicatorProps {
  state: SSEConnectionState
  className?: string
}

export function SSEIndicator({ state, className = '' }: SSEIndicatorProps) {
  const config = STATE_CONFIG[state]

  return (
    <div
      className={`flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Server connection: ${config.label}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.color} ${state === 'connected' ? 'animate-pulse' : ''}`}
      />
      <span>{config.label}</span>
    </div>
  )
}
