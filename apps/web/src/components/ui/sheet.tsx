"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

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
  side = "right",
  onClose,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: "right" | "left"
  onClose?: () => void
}) {
  // Find parent Sheet's onOpenChange via context or pass directly
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed z-50 gap-4 p-6 shadow-lg overflow-y-auto animate-slide-in-right",
          side === "right" && "inset-y-0 right-0 h-full w-3/4 max-w-md border-l",
          side === "left" && "inset-y-0 left-0 h-full w-3/4 max-w-md border-r",
          "bg-[var(--elevated,#1e1e2e)] border-[var(--color-border)]",
          className,
        )}
        {...props}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
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

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2", className)} {...props} />
}

function SheetTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-[var(--color-text-primary)]", className)} {...props}>{children}</h2>
}

function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--color-text-muted)]", className)} {...props} />
}

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription }
