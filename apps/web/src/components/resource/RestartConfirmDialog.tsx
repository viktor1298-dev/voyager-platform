'use client'

import { Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

interface RestartConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceType: string
  resourceName: string
  podCount: number
  onConfirm: () => void
  isRestarting?: boolean
}

export function RestartConfirmDialog({
  open,
  onOpenChange,
  resourceType,
  resourceName,
  podCount,
  onConfirm,
  isRestarting,
}: RestartConfirmDialogProps) {
  function handleClose() {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onClose={handleClose} title={`Restart ${resourceType}`}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          This will trigger a rolling restart of{' '}
          <strong className="text-[var(--color-text-primary)]">{podCount} pods</strong> managed by{' '}
          {resourceName}. Existing connections may be briefly interrupted.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer"
          >
            No, don&apos;t restart
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRestarting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRestarting && <Loader2 size={14} className="animate-spin" />}
            Restart
          </button>
        </div>
      </div>
    </Dialog>
  )
}
