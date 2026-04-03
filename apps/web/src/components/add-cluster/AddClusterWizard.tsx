'use client'

import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { slideUpVariants, buttonHover, buttonTap, DURATION } from '@/lib/animation-constants'
import { getTRPCClient } from '@/lib/trpc'
import { detectProviderFromKubeconfig, type DetectionResult } from '@voyager/config/providers'

import { WizardLeftPanel } from './WizardLeftPanel'
import { WizardProviderTiles } from './WizardProviderTiles'
import { WizardCredentialForm } from './WizardCredentialForm'
import { WizardValidation } from './WizardValidation'
import { WizardReview } from './WizardReview'
import { WizardStepDots } from './WizardStepDots'

// Re-export types for consumers (clusters/page.tsx imports from here)
export { type AddClusterWizardPayload, CLUSTER_PROVIDERS } from './wizard-types'
import {
  CLUSTER_PROVIDERS,
  type ProviderId,
  type Environment,
  type ConnectionConfig,
  type AddClusterWizardPayload,
} from './wizard-types'

/* ── Types ──────────────────────────────────────────── */

type ValidateConnectionPayload = {
  provider: ProviderId
  endpoint: string
  connectionConfig: ConnectionConfig
}

interface AddClusterWizardProps {
  pending: boolean
  onCancel: () => void
  onSubmit: (payload: AddClusterWizardPayload) => void
}

/* ── Helpers ────────────────────────────────────────── */

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsText(file)
  })
}

const STEP_LABELS: Record<number, string | ((provider: ProviderId) => string)> = {
  1: 'Choose Provider',
  2: (provider: ProviderId) => {
    const p = CLUSTER_PROVIDERS.find((cp) => cp.id === provider)
    return p ? `${p.label} Credentials` : 'Enter Credentials'
  },
  3: 'Validating Connection',
  4: 'Review & Name',
}

function getStepLabel(step: number, provider: ProviderId): string {
  const label = STEP_LABELS[step]
  if (typeof label === 'function') return label(provider)
  return label ?? ''
}

/* ── Component ──────────────────────────────────────── */

