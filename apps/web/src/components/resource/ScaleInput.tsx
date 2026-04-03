'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

interface ScaleInputProps {
  currentReplicas: number
  onScale: (newReplicas: number) => void
  isScaling?: boolean
}

export function ScaleInput({ currentReplicas, onScale, isScaling }: ScaleInputProps) {
  const [value, setValue] = useState(currentReplicas)
  const hasChanged = value !== currentReplicas
  const isValid = value >= 0 && value <= 100

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (hasChanged && isValid && !isScaling) onScale(value)
      }}
    >
      <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
        Current: {currentReplicas}
      </span>

      {hasChanged && (
        <span className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
          {currentReplicas} &rarr; {value}
        </span>
      )}

      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Math.max(0, Math.min(100, Number(e.target.value))))}
        className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="New replicas"
      />

      <button
        type="submit"
        disabled={!hasChanged || !isValid || isScaling}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {isScaling && <Loader2 size={12} className="animate-spin" />}
        Update Replicas
      </button>
    </form>
  )
}
