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
        'rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-bg-card)]/90 backdrop-blur-md shadow-lg mb-3',
      )}
      data-testid="dashboard-edit-bar"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--color-accent)] uppercase tracking-wider">
          ✏️ Edit Mode
        </span>
        <button
          type="button"
          onClick={onAddWidget}
          aria-label="Add widget to dashboard"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30 transition-all min-h-[36px]"
          data-testid="add-widget-btn"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Add Widget
        </button>
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset dashboard to default layout"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-white/[0.05] hover:bg-white/[0.08] text-[var(--color-text-secondary)] border border-[var(--color-border)] transition-all min-h-[36px]"
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
          aria-label="Cancel editing dashboard"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors min-h-[36px]"
          data-testid="cancel-edit-btn"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-label="Save dashboard layout"
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-60 text-white transition-all min-h-[36px]"
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
