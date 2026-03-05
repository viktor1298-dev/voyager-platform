'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import type { Widget } from '@/stores/dashboard-layout'
import { WIDGET_REGISTRY } from '@/stores/dashboard-layout'

interface WidgetConfigModalProps {
  widget: Widget
  onClose: () => void
  onSave: (config: Record<string, unknown>) => void
}

export function WidgetConfigModal({ widget, onClose, onSave }: WidgetConfigModalProps) {
  const meta = WIDGET_REGISTRY[widget.type]
  const [config, setConfig] = useState<Record<string, unknown>>(widget.config ?? {})

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {meta.icon} {meta.title} — Settings
            </h2>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">{meta.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 text-[var(--color-text-secondary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-border)]/50 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--color-text-dim)]">
              Widget ID: <span className="font-mono text-[var(--color-text-secondary)]">{widget.id}</span>
            </p>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              Type: <span className="font-mono text-[var(--color-text-secondary)]">{widget.type}</span>
            </p>
          </div>

          {widget.type === 'cluster-health' && (
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
                Show per-cluster breakdown
              </label>
              <input
                type="checkbox"
                checked={(config.showBreakdown as boolean) ?? true}
                onChange={(e) => setConfig((c) => ({ ...c, showBreakdown: e.target.checked }))}
                className="rounded"
              />
            </div>
          )}

          {widget.type === 'log-tail' && (
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
                Max log lines
              </label>
              <input
                type="number"
                min={10}
                max={500}
                value={(config.maxLines as number) ?? 50}
                onChange={(e) => setConfig((c) => ({ ...c, maxLines: Number(e.target.value) }))}
                className="w-full rounded-md border border-[var(--color-border)] bg-white/[0.04] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(config)}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
