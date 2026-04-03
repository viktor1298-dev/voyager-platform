'use client'

import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  fadeVariants,
  slideUpVariants,
  listContainerVariants,
  listItemVariants,
} from '@/lib/animation-constants'
import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
import { SuccessCheck } from '@/components/animations/SuccessCheck'
import { WizardStepDots } from './WizardStepDots'
import type { ProviderId, Environment } from './wizard-types'
import { resolveProviderIconKey } from './wizard-types'

// Short provider names for hero heading
const PROVIDER_SHORT_LABELS: Record<string, string> = {
  kubeconfig: 'Kubeconfig',
  aws: 'AWS EKS',
  azure: 'Azure AKS',
  gke: 'Google GKE',
  minikube: 'Minikube / Local',
}

// Full provider labels for the hero badge
const PROVIDER_FULL_LABELS: Record<string, string> = {
  kubeconfig: 'Generic Kubeconfig',
  aws: 'Amazon Elastic Kubernetes Service',
  azure: 'Microsoft Azure Kubernetes Service',
  gke: 'Google Kubernetes Engine',
  minikube: 'Local Kubernetes Cluster',
}

interface WizardLeftPanelProps {
  step: number
  provider: ProviderId
  validationState: 'idle' | 'testing' | 'success' | 'error'
  clusterName: string
  endpoint: string
  environment: Environment
  detectedProvider?: string | null
}

export function WizardLeftPanel({
  step,
  provider,
  validationState,
  clusterName,
  endpoint,
  environment,
  detectedProvider,
}: WizardLeftPanelProps) {
  const reduced = useReducedMotion()
  const displayProvider = detectedProvider ?? provider
  const iconKey = resolveProviderIconKey(displayProvider)
  const providerColor = PROVIDER_ICONS[iconKey]?.color ?? PROVIDER_ICONS.kubeconfig.color

  return (
    <div
      className="hidden sm:flex w-[320px] min-w-[320px] flex-col items-center justify-center relative border-r border-[var(--color-border)] overflow-hidden"
      style={{
        background:
          step === 2
            ? `linear-gradient(160deg, var(--elevated) 0%, var(--surface) 40%, color-mix(in srgb, ${providerColor} 6%, var(--surface)) 100%)`
            : 'var(--wizard-left-bg)',
      }}
    >
      {/* Ambient accent glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--color-accent) 6%, transparent) 0%, transparent 70%)',
        }}
      />

      {/* Step-adaptive content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="relative z-10 flex flex-col items-center text-center px-8"
          initial={reduced ? undefined : 'hidden'}
          animate={reduced ? undefined : 'visible'}
          exit={reduced ? undefined : 'exit'}
          variants={reduced ? undefined : fadeVariants}
        >
          {step === 1 && <Step1Content reduced={reduced} />}
          {step === 2 && <Step2Content provider={displayProvider} />}
          {step === 3 && <Step3Content validationState={validationState} reduced={reduced} />}
          {step === 4 && (
            <Step4Content
              provider={displayProvider}
              clusterName={clusterName}
              endpoint={endpoint}
              environment={environment}
              reduced={reduced}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Step dots */}
      <div className="absolute bottom-7">
        <WizardStepDots currentStep={step} totalSteps={4} />
      </div>
    </div>
  )
}

/** Step 1: Floating provider logo grid */
function Step1Content({ reduced }: { reduced: boolean }) {
  const providers = ['kubeconfig', 'aws', 'azure', 'gke', 'minikube'] as const
  return (
    <>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
        Connect Your Cluster
      </h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-5">
        Choose a provider to get started
      </p>
      <div className="flex flex-wrap gap-4 justify-center">
        {providers.map((id, i) => (
          <div
            key={id}
            className="rounded-xl flex items-center justify-center"
            style={{
              width: 52,
              height: 52,
              background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-text-primary) 6%, transparent)',
              animation: reduced ? 'none' : `wizard-float 4s ease-in-out infinite`,
              animationDelay: `${-i * 0.7}s`,
            }}
          >
            <ProviderLogo provider={id} size={24} />
          </div>
        ))}
      </div>
    </>
  )
}

