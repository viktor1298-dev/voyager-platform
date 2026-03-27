'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  if (!open) return null
  return <>{children}</>
}

function SheetContent({
  className,
  children,
  side = 'right',
  onClose,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: 'right' | 'left'
  onClose?: () => void
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  // Focus trap: keep focus inside sheet when open
  React.useEffect(() => {
    if (!contentRef.current) return

    const sheet = contentRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const firstFocusable = sheet.querySelector<HTMLElement>(focusableSelector)
    firstFocusable?.focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusableElements = sheet.querySelectorAll<HTMLElement>(focusableSelector)
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
  }, [])

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed z-50 gap-4 p-6 shadow-lg overflow-y-auto animate-slide-in-right',
          side === 'right' && 'inset-y-0 right-0 h-full w-full sm:w-3/4 sm:max-w-md border-l',
          side === 'left' && 'inset-y-0 left-0 h-full w-full sm:w-3/4 sm:max-w-md border-r',
          'bg-[var(--elevated,#1e1e2e)] border-[var(--color-border)]',
          className,
        )}
        {...props}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="absolute right-4 top-4 flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4 text-[var(--color-text-muted)]" />
            <span className="sr-only">Close</span>
          </button>
        )}
        {children}
      </div>
    </>
  )
}

// Internal context for title ID — used by SheetTitle to connect aria-labelledby
function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-2', className)} {...props} />
}

function SheetTitle({
  className,
  children,
  id,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-lg font-semibold text-[var(--color-text-primary)]', className)}
      id={id}
      {...props}
    >
      {children}
    </h2>
  )
}

function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-[var(--color-text-muted)]', className)} {...props} />
}

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription }
