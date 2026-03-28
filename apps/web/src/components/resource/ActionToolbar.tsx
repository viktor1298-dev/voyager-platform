'use client'

import type { ElementType, ReactNode } from 'react'

export interface ActionButton {
  id: string
  label: string
  icon: ElementType
  variant: 'default' | 'accent' | 'destructive'
  onClick: () => void
  disabled?: boolean
  /** Optional custom render — used by PortForwardCopy to inject a Popover trigger */
  render?: (button: ReactNode) => ReactNode
}

interface ActionToolbarProps {
  actions: ActionButton[]
}

const variantClasses: Record<ActionButton['variant'], string> = {
  default:
    'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.06]',
  accent:
    'text-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/[0.08]',
  destructive: 'text-destructive hover:text-destructive hover:bg-destructive/[0.08]',
}

export function ActionToolbar({ actions }: ActionToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => {
        const Icon = action.icon
        const button = (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={[
              'flex items-center gap-1 h-8 px-2 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              variantClasses[action.variant],
            ].join(' ')}
          >
            <Icon size={12} />
            {action.label}
          </button>
        )

        if (action.render) {
          return <span key={action.id}>{action.render(button)}</span>
        }

        return button
      })}
    </div>
  )
}
