'use client'

import { X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}

export function Dialog({ open, onClose, children, title }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl border border-[var(--color-border)] p-6 shadow-2xl animate-slide-up"
        style={{
          background: 'var(--color-bg-card)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{title}</h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
