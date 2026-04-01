'use client'

import { getTRPCClient } from '@/lib/trpc'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Loader2, UploadCloud } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  detectProviderFromKubeconfig,
  PROVIDER_LABELS,
  type DetectionResult,
} from '@voyager/config/providers'

type ClusterProviderOption = {
  id: 'kubeconfig' | 'aws' | 'azure' | 'gke' | 'minikube'
  label: string
  subtitle: string
  icon: string
}

export const CLUSTER_PROVIDERS = [
  { id: 'kubeconfig', label: 'Kubeconfig', subtitle: 'Upload config or paste YAML', icon: '📄' },
  { id: 'aws', label: 'AWS EKS', subtitle: 'Use IAM credentials + region', icon: '☁️' },
  { id: 'azure', label: 'Azure AKS', subtitle: 'Subscription and app credentials', icon: '🔷' },
  { id: 'gke', label: 'Google GKE', subtitle: 'Project + zone + service account JSON', icon: '🟢' },
  {
    id: 'minikube',
    label: 'Minikube / Local',
    subtitle: 'Cert files + local endpoint',
    icon: '🏠',
  },
] as const satisfies readonly ClusterProviderOption[]

type ProviderId = (typeof CLUSTER_PROVIDERS)[number]['id']
type Environment = 'production' | 'staging' | 'development'

type ConnectionConfig =
  | { kubeconfig: string; context?: string }
  | { accessKeyId: string; secretAccessKey: string; region: string; endpoint?: string }
  | { subscriptionId: string; resourceGroup: string; clusterName: string }
  | { serviceAccountJson: string; endpoint?: string }
  | { caCert?: string; clientCert?: string; clientKey?: string; endpoint: string }

export type AddClusterWizardPayload = {
  name: string
  provider: ProviderId
  environment: Environment
  endpoint: string
  connectionConfig: ConnectionConfig
}

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

const cardClass =
  'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 text-left transition-colors'
const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors'
const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsText(file)
  })
}

function FileDrop({
  label,
  accept,
  file,
  onFile,
  onError,
}: {
  label: string
  accept?: string
  file: File | null
  onFile: (file: File | null) => void
  onError: (message: string | null) => void
}) {
  const [dragActive, setDragActive] = useState(false)

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragActive(false)
    const dropped = e.dataTransfer.files?.[0] ?? null
    if (!dropped) return
    if (dropped.size > MAX_UPLOAD_SIZE_BYTES) {
      onError(`File too large (max 1MB): ${dropped.name}`)
      onFile(null)
      return
    }
    onError(null)
    onFile(dropped)
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
      <label
        aria-label={`${label} upload drop zone`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`${cardClass} flex cursor-pointer items-center gap-3 border-dashed ${dragActive ? 'border-[var(--color-accent)]' : ''}`}
      >
        <UploadCloud className="h-4 w-4 text-[var(--color-text-muted)]" />
        <div className="min-w-0">
          <p className="text-xs text-[var(--color-text-primary)] truncate">
            {file?.name ?? 'Drag & drop file or click to upload'}
          </p>
          <p className="text-xs text-[var(--color-text-dim)]">
            {file ? 'Click to replace' : 'Supports secure local upload'}
          </p>
        </div>
        <input
          type="file"
          className="hidden"
          accept={accept}
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null
            if (!selected) {
              onError(null)
              onFile(null)
              return
            }
            if (selected.size > MAX_UPLOAD_SIZE_BYTES) {
              onError(`File too large (max 1MB): ${selected.name}`)
              onFile(null)
              return
            }
            onError(null)
            onFile(selected)
          }}
        />
      </label>
    </div>
  )
}