export function AddClusterWizard({ pending, onCancel, onSubmit }: AddClusterWizardProps) {
  const reduced = useReducedMotion()
  const trpcClient = useMemo(() => getTRPCClient(), [])

  /* ── State ── */
  const [step, setStep] = useState(1)
  const [provider, setProvider] = useState<ProviderId>('kubeconfig')
  const [environment, setEnvironment] = useState<Environment>('production')
  const [nameOverride, setNameOverride] = useState('')

  const [kubeFile, setKubeFile] = useState<File | null>(null)
  const [kubeText, setKubeText] = useState('')
  const [kubeFileContent, setKubeFileContent] = useState('')

  const [awsAccessKey, setAwsAccessKey] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('')
  const [awsEndpoint, setAwsEndpoint] = useState('')

  const [azureSubscriptionId, setAzureSubscriptionId] = useState('')
  const [azureResourceGroup, setAzureResourceGroup] = useState('')
  const [azureClusterName, setAzureClusterName] = useState('')

  const [gkeServiceAccountJson, setGkeServiceAccountJson] = useState('')
  const [gkeEndpoint, setGkeEndpoint] = useState('')

  const [minikubeCaCert, setMinikubeCaCert] = useState<File | null>(null)
  const [minikubeClientCert, setMinikubeClientCert] = useState<File | null>(null)
  const [minikubeClientKey, setMinikubeClientKey] = useState<File | null>(null)
  const [minikubeEndpoint, setMinikubeEndpoint] = useState('')

  const [validationState, setValidationState] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle',
  )
  const [validationError, setValidationError] = useState<string>('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const currentProvider = CLUSTER_PROVIDERS.find((p) => p.id === provider)!

  /* ── Computed values ── */

  // Effective kubeconfig text — prefer textarea input, fall back to file content
  const effectiveKubeYaml = kubeText.trim() || kubeFileContent

  // Parse cluster name from kubeconfig (current-context or first context name)
  const kubeParsedName = useMemo(() => {
    if (!effectiveKubeYaml) return ''
    const ctxMatch = effectiveKubeYaml.match(/current-context:\s*(\S+)/)
    if (ctxMatch?.[1]) return ctxMatch[1]
    const nameMatch = effectiveKubeYaml.match(
      /contexts:\s*\n-\s*context:[\s\S]*?\n\s+name:\s*(\S+)/,
    )
    if (nameMatch?.[1]) return nameMatch[1]
    return ''
  }, [effectiveKubeYaml])

  // Detect cloud provider from kubeconfig content (multi-signal)
  const detectionResult = useMemo((): DetectionResult | null => {
    if (!effectiveKubeYaml) return null
    const result = detectProviderFromKubeconfig(effectiveKubeYaml)
    return result.confidence !== 'none' ? result : null
  }, [effectiveKubeYaml])

  const suggestedName = useMemo(
    () => kubeParsedName || `${provider}-${environment}-cluster`,
    [kubeParsedName, provider, environment],
  )

  const computedEndpoint = useMemo(() => {
    if (provider === 'minikube') return minikubeEndpoint.trim()
    if (provider === 'aws')
      return (
        awsEndpoint.trim() ||
        (awsRegion.trim() ? `https://eks.${awsRegion.trim()}.amazonaws.com` : '')
      )
    if (provider === 'azure') return 'https://management.azure.com'
    if (provider === 'gke') return gkeEndpoint.trim() || 'https://container.googleapis.com'
    // Extract server URL from kubeconfig YAML (textarea or uploaded file)
    if (provider === 'kubeconfig') {
      if (effectiveKubeYaml) {
        const match = effectiveKubeYaml.match(/server:\s*(https?:\/\/\S+)/)
        if (match?.[1]) return match[1]
      }
      return 'https://kubernetes.default.svc'
    }
    return 'https://kubernetes.default.svc'
  }, [provider, minikubeEndpoint, awsRegion, awsEndpoint, gkeEndpoint, effectiveKubeYaml])

  const endpointValid = useMemo(() => {
    try {
      if (!computedEndpoint) return false
      new URL(computedEndpoint)
      return true
    } catch {
      return false
    }
  }, [computedEndpoint])

  const step2Valid = useMemo(() => {
    if (uploadError) return false
    if (provider === 'kubeconfig') return Boolean(kubeFile || kubeText.trim())
    if (provider === 'aws')
      return Boolean(awsAccessKey.trim() && awsSecretKey.trim() && awsRegion.trim())
    if (provider === 'azure')
      return Boolean(
        azureSubscriptionId.trim() && azureResourceGroup.trim() && azureClusterName.trim(),
      )
    if (provider === 'gke') return Boolean(gkeServiceAccountJson.trim())
    if (provider === 'minikube') {
      return Boolean(
        minikubeCaCert && minikubeClientCert && minikubeClientKey && minikubeEndpoint.trim(),
      )
    }
    return false
  }, [
    provider,
    kubeFile,
    kubeText,
    awsAccessKey,
    awsSecretKey,
    awsRegion,
    azureSubscriptionId,
    azureResourceGroup,
    azureClusterName,
    gkeServiceAccountJson,
    minikubeCaCert,
    minikubeClientCert,
    minikubeClientKey,
    minikubeEndpoint,
    uploadError,
  ])

  const canGoNext =
    step === 1 ||
    (step === 2 && step2Valid) ||
    (step === 3 && validationState === 'success') ||
    (step === 4 && endpointValid)

  const finalName = nameOverride.trim() || suggestedName

  /* ── Effects ── */

  // Read kubeconfig file content into state for parsing (endpoint, cluster name, provider detection)
  useEffect(() => {
    if (!kubeFile) {
      setKubeFileContent('')
      return
    }
    readFileAsText(kubeFile)
      .then(setKubeFileContent)
      .catch(() => setKubeFileContent(''))
  }, [kubeFile])

  // Cleanup secrets on unmount
  useEffect(() => {
    return () => {
      setAwsSecretKey('')
    }
  }, [])

  // Run validation when entering step 3
  useEffect(() => {
    if (step !== 3) return

    let cancelled = false

    const runValidation = async () => {
      setValidationState('testing')
      setValidationError('')

      try {
        const connectionConfig = await buildConnectionConfig()
        const endpointForValidation =
          provider === 'minikube'
            ? minikubeEndpoint.trim()
            : provider === 'aws'
              ? awsEndpoint.trim() ||
                (awsRegion.trim() ? `https://eks.${awsRegion.trim()}.amazonaws.com` : '')
              : provider === 'azure'
                ? 'https://management.azure.com'
                : provider === 'gke'
                  ? gkeEndpoint.trim() || 'https://container.googleapis.com'
                  : 'https://kubernetes.default.svc'

        const input: ValidateConnectionPayload = {
          provider,
          endpoint: endpointForValidation,
          connectionConfig,
        }

        const result = await (
          trpcClient as unknown as {
            clusters: {
              validateConnection: {
                mutate: (
                  payload: ValidateConnectionPayload,
                ) => Promise<{ success: boolean; message?: string }>
              }
            }
          }
        ).clusters.validateConnection.mutate(input)

        if (!cancelled) {
          if (result.success) {
            setValidationState('success')
            return
          }

          setValidationState('error')
          setValidationError(
            result.message || 'Connection test failed. Check credentials and retry.',
          )
        }
      } catch (error) {
        if (!cancelled) {
          setValidationState('error')
          setValidationError(
            error instanceof Error ? error.message : 'Connection validation failed',
          )
        }
      }
    }

    void runValidation()

    return () => {
      cancelled = true
    }
  }, [
    step,
    trpcClient,
    provider,
    kubeFile,
    kubeText,
    awsAccessKey,
    awsSecretKey,
    awsRegion,
    awsEndpoint,
    azureSubscriptionId,
    azureResourceGroup,
    azureClusterName,
    gkeServiceAccountJson,
    gkeEndpoint,
    minikubeCaCert,
    minikubeClientCert,
    minikubeClientKey,
    minikubeEndpoint,
  ])

  /* ── Helpers ── */

  const buildConnectionConfig = async (): Promise<ConnectionConfig> => {
    if (provider === 'kubeconfig') {
      const fileContent = kubeFile ? await readFileAsText(kubeFile) : ''
      return { kubeconfig: kubeText.trim() || fileContent }
    }

    if (provider === 'aws') {
      return {
        accessKeyId: awsAccessKey.trim(),
        secretAccessKey: awsSecretKey,
        region: awsRegion.trim(),
        endpoint: awsEndpoint.trim() || undefined,
      }
    }

    if (provider === 'azure') {
      return {
        subscriptionId: azureSubscriptionId.trim(),
        resourceGroup: azureResourceGroup.trim(),
        clusterName: azureClusterName.trim(),
      }
    }

    if (provider === 'gke') {
      return {
        serviceAccountJson: gkeServiceAccountJson.trim(),
        endpoint: gkeEndpoint.trim() || undefined,
      }
    }

    return {
      caCert: minikubeCaCert ? await readFileAsText(minikubeCaCert) : undefined,
      clientCert: minikubeClientCert ? await readFileAsText(minikubeClientCert) : undefined,
      clientKey: minikubeClientKey ? await readFileAsText(minikubeClientKey) : undefined,
      endpoint: minikubeEndpoint.trim(),
    }
  }

  const submit = async () => {
    if (!endpointValid || !finalName) return
    const connectionConfig = await buildConnectionConfig()
    onSubmit({
      name: finalName,
      provider: (detectionResult?.provider as ProviderId) ?? provider,
      environment,
      endpoint: computedEndpoint,
      connectionConfig,
    })
  }

  /* ── Render ── */

  return (
    <div className="flex min-h-[480px] max-h-[80vh]">
      {/* Left Panel */}
      <WizardLeftPanel
        step={step}
        provider={provider}
        validationState={validationState}
        clusterName={finalName}
        endpoint={computedEndpoint}
        environment={environment}
        detectedProvider={detectionResult?.provider ?? null}
      />

      {/* Right Panel */}
      <div className="flex-1 flex flex-col p-7">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Add Cluster</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile step dots (hidden on sm+) */}
        <div className="sm:hidden flex justify-center mb-4">
          <WizardStepDots currentStep={step} totalSteps={4} />
        </div>

        {/* Step label */}
        <p className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wider mb-4">
          Step {step}/4 — {getStepLabel(step, provider)}
        </p>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={reduced ? undefined : slideUpVariants}
              initial={reduced ? undefined : 'hidden'}
              animate={reduced ? undefined : 'visible'}
              exit={reduced ? undefined : 'exit'}
            >
              {step === 1 && <WizardProviderTiles provider={provider} onSelect={setProvider} />}
              {step === 2 && (
                <WizardCredentialForm
                  provider={provider}
                  kubeFile={kubeFile}
                  onKubeFile={setKubeFile}
                  kubeText={kubeText}
                  onKubeText={setKubeText}
                  awsAccessKey={awsAccessKey}
                  onAwsAccessKey={setAwsAccessKey}
                  awsSecretKey={awsSecretKey}
                  onAwsSecretKey={setAwsSecretKey}
                  awsRegion={awsRegion}
                  onAwsRegion={setAwsRegion}
                  awsEndpoint={awsEndpoint}
                  onAwsEndpoint={setAwsEndpoint}
                  azureSubscriptionId={azureSubscriptionId}
                  onAzureSubscriptionId={setAzureSubscriptionId}
                  azureResourceGroup={azureResourceGroup}
                  onAzureResourceGroup={setAzureResourceGroup}
                  azureClusterName={azureClusterName}
                  onAzureClusterName={setAzureClusterName}
                  gkeServiceAccountJson={gkeServiceAccountJson}
                  onGkeServiceAccountJson={setGkeServiceAccountJson}
                  gkeEndpoint={gkeEndpoint}
                  onGkeEndpoint={setGkeEndpoint}
                  minikubeCaCert={minikubeCaCert}
                  onMinikubeCaCert={setMinikubeCaCert}
                  minikubeClientCert={minikubeClientCert}
                  onMinikubeClientCert={setMinikubeClientCert}
                  minikubeClientKey={minikubeClientKey}
                  onMinikubeClientKey={setMinikubeClientKey}
                  minikubeEndpoint={minikubeEndpoint}
                  onMinikubeEndpoint={setMinikubeEndpoint}
                  detectionResult={detectionResult}
                  uploadError={uploadError}
                  onUploadError={setUploadError}
                  touched={touched}
                  onTouch={(field) => setTouched((t) => ({ ...t, [field]: true }))}
                  submitAttempted={submitAttempted}
                  step2Valid={step2Valid}
                />
              )}
              {step === 3 && (
                <WizardValidation
                  validationState={validationState}
                  validationError={validationError}
                />
              )}
              {step === 4 && (
                <WizardReview
                  provider={provider}
                  detectedProvider={detectionResult?.provider ?? null}
                  currentProviderLabel={currentProvider.label}
                  detectedLabel={detectionResult?.label ?? null}
                  endpoint={computedEndpoint}
                  endpointValid={endpointValid}
                  environment={environment}
                  onEnvironment={setEnvironment}
                  nameOverride={nameOverride}
                  onNameOverride={setNameOverride}
                  suggestedName={suggestedName}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4 mt-4">
          <button
            aria-label={step === 1 ? 'Cancel wizard' : 'Go back to previous step'}
            type="button"
            onClick={step === 1 ? onCancel : () => setStep((s) => Math.max(1, s - 1))}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <motion.button
            aria-label={step === 4 ? 'Add cluster' : 'Go to next step'}
            type="button"
            disabled={pending || !canGoNext}
            whileHover={reduced ? undefined : buttonHover}
            whileTap={reduced ? undefined : buttonTap}
            onClick={() => {
              if (step < 4) {
                if (step === 2 && !step2Valid) {
                  setSubmitAttempted(true)
                  return
                }
                if (step === 3 && validationState === 'error') return
                setStep((s) => s + 1)
                return
              }
              if (!endpointValid || !finalName) {
                setSubmitAttempted(true)
                return
              }
              void submit()
            }}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {pending ? 'Adding...' : step === 4 ? 'Add Cluster' : 'Next'}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
