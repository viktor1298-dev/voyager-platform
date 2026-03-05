import { type ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/**
 * Shared EmptyState component.
 * Used across pages to show a consistent empty/placeholder state.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)] text-center px-6">
      <div className="mb-4 opacity-40">
        {icon ?? <Inbox className="h-10 w-10" />}
      </div>
      <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{title}</p>
      {description && (
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