export function AddClusterWizard({ pending, onCancel, onSubmit }: AddClusterWizardProps) {
  const reduced = useReducedMotion()
  const trpcClient = useMemo(() => getTRPCClient(), [])
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

  useEffect(() => {
    return () => {
      setAwsSecretKey('')
    }
  }, [])

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>Step {step}/4</span>
        <span>{currentProvider.label}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--color-bg-surface)]">
        <div
          className="h-2 rounded-full bg-[var(--color-accent)] transition-all"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduced ? undefined : { opacity: 0, y: 10 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.22 }}
          className="space-y-4"
        >
          {step === 1 && (
            <div
              className="grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Cluster provider"
            >
              {CLUSTER_PROVIDERS.map((p) => {
                const isSelected = provider === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setProvider(p.id)}
                    className={[
                      'relative rounded-xl p-3 text-left transition-all duration-200',
                      isSelected
                        ? 'border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/5 scale-[1.02]'
                        : 'border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-card-hover)]',
                    ].join(' ')}
                  >
                    {/* BUG-192-006: checkmark icon — visible only when selected */}
                    <span
                      className="absolute top-2 right-2 transition-all duration-200"
                      style={{ opacity: isSelected ? 1 : 0 }}
                      aria-hidden="true"
                    >
                      <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
                    </span>
                    <div className="text-lg">{p.icon}</div>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                      {p.label}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">{p.subtitle}</p>
                  </button>
                )
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {provider === 'kubeconfig' && (
                <>
                  <FileDrop
                    label="Kubeconfig file *"
                    file={kubeFile}
                    onFile={setKubeFile}
                    onError={setUploadError}
                  />
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Or paste kubeconfig text <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      rows={6}
                      value={kubeText}
                      onChange={(e) => setKubeText(e.target.value)}
                      placeholder="apiVersion: v1&#10;clusters:&#10;- cluster:&#10;    server: https://api.example.com:6443"
                      className={inputClass}
                    />
                    {submitAttempted && !kubeFile && !kubeText.trim() && (
                      <p className="text-xs text-red-400 mt-1">
                        Upload a kubeconfig file or paste the YAML content
                      </p>
                    )}
                  </div>
                </>
              )}

              {provider === 'aws' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Access Key ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={awsAccessKey}
                      onChange={(e) => setAwsAccessKey(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, awsAccessKey: true }))}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      className={inputClass}
                    />
                    {(touched.awsAccessKey || submitAttempted) && !awsAccessKey.trim() && (
                      <p className="text-xs text-red-400 mt-1">Access Key ID is required</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Secret Access Key <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={awsSecretKey}
                      onChange={(e) => setAwsSecretKey(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, awsSecretKey: true }))}
                      placeholder="Secret Access Key"
                      className={inputClass}
                    />
                    {(touched.awsSecretKey || submitAttempted) && !awsSecretKey.trim() && (
                      <p className="text-xs text-red-400 mt-1">Secret Access Key is required</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Region <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={awsRegion}
                      onChange={(e) => setAwsRegion(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, awsRegion: true }))}
                      placeholder="us-east-1"
                      className={inputClass}
                    />
                    {(touched.awsRegion || submitAttempted) && !awsRegion.trim() && (
                      <p className="text-xs text-red-400 mt-1">Region is required</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Endpoint
                    </label>
                    <input
                      value={awsEndpoint}
                      onChange={(e) => setAwsEndpoint(e.target.value)}
                      placeholder="arn:aws:eks:us-east-1:123456789:cluster/my-cluster"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {provider === 'azure' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Subscription ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={azureSubscriptionId}
                      onChange={(e) => setAzureSubscriptionId(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, azureSubscriptionId: true }))}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className={inputClass}
                    />
                    {(touched.azureSubscriptionId || submitAttempted) &&
                      !azureSubscriptionId.trim() && (
                        <p className="text-xs text-red-400 mt-1">Subscription ID is required</p>
                      )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Resource Group <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={azureResourceGroup}
                      onChange={(e) => setAzureResourceGroup(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, azureResourceGroup: true }))}
                      placeholder="my-resource-group"
                      className={inputClass}
                    />
                    {(touched.azureResourceGroup || submitAttempted) &&
                      !azureResourceGroup.trim() && (
                        <p className="text-xs text-red-400 mt-1">Resource Group is required</p>
                      )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Cluster Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={azureClusterName}
                      onChange={(e) => setAzureClusterName(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, azureClusterName: true }))}
                      placeholder="https://myaks.eastus.azmk8s.io"
                      className={inputClass}
                    />
                    {(touched.azureClusterName || submitAttempted) && !azureClusterName.trim() && (
                      <p className="text-xs text-red-400 mt-1">Cluster Name is required</p>
                    )}
                  </div>
                </div>
              )}

              {provider === 'gke' && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Service Account JSON <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      rows={6}
                      value={gkeServiceAccountJson}
                      onChange={(e) => setGkeServiceAccountJson(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, gkeServiceAccountJson: true }))}
                      placeholder={`{\n  "type": "service_account"\n}`}
                      className={inputClass}
                    />
                    {(touched.gkeServiceAccountJson || submitAttempted) &&
                      !gkeServiceAccountJson.trim() && (
                        <p className="text-xs text-red-400 mt-1">
                          Service Account JSON is required
                        </p>
                      )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Endpoint
                    </label>
                    <input
                      value={gkeEndpoint}
                      onChange={(e) => setGkeEndpoint(e.target.value)}
                      placeholder="https://35.xxx.xxx.xxx"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {provider === 'minikube' && (
                <div className="space-y-3">
                  <FileDrop
                    label="CA cert *"
                    file={minikubeCaCert}
                    onFile={setMinikubeCaCert}
                    onError={setUploadError}
                  />
                  <FileDrop
                    label="Client cert *"
                    file={minikubeClientCert}
                    onFile={setMinikubeClientCert}
                    onError={setUploadError}
                  />
                  <FileDrop
                    label="Client key *"
                    file={minikubeClientKey}
                    onFile={setMinikubeClientKey}
                    onError={setUploadError}
                  />
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                      Endpoint <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={minikubeEndpoint}
                      onChange={(e) => setMinikubeEndpoint(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, minikubeEndpoint: true }))}
                      placeholder="https://192.168.49.2:8443"
                      className={inputClass}
                    />
                    {(touched.minikubeEndpoint || submitAttempted) && !minikubeEndpoint.trim() && (
                      <p className="text-xs text-red-400 mt-1">Endpoint URL is required</p>
                    )}
                  </div>
                </div>
              )}

              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
              {!step2Valid && !uploadError && (
                <p className="text-xs text-red-400">
                  Fill the required credential fields to continue.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div
              aria-live="polite"
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4"
            >
              {validationState === 'testing' && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing connection...
                </div>
              )}
              {validationState === 'success' && (
                <p className="text-sm text-emerald-400">
                  Connection test passed. Ready to continue.
                </p>
              )}
              {validationState === 'error' && (
                <p className="text-sm text-red-400">
                  {validationError || 'Connection test failed. Check credentials and retry.'}
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm">
                <p className="text-[var(--color-text-secondary)]">
                  Provider:{' '}
                  <span className="text-[var(--color-text-primary)]">
                    {detectionResult?.label ?? currentProvider.label}
                  </span>
                </p>
                <p className="text-[var(--color-text-secondary)]">
                  Endpoint:{' '}
                  <span className="text-[var(--color-text-primary)] break-all">
                    {computedEndpoint}
                  </span>
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                    Environment
                  </label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as Environment)}
                    className={inputClass}
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
                    Cluster Name
                  </label>
                  <input
                    value={nameOverride}
                    onChange={(e) => setNameOverride(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, clusterName: true }))}
                    placeholder={`Default: ${suggestedName}`}
                    className={inputClass}
                  />
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">
                    Leave blank to use: {suggestedName}
                  </p>
                </div>
              </div>
              {!endpointValid && (
                <p className="text-xs text-red-400">
                  Enter a valid endpoint URL (e.g., https://api.example.com:6443)
                </p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <button
          aria-label={step === 1 ? 'Cancel wizard' : 'Go back to previous step'}
          type="button"
          onClick={step === 1 ? onCancel : () => setStep((s) => Math.max(1, s - 1))}
          className="px-4 py-2 text-sm font-medium rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <button
          aria-label={step === 4 ? 'Add cluster' : 'Go to next step'}
          type="button"
          disabled={pending || !canGoNext}
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
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {pending ? 'Adding…' : step === 4 ? 'Add Cluster' : 'Next'}
        </button>
      </div>
    </div>
  )
}
