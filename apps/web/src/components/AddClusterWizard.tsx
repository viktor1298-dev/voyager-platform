'use client'

import { getTRPCClient } from '@/lib/trpc'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, UploadCloud } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'

type ClusterProviderOption = {
  id: 'kubeconfig' | 'aws' | 'azure' | 'gke' | 'minikube'
  label: string
  subtitle: string
  icon: string
}

export const CLUSTER_PROVIDERS = [
  { id: 'kubeconfig', label: 'Kubeconfig', subtitle: 'Upload config or paste YAML', icon: '📄' },
  { id: 'aws', label: 'AWS EKS', subtitle: 'Use IAM credentials + region', icon: '☁️' },
  { id: 'azure', label: 'Azure AKS', subtitle: 'Subscription and cluster details', icon: '🔷' },
  { id: 'gke', label: 'Google GKE', subtitle: 'Service account JSON', icon: '🟢' },
  { id: 'minikube', label: 'Minikube / Local', subtitle: 'Cert files + local endpoint', icon: '🏠' },
] as const satisfies readonly ClusterProviderOption[]

type ProviderId = (typeof CLUSTER_PROVIDERS)[number]['id']
type Environment = 'prod' | 'staging' | 'dev'

type ConnectionConfig = {
  kubeconfig?: { content?: string }
  aws?: { accessKeyId: string; secretAccessKey: string; region: string; roleArn?: string }
  azure?: { subscriptionId?: string; resourceGroup?: string; clusterName?: string; servicePrincipal?: string }
  gke?: { serviceAccountJson?: string }
  minikube?: { caCert?: string; clientCert?: string; clientKey?: string; endpoint: string }
}

export type AddClusterWizardPayload = {
  name: string
  provider: ProviderId
  endpoint: string
  connectionConfig: ConnectionConfig
}

type ValidateConnectionPayload = {
  provider: ProviderId
  endpoint: string
  connectionConfig: ConnectionConfig
}

type ValidateConnectionClient = {
  mutation: (path: 'clusters.validateConnection', input: ValidateConnectionPayload) => Promise<unknown>
}

interface AddClusterWizardProps {
  pending: boolean
  onCancel: () => void
  onSubmit: (payload: AddClusterWizardPayload) => void
}

