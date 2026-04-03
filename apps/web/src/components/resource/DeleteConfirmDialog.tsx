'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resourceType: string
  resourceName: string
  namespace: string
  onConfirm: () => void
  isDeleting?: boolean
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  resourceType,
  resourceName,
  namespace,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const isMatch = confirmText === resourceName

  function handleClose() {
    setConfirmText('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onClose={handleClose} title={`Delete ${resourceType}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (isMatch && !isDeleting) onConfirm()
        }}
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          This action cannot be undone. This will permanently delete the {resourceType}{' '}
          <strong className="text-[var(--color-text-primary)]">{resourceName}</strong> from
          namespace <strong className="text-[var(--color-text-primary)]">{namespace}</strong>.
        </p>

        <div className="space-y-2">
          <label
            htmlFor="delete-confirm-input"
            className="block text-sm text-[var(--color-text-secondary)]"
          >
            Type <strong className="text-[var(--color-text-primary)]">{resourceName}</strong> to
            confirm
          </label>
          <input
            id="delete-confirm-input"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-destructive/40 bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-destructive/50"
            placeholder={resourceName}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer"
          >
            Keep {resourceType}
          </button>
          <button
            type="submit"
            disabled={!isMatch || isDeleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isDeleting && <Loader2 size={14} className="animate-spin" />}I understand, delete this{' '}
            {resourceType}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
