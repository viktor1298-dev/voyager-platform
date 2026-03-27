'use client'

import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useCallback, useEffect, useId, useRef } from 'react'
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
  const contentRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const titleId = useId()

  // Focus trap: keep focus inside dialog when open
  useEffect(() => {
    if (!open || !contentRef.current) return

    const dialog = contentRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Focus the first focusable element inside the dialog
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const firstFocusable = dialog.querySelector<HTMLElement>(focusableSelector)
    firstFocusable?.focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusableElements = dialog.querySelectorAll<HTMLElement>(focusableSelector)
      if (focusableElements.length === 0) return

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleTab)
    return () => {
      document.removeEventListener('keydown', handleTab)
      previouslyFocused?.focus()
    }
  }, [open])

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
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === overlayRef.current) onClose()
          }}
          initial={reduced ? undefined : 'hidden'}
          animate={reduced ? undefined : 'visible'}
          exit={reduced ? undefined : 'exit'}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={reduced ? undefined : overlayVariants}
            initial={reduced ? undefined : 'hidden'}
            animate={reduced ? undefined : 'visible'}
            exit={reduced ? undefined : 'exit'}
          />
          <motion.div
            ref={contentRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className="relative w-full max-w-lg max-w-[calc(100vw-2rem)] mx-4 rounded-xl border border-[var(--color-border)] p-4 sm:p-6 shadow-2xl"
            style={{ background: 'var(--elevated)' }}
            variants={reduced ? undefined : dialogVariants}
            initial={reduced ? undefined : 'hidden'}
            animate={reduced ? undefined : 'visible'}
            exit={reduced ? undefined : 'exit'}
          >
            <div className="flex items-center justify-between mb-4">
              {title && (
                <h2 id={titleId} className="text-lg font-bold text-[var(--color-text-primary)]">
                  {title}
                </h2>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="ml-auto flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
