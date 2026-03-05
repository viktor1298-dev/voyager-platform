'use client'

import { Loader2, PanelRightOpen, RefreshCcw, Save, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface DashboardEditBarProps {
  onAddWidget: () => void
  onReset: () => void
  onCancel: () => void
  onSave: () => Promise<void>
}

export function DashboardEditBar({
  onAddWidget,
  onReset,
  onCancel,
  onSave,
}: DashboardEditBarProps) {
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        'sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-2',
        'rounded-xl border border-blue-500/40 bg-blue-950/80 backdrop-blur-md shadow-lg mb-3',
      )}
      data-testid="dashboard-edit-bar"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
          ✏️ Edit Mode
        </span>
        <button
          type="button"
          onClick={onAddWidget}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-all"
          data-testid="add-widget-btn"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Add Widget
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white/[0.05] hover:bg-white/[0.08] text-[var(--color-text-secondary)] border border-[var(--color-border)] transition-all"
          data-testid="reset-layout-btn"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Reset to Default
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors"
          data-testid="cancel-edit-btn"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white transition-all"
          data-testid="save-layout-btn"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save Layout
        </button>
      </div>
    </div>
  )
}