/** Step 2: Hero provider logo */
function Step2Content({ provider }: { provider: string }) {
  const iconKey = resolveProviderIconKey(provider)
  const iconCfg = PROVIDER_ICONS[iconKey]
  return (
    <>
      <ProviderLogo provider={provider} size={48} layoutId="wizard-provider-logo" />
      <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mt-3">
        {PROVIDER_SHORT_LABELS[provider] ?? 'Kubeconfig'}
      </h3>
      <span
        className="text-xs mt-2 px-3 py-1 rounded-full"
        style={{
          backgroundColor:
            iconCfg?.bg ?? 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
          border: `1px solid color-mix(in srgb, ${iconCfg?.color ?? 'var(--color-accent)'} 15%, transparent)`,
          color: iconCfg?.color ?? 'var(--color-accent)',
        }}
      >
        {PROVIDER_FULL_LABELS[provider] ?? 'Kubernetes Cluster'}
      </span>
    </>
  )
}

/** Step 3: Connection ring animation */
function Step3Content({
  validationState,
  reduced,
}: {
  validationState: 'idle' | 'testing' | 'success' | 'error'
  reduced: boolean
}) {
  const isSuccess = validationState === 'success'
  const isError = validationState === 'error'
  const ringColor = isSuccess
    ? 'var(--wizard-ring-success)'
    : isError
      ? 'var(--wizard-ring-error)'
      : 'var(--wizard-ring-color)'

  return (
    <>
      <div className="relative" style={{ width: 120, height: 120 }}>
        {[0, 15, 30].map((inset, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              inset: `${inset}px`,
              border: `2px solid color-mix(in srgb, ${ringColor} 40%, transparent)`,
              animation:
                reduced || isSuccess || isError
                  ? 'none'
                  : `wizard-ring-pulse 2s ease-in-out ${i * 0.4}s infinite`,
              transition: 'border-color 0.3s ease',
            }}
          />
        ))}
        <div
          className="absolute rounded-full flex items-center justify-center"
          style={{
            inset: '42px',
            backgroundColor: `color-mix(in srgb, ${ringColor} 12%, transparent)`,
            border: `2px solid color-mix(in srgb, ${ringColor} 30%, transparent)`,
            transition: 'all 0.3s ease',
          }}
        >
          {isSuccess ? (
            <SuccessCheck size={20} className="text-[var(--color-status-active)]" />
          ) : isError ? (
            <XCircle className="h-5 w-5 text-[var(--color-status-error)]" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--color-accent)' }} />
          )}
        </div>
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mt-4">
        {isSuccess ? 'Connected!' : isError ? 'Connection failed' : 'Establishing connection...'}
      </p>
    </>
  )
}

/** Step 4: Review summary card */
function Step4Content({
  provider,
  clusterName,
  endpoint,
  environment,
  reduced,
}: {
  provider: string
  clusterName: string
  endpoint: string
  environment: string
  reduced: boolean
}) {
  const rows = [
    { label: 'Provider', value: provider },
    { label: 'Status', value: 'Connected', isStatus: true },
    { label: 'Endpoint', value: endpoint, isSmall: true },
    { label: 'Environment', value: environment.charAt(0).toUpperCase() + environment.slice(1) },
  ]

  return (
    <motion.div
      className="w-full rounded-xl border border-[var(--color-border)] p-5 text-left"
      style={{ background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)' }}
      initial={reduced ? undefined : 'hidden'}
      animate={reduced ? undefined : 'visible'}
      variants={reduced ? undefined : slideUpVariants}
    >
      <div className="text-center mb-4">
        <ProviderLogo provider={provider} size={32} layoutId="wizard-provider-logo" />
        <p className="text-base font-semibold text-[var(--color-text-primary)] mt-2">
          {clusterName || 'New Cluster'}
        </p>
      </div>
      <motion.div
        variants={reduced ? undefined : listContainerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'visible'}
      >
        {rows.map((row) => (
          <motion.div
            key={row.label}
            variants={reduced ? undefined : listItemVariants}
            className="flex justify-between items-center py-2 text-sm"
            style={{
              borderBottom:
                '1px solid color-mix(in srgb, var(--color-text-primary) 5%, transparent)',
            }}
          >
            <span className="text-[var(--color-text-muted)]">{row.label}</span>
            {row.isStatus ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--color-status-active) 10%, transparent)',
                  border:
                    '1px solid color-mix(in srgb, var(--color-status-active) 20%, transparent)',
                  color: 'var(--color-status-active)',
                }}
              >
                <CheckCircle2 className="h-3 w-3" />
                {row.value}
              </span>
            ) : (
              <span
                className={`text-[var(--color-text-primary)] font-medium ${row.isSmall ? 'text-xs max-w-[160px] truncate' : ''}`}
              >
                {row.value}
              </span>
            )}
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
