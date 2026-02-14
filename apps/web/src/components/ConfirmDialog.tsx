'use client'

import { AlertTriangle } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
  error?: string | null
}

const variantStyles = {
  danger: 'bg-[var(--color-status-error)] text-white hover:opacity-90',
  warning: 'bg-[var(--color-status-warning)] text-white hover:opacity-90',
  default: 'bg-[var(--color-accent)] text-white hover:opacity-90',
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  error,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex items-start gap-3 mb-4">
        {variant === 'danger' && (
          <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-[var(--color-status-error)]/10">
            <AlertTriangle className="h-5 w-5 text-[var(--color-status-error)]" />
          </div>
        )}
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{description}</p>
      </div>
      {error && <p className="text-xs text-[var(--color-status-error)] mb-4" role="alert">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all disabled:opacity-50 cursor-pointer ${variantStyles[variant]}`}
        >
          {loading ? 'Processing…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
