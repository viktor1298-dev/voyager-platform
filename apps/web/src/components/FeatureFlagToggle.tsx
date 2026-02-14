'use client'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useEffect, useState } from 'react'

interface FeatureFlagToggleProps {
  name: string
  enabled: boolean
  critical?: boolean
  onToggle: (nextEnabled: boolean) => Promise<void>
}

export function FeatureFlagToggle({
  name,
  enabled,
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
      <button
        type="button"
        role="switch"
        aria-checked={localEnabled}
        aria-label={`${localEnabled ? 'Disable' : 'Enable'} feature flag ${name}`}
        onClick={requestToggle}
        disabled={isSaving}
        className={[
          'group relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50',
          'disabled:cursor-not-allowed disabled:opacity-60',
          localEnabled
            ? 'border-[var(--color-status-active)]/40 bg-[var(--color-status-active)]/25'
            : 'border-[var(--color-border)] bg-[var(--color-bg-surface)]',
        ].join(' ')}
      >
        <span
          className={[
            'h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200',
            localEnabled ? 'translate-x-7' : 'translate-x-0',
          ].join(' ')}
        />
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false)
          await runToggle(false)
        }}
        title="Disable critical feature flag"
        description={`"${name}" is marked as critical. Disabling it may impact platform operations.`}
        confirmLabel="Disable"
        variant="danger"
        loading={isSaving}
      />
    </>
  )
}
