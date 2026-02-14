'use client'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { CircleHelp } from 'lucide-react'
import { useEffect, useState } from 'react'

interface FeatureFlagToggleProps {
  name: string
  enabled: boolean
  targeting: Record<string, unknown>
  critical?: boolean
  onToggle: (nextEnabled: boolean) => Promise<void>
}

const formatTargeting = (targeting: Record<string, unknown>) => JSON.stringify(targeting)

export function FeatureFlagToggle({
  name,
  enabled,
  targeting,
  critical = false,
  onToggle,
}: FeatureFlagToggleProps) {
  const [localEnabled, setLocalEnabled] = useState(enabled)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setLocalEnabled(enabled)
  }, [enabled])

  const runToggle = async (nextEnabled: boolean) => {
    const previous = localEnabled
    setLocalEnabled(nextEnabled)
    setIsSaving(true)
    try {
      await onToggle(nextEnabled)
    } catch {
      setLocalEnabled(previous)
    } finally {
      setIsSaving(false)
    }
  }

  const requestToggle = async () => {
    const nextEnabled = !localEnabled
    if (!nextEnabled && critical) {
      setConfirmOpen(true)
      return
    }
    await runToggle(nextEnabled)
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <span
          title={formatTargeting(targeting)}
          className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--color-text-dim)]"
        >
          <CircleHelp className="h-3 w-3" />
          targeting
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={localEnabled}
          aria-label={`${localEnabled ? 'Disable' : 'Enable'} feature flag ${name}`}
          onClick={requestToggle}
          disabled={isSaving}
          className={`relative h-6 w-11 rounded-full border transition-colors cursor-pointer disabled:opacity-60 ${
            localEnabled
              ? 'bg-[var(--color-status-active)]/30 border-[var(--color-status-active)]/40'
              : 'bg-[var(--color-bg-surface)] border-[var(--color-border)]'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${localEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false)
          await runToggle(false)
        }}
        title="Disable critical feature flag"
        description={`\"${name}\" is marked as critical. Disabling it may impact platform operations.`}
        confirmLabel="Disable"
        variant="danger"
        loading={isSaving}
      />
    </>
  )
}