const cardClass = 'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 text-left transition-colors'
const inputClass = 'w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors'
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
          <p className="text-xs text-[var(--color-text-primary)] truncate">{file?.name ?? 'Drag & drop file or click to upload'}</p>
          <p className="text-[11px] text-[var(--color-text-dim)]">{file ? 'Click to replace' : 'Supports secure local upload'}</p>
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
  const [environment, setEnvironment] = useState<Environment>('prod')
  const [nameOverride, setNameOverride] = useState('')

  const [kubeFile, setKubeFile] = useState<File | null>(null)
  const [kubeText, setKubeText] = useState('')

  const [awsAccessKey, setAwsAccessKey] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('')
  const [awsRoleArn, setAwsRoleArn] = useState('')

  const [azureSubscriptionId, setAzureSubscriptionId] = useState('')
  const [azureResourceGroup, setAzureResourceGroup] = useState('')
  const [azureClusterName, setAzureClusterName] = useState('')
  const [azureServicePrincipal, setAzureServicePrincipal] = useState('')

  const [gkeServiceAccount, setGkeServiceAccount] = useState<File | null>(null)

  const [minikubeCaCert, setMinikubeCaCert] = useState<File | null>(null)
  const [minikubeClientCert, setMinikubeClientCert] = useState<File | null>(null)
  const [minikubeClientKey, setMinikubeClientKey] = useState<File | null>(null)
  const [minikubeEndpoint, setMinikubeEndpoint] = useState('')

  const [validationState, setValidationState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [validationError, setValidationError] = useState<string>('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const currentProvider = CLUSTER_PROVIDERS.find((p) => p.id === provider)!

  const suggestedName = useMemo(() => `${provider}-${environment}-cluster`, [provider, environment])

  useEffect(() => {
    return () => {
      setAwsSecretKey('')
    }
  }, [])

  const buildConnectionConfig = async (): Promise<ConnectionConfig> => {
    if (provider === 'kubeconfig') {
      const fileContent = kubeFile ? await readFileAsText(kubeFile) : ''
      return { kubeconfig: { content: kubeText.trim() || fileContent } }
    }

    if (provider === 'aws') {
      return {
        aws: {
          accessKeyId: awsAccessKey.trim(),
          secretAccessKey: awsSecretKey,
          region: awsRegion.trim(),
          roleArn: awsRoleArn.trim() || undefined,
        },
      }
    }

    if (provider === 'azure') {
      return {
        azure: {
          subscriptionId: azureSubscriptionId.trim() || undefined,
          resourceGroup: azureResourceGroup.trim() || undefined,
          clusterName: azureClusterName.trim() || undefined,
          servicePrincipal: azureServicePrincipal.trim() || undefined,
        },
      }
    }

    if (provider === 'gke') {
      return {
        gke: {
          serviceAccountJson: gkeServiceAccount ? await readFileAsText(gkeServiceAccount) : undefined,
        },
      }
    }

    return {
      minikube: {
        caCert: minikubeCaCert ? await readFileAsText(minikubeCaCert) : undefined,
        clientCert: minikubeClientCert ? await readFileAsText(minikubeClientCert) : undefined,
        clientKey: minikubeClientKey ? await readFileAsText(minikubeClientKey) : undefined,
        endpoint: minikubeEndpoint.trim(),
      },
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
            : provider === 'aws' && awsRegion.trim()
              ? `https://eks.${awsRegion.trim()}.amazonaws.com`
              : provider === 'azure' && azureClusterName.trim()
                ? `https://${azureClusterName.trim()}.azmk8s.io`
                : provider === 'gke'
                  ? 'https://container.googleapis.com'
                  : 'https://kubernetes.default.svc'

        await (trpcClient as unknown as ValidateConnectionClient).mutation('clusters.validateConnection', {
          provider,
          endpoint: endpointForValidation,
          connectionConfig,
        })

        if (!cancelled) {
          setValidationState('success')
        }
      } catch (error) {
        if (!cancelled) {
          setValidationState('error')
          setValidationError(error instanceof Error ? error.message : 'Connection validation failed')
        }
      }
    }

    void runValidation()

    return () => {
      cancelled = true
    }
  }, [step, trpcClient, provider, kubeFile, kubeText, awsAccessKey, awsSecretKey, awsRegion, awsRoleArn, azureSubscriptionId, azureResourceGroup, azureClusterName, azureServicePrincipal, gkeServiceAccount, minikubeCaCert, minikubeClientCert, minikubeClientKey, minikubeEndpoint])

  const computedEndpoint = useMemo(() => {
    if (provider === 'minikube') return minikubeEndpoint.trim()
    if (provider === 'aws' && awsRegion.trim()) return `https://eks.${awsRegion.trim()}.amazonaws.com`
    if (provider === 'azure' && azureClusterName.trim()) return `https://${azureClusterName.trim()}.azmk8s.io`
    if (provider === 'gke') return 'https://container.googleapis.com'
    return 'https://kubernetes.default.svc'
  }, [provider, minikubeEndpoint, awsRegion, azureClusterName])

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
    if (provider === 'aws') return Boolean(awsAccessKey.trim() && awsSecretKey.trim() && awsRegion.trim())
    if (provider === 'azure') {
      const hasPrimary = azureSubscriptionId.trim() && azureResourceGroup.trim() && azureClusterName.trim()
      return Boolean(hasPrimary || azureServicePrincipal.trim())
    }
    if (provider === 'gke') return Boolean(gkeServiceAccount)
    if (provider === 'minikube') {
      return Boolean(minikubeCaCert && minikubeClientCert && minikubeClientKey && minikubeEndpoint.trim())
    }
    return false
  }, [provider, kubeFile, kubeText, awsAccessKey, awsSecretKey, awsRegion, azureSubscriptionId, azureResourceGroup, azureClusterName, azureServicePrincipal, gkeServiceAccount, minikubeCaCert, minikubeClientCert, minikubeClientKey, minikubeEndpoint, uploadError])

  const canGoNext = (step === 1) || (step === 2 && step2Valid) || (step === 3 && validationState === 'success') || (step === 4 && endpointValid)

  const finalName = nameOverride.trim() || suggestedName

  const submit = async () => {
    if (!endpointValid || !finalName) return
    const connectionConfig = await buildConnectionConfig()
    onSubmit({
      name: finalName,
      provider,
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
        <div className="h-2 rounded-full bg-[var(--color-accent)] transition-all" style={{ width: `${(step / 4) * 100}%` }} />
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
            <div className="grid gap-2 sm:grid-cols-2">
              {CLUSTER_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`${cardClass} ${provider === p.id ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'hover:border-[var(--color-border-hover)]'}`}
                >
                  <div className="text-lg">{p.icon}</div>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{p.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{p.subtitle}</p>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {provider === 'kubeconfig' && (
                <>
                  <FileDrop label="Kubeconfig file" file={kubeFile} onFile={setKubeFile} onError={setUploadError} accept=".yaml,.yml,.conf" />
                  <div>
                    <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">Or paste kubeconfig text</label>
                    <textarea
                      rows={6}
                      value={kubeText}
                      onChange={(e) => setKubeText(e.target.value)}
                      placeholder="apiVersion: v1..."
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              {provider === 'aws' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={awsAccessKey} onChange={(e) => setAwsAccessKey(e.target.value)} placeholder="Access Key" className={inputClass} />
                  <input type="password" value={awsSecretKey} onChange={(e) => setAwsSecretKey(e.target.value)} placeholder="Secret Key" className={inputClass} />
                  <input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} placeholder="Region (e.g. us-east-1)" className={inputClass} />
                  <input value={awsRoleArn} onChange={(e) => setAwsRoleArn(e.target.value)} placeholder="Role ARN (optional)" className={inputClass} />
                </div>
              )}

              {provider === 'azure' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={azureSubscriptionId} onChange={(e) => setAzureSubscriptionId(e.target.value)} placeholder="Subscription ID" className={inputClass} />
                  <input value={azureResourceGroup} onChange={(e) => setAzureResourceGroup(e.target.value)} placeholder="Resource Group" className={inputClass} />
                  <input value={azureClusterName} onChange={(e) => setAzureClusterName(e.target.value)} placeholder="Cluster Name" className={inputClass} />
                  <input value={azureServicePrincipal} onChange={(e) => setAzureServicePrincipal(e.target.value)} placeholder="Service Principal (alternative)" className={inputClass} />
                </div>
              )}

              {provider === 'gke' && (
                <FileDrop label="Service Account JSON" file={gkeServiceAccount} onFile={setGkeServiceAccount} onError={setUploadError} accept=".json,application/json" />
              )}

              {provider === 'minikube' && (
                <div className="space-y-3">
                  <FileDrop label="CA cert" file={minikubeCaCert} onFile={setMinikubeCaCert} onError={setUploadError} />
                  <FileDrop label="Client cert" file={minikubeClientCert} onFile={setMinikubeClientCert} onError={setUploadError} />
                  <FileDrop label="Client key" file={minikubeClientKey} onFile={setMinikubeClientKey} onError={setUploadError} />
                  <input value={minikubeEndpoint} onChange={(e) => setMinikubeEndpoint(e.target.value)} placeholder="https://127.0.0.1:8443" className={inputClass} />
                </div>
              )}

              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
              {!step2Valid && !uploadError && <p className="text-xs text-red-400">Fill the required credential fields to continue.</p>}
            </div>
          )}

          {step === 3 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
              {validationState === 'testing' && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing connection...
                </div>
              )}
              {validationState === 'success' && <p className="text-sm text-emerald-400">Connection test passed. Ready to continue.</p>}
              {validationState === 'error' && (
                <p className="text-sm text-red-400">{validationError || 'Connection test failed. Check credentials and retry.'}</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm">
                <p className="text-[var(--color-text-secondary)]">Provider: <span className="text-[var(--color-text-primary)]">{currentProvider.label}</span></p>
                <p className="text-[var(--color-text-secondary)]">Endpoint: <span className="text-[var(--color-text-primary)] break-all">{computedEndpoint}</span></p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)} className={inputClass}>
                  <option value="prod">Production</option>
                  <option value="staging">Staging</option>
                  <option value="dev">Development</option>
                </select>
                <input value={nameOverride} onChange={(e) => setNameOverride(e.target.value)} placeholder={`Name override (default: ${suggestedName})`} className={inputClass} />
              </div>
              {!endpointValid && <p className="text-xs text-red-400">A valid API endpoint is required to create this cluster.</p>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <button type="button" onClick={step === 1 ? onCancel : () => setStep((s) => Math.max(1, s - 1))} className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer">
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          disabled={pending || !canGoNext}
          onClick={() => {
            if (step < 4) {
              if (step === 3 && validationState === 'error') return
              setStep((s) => s + 1)
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
