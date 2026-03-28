import type { ReactNode } from 'react'

interface DetailRowProps {
  icon?: ReactNode
  id: string
  meta?: string
}

export function DetailRow({ icon, id, meta }: DetailRowProps) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.02] border border-[var(--color-border)]/40 rounded-lg font-mono text-[11px] hover:bg-white/[0.04] transition-colors duration-150">
      {icon && (
        <span className="text-[var(--color-text-muted)] shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
      )}
      <span className="text-[var(--color-accent)] min-w-[110px]">{id}</span>
      {meta && <span className="text-[var(--color-text-muted)] flex-1 truncate">{meta}</span>}
    </div>
  )
}
