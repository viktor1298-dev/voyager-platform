'use client'

import { DURATION } from '@/lib/animation-constants'

interface WizardStepDotsProps {
  currentStep: number
  totalSteps: number
}

export function WizardStepDots({ currentStep, totalSteps }: WizardStepDotsProps) {
  return (
    <div className="flex gap-2.5">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isCompleted = step < currentStep
        const isActive = step === currentStep

        return (
          <div
            key={step}
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: isCompleted
                ? 'var(--color-status-active)'
                : isActive
                  ? 'var(--color-accent)'
                  : 'var(--color-border)',
              boxShadow: isCompleted
                ? '0 0 8px color-mix(in srgb, var(--color-status-active) 40%, transparent)'
                : isActive
                  ? '0 0 10px color-mix(in srgb, var(--color-accent) 40%, transparent)'
                  : 'none',
              transition: `all ${DURATION.normal}s ease`,
            }}
          />
        )
      })}
    </div>
  )
}
