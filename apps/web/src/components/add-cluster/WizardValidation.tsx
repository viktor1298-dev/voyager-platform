'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Circle, Loader2 } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { listContainerVariants, listItemVariants, DURATION } from '@/lib/animation-constants'
import { SuccessCheck } from '@/components/animations/SuccessCheck'

const VALIDATION_STEPS = [
  'Resolving endpoint',
  'Testing TLS handshake',
  'Authenticating credentials',
  'Fetching cluster metadata',
  'Verifying API access',
]

// Cosmetic timing: advance one sub-step every 600ms
const STEP_INTERVAL_MS = 600

interface WizardValidationProps {
  validationState: 'idle' | 'testing' | 'success' | 'error'
  validationError: string
}

export function WizardValidation({ validationState, validationError }: WizardValidationProps) {
  const reduced = useReducedMotion()
  const [cosmeticStep, setCosmeticStep] = useState(0)

  // Advance cosmetic sub-steps while testing
  useEffect(() => {
    if (validationState !== 'testing') return
    setCosmeticStep(0)
    const timer = setInterval(() => {
      setCosmeticStep((prev) => {
        // Stop at second-to-last — last step completes when real validation resolves
        if (prev >= VALIDATION_STEPS.length - 2) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, STEP_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [validationState])

  // When validation completes (success or error), mark all steps done
  const allDone = validationState === 'success'
  const failed = validationState === 'error'

  return (
    <div aria-live="polite">
      <motion.div
        className="flex flex-col gap-0.5"
        variants={reduced ? undefined : listContainerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'visible'}
      >
        {VALIDATION_STEPS.map((label, i) => {
          const isDone = allDone || (validationState === 'testing' && i < cosmeticStep)
          const isActive =
            !allDone && !failed && validationState === 'testing' && i === cosmeticStep
          const isPending = !isDone && !isActive

          return (
            <motion.div
              key={label}
              variants={reduced ? undefined : listItemVariants}
              className="flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm"
              style={{
                color: isDone
                  ? 'var(--color-status-active)'
                  : isActive
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-muted)',
                background: isActive
                  ? 'color-mix(in srgb, var(--color-accent) 5%, transparent)'
                  : 'transparent',
                opacity: isPending ? 0.4 : 1,
                transition: `all ${DURATION.normal}s ease`,
              }}
            >
              <div
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  background: isDone
                    ? 'color-mix(in srgb, var(--color-status-active) 15%, transparent)'
                    : isActive
                      ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                      : 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
                }}
              >
                {isDone ? (
                  <SuccessCheck size={14} className="text-[var(--color-status-active)]" />
                ) : isActive ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    style={{ color: 'var(--color-accent)' }}
                  />
                ) : (
                  <Circle className="h-3 w-3" style={{ color: 'var(--color-text-dim)' }} />
                )}
              </div>
              <span>{label}</span>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Error message */}
      {failed && (
        <p className="text-sm mt-3 px-3 text-[var(--color-status-error)]">
          {validationError || 'Connection test failed. Check credentials and retry.'}
        </p>
      )}

      {/* Success message */}
      {allDone && (
        <p className="text-sm mt-3 px-3 text-[var(--color-status-active)]">
          Connection test passed. Ready to continue.
        </p>
      )}
    </div>
  )
}
