'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { badgePopVariants, DURATION } from '@/lib/animation-constants'
import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
import { CLUSTER_PROVIDERS, type ProviderId } from './wizard-types'
import { resolveProviderIconKey } from './wizard-types'

interface WizardProviderTilesProps {
  provider: ProviderId
  onSelect: (id: ProviderId) => void
}

export function WizardProviderTiles({ provider, onSelect }: WizardProviderTilesProps) {
  const reduced = useReducedMotion()

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Cluster provider">
      {CLUSTER_PROVIDERS.map((p) => {
        const isSelected = provider === p.id
        const iconKey = resolveProviderIconKey(p.id)
        const iconConfig = PROVIDER_ICONS[iconKey]
        const brandColor = iconConfig?.color ?? '#9CA3AF'

        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(p.id)}
            className="relative flex items-center gap-3.5 rounded-xl border text-left cursor-pointer"
            style={{
              padding: '14px 16px',
              background: isSelected
                ? `color-mix(in srgb, ${brandColor} 5%, transparent)`
                : 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)',
              borderColor: isSelected ? 'transparent' : 'var(--color-border)',
              transition: `all ${DURATION.fast}s ease`,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'var(--color-bg-card-hover)'
                e.currentTarget.style.borderColor = 'var(--color-border-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background =
                  'color-mix(in srgb, var(--color-text-primary) 2%, transparent)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
              }
            }}
          >
            {/* Left accent bar */}
            {isSelected && (
              <span
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                style={{
                  background: brandColor,
                  boxShadow: `0 0 8px color-mix(in srgb, ${brandColor} 50%, transparent)`,
                }}
              />
            )}

            <ProviderLogo provider={p.id} size={24} />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{p.label}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{p.subtitle}</p>
            </div>

            {/* Radio indicator / checkmark */}
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 22,
                height: 22,
                border: isSelected ? 'none' : '2px solid var(--color-border)',
                background: isSelected ? 'var(--color-status-active)' : 'transparent',
                boxShadow: isSelected
                  ? '0 0 10px color-mix(in srgb, var(--color-status-active) 30%, transparent)'
                  : 'none',
                transition: `all ${DURATION.fast}s ease`,
              }}
            >
              <AnimatePresence>
                {isSelected && (
                  <motion.svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    initial={reduced ? undefined : 'hidden'}
                    animate={reduced ? undefined : 'visible'}
                    exit={reduced ? undefined : 'exit'}
                    variants={reduced ? undefined : badgePopVariants}
                  >
                    <path
                      d="M5 13l4 4L19 7"
                      fill="none"
                      stroke="#fff"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                )}
              </AnimatePresence>
            </div>
          </button>
        )
      })}
    </div>
  )
}
