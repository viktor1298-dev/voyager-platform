'use client'

import { X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { dialogVariants, overlayVariants } from '@/lib/animation-constants'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}

export function Dialog({ open, onClose, children, title }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <m.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === overlayRef.current) onClose()
          }}
          initial={reduced ? undefined : 'hidden'}
          animate={reduced ? undefined : 'visible'}
          exit={reduced ? undefined : 'exit'}
        >
          <m.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={reduced ? undefined : overlayVariants}
            initial={reduced ? undefined : 'hidden'}
            animate={reduced ? undefined : 'visible'}
            exit={reduced ? undefined : 'exit'}
          />
          <m.div
            className="relative w-full max-w-lg max-w-[calc(100vw-2rem)] mx-4 rounded-xl border border-[var(--color-border)] p-4 sm:p-6 shadow-2xl"
            style={{ background: 'var(--elevated)' }}
            variants={reduced ? undefined : dialogVariants}
            initial={reduced ? undefined : 'hidden'}
            animate={reduced ? undefined : 'visible'}
            exit={reduced ? undefined : 'exit'}
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
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
