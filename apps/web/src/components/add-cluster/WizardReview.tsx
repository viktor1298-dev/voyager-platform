'use client'

import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
import { CheckCircle2 } from 'lucide-react'
import { DURATION } from '@/lib/animation-constants'
import type { ProviderId, Environment } from './wizard-types'
import { resolveProviderIconKey } from './wizard-types'

const inputClass =
  'w-full px-3 py-2.5 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors'

interface WizardReviewProps {
  provider: ProviderId
  detectedProvider: string | null
  currentProviderLabel: string
  detectedLabel: string | null
  endpoint: string
  endpointValid: boolean
  environment: Environment
  onEnvironment: (env: Environment) => void
  nameOverride: string
  onNameOverride: (name: string) => void
  suggestedName: string
}

export function WizardReview({
  provider,
  detectedProvider,
  currentProviderLabel,
  detectedLabel,
  endpoint,
  endpointValid,
  environment,
  onEnvironment,
  nameOverride,
  onNameOverride,
  suggestedName,
}: WizardReviewProps) {
  const displayProvider = detectedProvider ?? provider

  return (
    <div className="space-y-4">
      {/* Connection summary */}
      <div
        className="rounded-xl border border-[var(--color-border)] p-4 flex flex-col gap-2.5"
        style={{ background: 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)' }}
      >
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Provider</span>
          <span className="text-[var(--color-text-primary)] font-medium flex items-center gap-2">
            <ProviderLogo provider={displayProvider} size={16} />
            {detectedLabel ?? currentProviderLabel}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Endpoint</span>
          <span className="text-[var(--color-text-primary)] text-xs font-medium max-w-[280px] truncate">
            {endpoint}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Connection</span>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--color-status-active)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verified
          </span>
        </div>
      </div>

      {/* Environment + Name form */}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="wizard-environment"
            className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
          >
            Environment
          </label>
          <select
            id="wizard-environment"
            value={environment}
            onChange={(e) => onEnvironment(e.target.value as Environment)}
            className={inputClass}
            style={{ appearance: 'auto' }}
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="wizard-cluster-name"
            className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
          >
            Cluster Name
          </label>
          <input
            id="wizard-cluster-name"
            value={nameOverride}
            onChange={(e) => onNameOverride(e.target.value)}
            placeholder={`Default: ${suggestedName}`}
            className={inputClass}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)'
              e.currentTarget.style.boxShadow =
                '0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, transparent)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            Leave blank to use: {suggestedName}
          </p>
        </div>
      </div>

      {!endpointValid && (
        <p className="text-xs text-[var(--color-status-error)]">
          Enter a valid endpoint URL (e.g., https://api.example.com:6443)
        </p>
      )}
    </div>
  )
}
