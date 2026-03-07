'use client'

/**
 * P3-011: vaul drawer for mobile pod/alert detail
 * Uses the vaul library for native-feeling bottom sheet on mobile
 */

import { Drawer } from 'vaul'

interface MobileDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
  /** Snap points for partial/full open, default: [0.5, 1] */
  snapPoints?: (number | string)[]
}

export function MobileDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  snapPoints = [0.5, 1],
}: MobileDrawerProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} snapPoints={snapPoints}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-[var(--color-bg-card)] border-t border-[var(--color-border)] max-h-[95vh]"
          aria-describedby={description ? 'drawer-description' : undefined}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2 shrink-0">
            <div className="h-1.5 w-12 rounded-full bg-[var(--color-border)]" />
          </div>

          {/* Header */}
          {(title || description) && (
            <div className="px-4 pb-3 border-b border-[var(--color-border)] shrink-0">
              {title && (
                <Drawer.Title className="text-base font-bold text-[var(--color-text-primary)]">
                  {title}
                </Drawer.Title>
              )}
              {description && (
                <p id="drawer-description" className="text-sm text-[var(--color-text-muted)] mt-0.5">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-4 py-4">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
