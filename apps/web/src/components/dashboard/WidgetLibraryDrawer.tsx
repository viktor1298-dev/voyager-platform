'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { WIDGET_REGISTRY, type WidgetType } from '@/stores/dashboard-layout'

interface WidgetLibraryDrawerProps {
  open: boolean
  onClose: () => void
  onAdd: (type: WidgetType) => void
}

export function WidgetLibraryDrawer({ open, onClose, onAdd }: WidgetLibraryDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Focus the close button when drawer opens
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
    }
  }, [open])

  // Focus trap + Escape key
  useEffect(() => {
    if (!open) return
    const drawer = drawerRef.current
    if (!drawer) return
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelectors))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Widget Library"
        className="fixed right-0 top-0 bottom-0 z-50 w-80 flex flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-2xl"
        data-testid="widget-library-drawer"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Widget Library
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close widget library"
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 text-[var(--color-text-secondary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {Object.values(WIDGET_REGISTRY).map((meta) => (
            <button
              key={meta.type}
              type="button"
              onClick={() => {
                onAdd(meta.type)
                onClose()
              }}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-[var(--color-border)]/50 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/5 text-left transition-all group"
              data-testid={`widget-type-${meta.type}`}
            >
              <span className="text-2xl mt-0.5 shrink-0">{meta.icon}</span>
              <div className="min-w-0">
                <span className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors block">
                  {meta.title}
                </span>
                <span className="text-xs text-[var(--color-text-dim)] leading-relaxed">
                  {meta.description}
                </span>
                <span className="text-xs font-mono text-[var(--color-text-dim)] mt-1 block">
                  {meta.defaultSize.w}×{meta.defaultSize.h} grid units
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
