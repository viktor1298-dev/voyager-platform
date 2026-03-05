'use client'

import { GripVertical, Settings, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'
import { WidgetConfigModal } from './WidgetConfigModal'
import type { Widget } from '@/stores/dashboard-layout'

interface WidgetWrapperProps {
  widget: Widget
  editMode: boolean
  onRemove: (id: string) => void
  onConfigSave: (id: string, config: Record<string, unknown>) => void
  children: ReactNode
  className?: string
}

export function WidgetWrapper({
  widget,
  editMode,
  onRemove,
  onConfigSave,
  children,
  className,
}: WidgetWrapperProps) {
  const [configOpen, setConfigOpen] = useState(false)

  return (
    <div
      className={cn(
        'relative h-full rounded-xl border bg-[var(--color-bg-card)] overflow-hidden transition-all duration-200',
        editMode
          ? 'border-blue-500/50 border-dashed shadow-[0_0_0_1px_rgba(59,130,246,0.2)]'
          : 'border-[var(--color-border)]',
        className,
      )}
    >
      {editMode && (
        <>
          {/* Drag handle */}
          <div
            className="widget-drag-handle absolute top-0 left-0 z-10 flex items-center justify-center w-8 h-8 cursor-grab active:cursor-grabbing text-blue-400 hover:text-blue-300 transition-colors"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Config button */}
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="absolute top-1 right-8 z-10 flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors"
            title="Widget settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {/* Remove button */}
          <button
            type="button"
            onClick={() => onRemove(widget.id)}
            className="absolute top-1 right-1 z-10 flex items-center justify-center w-7 h-7 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
            title="Remove widget"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      <div className={cn('h-full', editMode && 'pt-1')}>{children}</div>

      {configOpen && (
        <WidgetConfigModal
          widget={widget}
          onClose={() => setConfigOpen(false)}
          onSave={(config) => {
            onConfigSave(widget.id, config)
            setConfigOpen(false)
          }}
        />
      )}
    </div>
  )
}
