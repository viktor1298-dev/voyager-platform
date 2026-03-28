'use client'

import { X } from 'lucide-react'
import type { TerminalSessionData } from './terminal-context'

interface TerminalTabProps {
  session: TerminalSessionData
  isActive: boolean
  onActivate: () => void
  onClose: () => void
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

export function TerminalTab({ session, isActive, onActivate, onClose }: TerminalTabProps) {
  const label = `${session.podName}/${session.container}`

  return (
    <div
      role="tab"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onActivate()
      }}
      title={label}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md
        transition-colors duration-150 cursor-pointer select-none
        ${
          isActive
            ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border border-b-0 border-[var(--color-border)]'
            : 'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]/50'
        }
      `}
    >
      <span className="font-mono">{truncate(label, 24)}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="ml-1 p-0.5 rounded hover:bg-[var(--color-border)] transition-colors duration-150 active:scale-95"
        title="Close terminal"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
