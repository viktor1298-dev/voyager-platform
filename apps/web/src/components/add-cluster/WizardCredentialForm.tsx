'use client'

import { UploadCloud } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { PROVIDER_ICONS, ProviderLogo } from '@/components/ProviderLogo'
import { DURATION } from '@/lib/animation-constants'
import type { DetectionResult } from '@voyager/config/providers'
import type { ProviderId } from './wizard-types'

/* ── constants ───────────────────────────────────────── */

const inputClass =
  'w-full px-3 py-2.5 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors'

const cardClass =
  'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 text-left transition-colors'

const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024

/* ── focus glow helpers ──────────────────────────────── */

function applyFocusGlow(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--color-accent)'
  e.currentTarget.style.boxShadow =
    '0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, transparent)'
}

function removeFocusGlow(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--color-border)'
  e.currentTarget.style.boxShadow = 'none'
}

/* ── FileDrop ────────────────────────────────────────── */

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
        style={{
          transition: `border-color ${DURATION.fast}s, background-color ${DURATION.fast}s`,
        }}
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

/* ── Props ───────────────────────────────────────────── */

export interface WizardCredentialFormProps {
  provider: ProviderId
  kubeFile: File | null
  onKubeFile: (f: File | null) => void
  kubeText: string
  onKubeText: (v: string) => void
  awsAccessKey: string
  onAwsAccessKey: (v: string) => void
  awsSecretKey: string
  onAwsSecretKey: (v: string) => void
  awsRegion: string
  onAwsRegion: (v: string) => void
  awsEndpoint: string
  onAwsEndpoint: (v: string) => void
  azureSubscriptionId: string
  onAzureSubscriptionId: (v: string) => void
  azureResourceGroup: string
  onAzureResourceGroup: (v: string) => void
  azureClusterName: string
  onAzureClusterName: (v: string) => void
  gkeServiceAccountJson: string
  onGkeServiceAccountJson: (v: string) => void
  gkeEndpoint: string
  onGkeEndpoint: (v: string) => void
  minikubeCaCert: File | null
  onMinikubeCaCert: (f: File | null) => void
  minikubeClientCert: File | null
  onMinikubeClientCert: (f: File | null) => void
  minikubeClientKey: File | null
  onMinikubeClientKey: (f: File | null) => void
  minikubeEndpoint: string
  onMinikubeEndpoint: (v: string) => void
  detectionResult: DetectionResult | null
  uploadError: string | null
  onUploadError: (v: string | null) => void
  touched: Record<string, boolean>
  onTouch: (field: string) => void
  submitAttempted: boolean
  step2Valid: boolean
}

/* ── Component ───────────────────────────────────────── */

export function WizardCredentialForm(props: WizardCredentialFormProps) {
  const {
    provider,
    kubeFile,
    onKubeFile,
    kubeText,
    onKubeText,
    awsAccessKey,
    onAwsAccessKey,
    awsSecretKey,
    onAwsSecretKey,
    awsRegion,
    onAwsRegion,
    awsEndpoint,
    onAwsEndpoint,
    azureSubscriptionId,
    onAzureSubscriptionId,
    azureResourceGroup,
    onAzureResourceGroup,
    azureClusterName,
    onAzureClusterName,
    gkeServiceAccountJson,
    onGkeServiceAccountJson,
    gkeEndpoint,
    onGkeEndpoint,
    minikubeCaCert,
    onMinikubeCaCert,
    minikubeClientCert,
    onMinikubeClientCert,
    minikubeClientKey,
    onMinikubeClientKey,
    minikubeEndpoint,
    onMinikubeEndpoint,
    detectionResult,
    uploadError,
    onUploadError,
    touched,
    onTouch,
    submitAttempted,
    step2Valid,
  } = props

  return (
    <div className="space-y-3">
      {/* ── Kubeconfig ── */}
      {provider === 'kubeconfig' && (
        <>
          <FileDrop
            label="Kubeconfig file *"
            file={kubeFile}
            onFile={onKubeFile}
            onError={onUploadError}
          />
          <div>
            <label
              htmlFor="wizard-kube-text"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Or paste kubeconfig text <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <textarea
              id="wizard-kube-text"
              rows={6}
              value={kubeText}
              onChange={(e) => onKubeText(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={removeFocusGlow}
              placeholder="apiVersion: v1&#10;clusters:&#10;- cluster:&#10;    server: https://api.example.com:6443"
              className={inputClass}
            />
            {submitAttempted && !kubeFile && !kubeText.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">
                Upload a kubeconfig file or paste the YAML content
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Kubeconfig detection banner ── */}
      {provider === 'kubeconfig' && detectionResult && (
        <div
          className="flex items-center gap-3 rounded-lg p-3 border text-sm"
          style={{
            backgroundColor: `color-mix(in srgb, ${PROVIDER_ICONS[detectionResult.provider]?.color ?? PROVIDER_ICONS.kubeconfig.color} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${PROVIDER_ICONS[detectionResult.provider]?.color ?? PROVIDER_ICONS.kubeconfig.color} 20%, transparent)`,
          }}
        >
          <ProviderLogo provider={detectionResult.provider} size={24} />
          <div className="min-w-0">
            <div className="text-[var(--color-text-primary)] font-medium text-sm">
              {detectionResult.label} Cluster Detected
            </div>
            {detectionResult.context && (
              <div className="text-[var(--color-text-muted)] text-xs truncate">
                Context: {detectionResult.context}
              </div>
            )}
            {detectionResult.endpoint && (
              <div className="text-[var(--color-text-muted)] text-xs truncate">
                Endpoint: {detectionResult.endpoint}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AWS EKS ── */}
      {provider === 'aws' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="wizard-aws-access-key"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Access Key ID <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <input
              id="wizard-aws-access-key"
              value={awsAccessKey}
              onChange={(e) => onAwsAccessKey(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('awsAccessKey')
              }}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              className={inputClass}
            />
            {(touched.awsAccessKey || submitAttempted) && !awsAccessKey.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">
                Access Key ID is required
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="wizard-aws-secret-key"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Secret Access Key <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <input
              id="wizard-aws-secret-key"
              type="password"
              value={awsSecretKey}
              onChange={(e) => onAwsSecretKey(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('awsSecretKey')
              }}
              placeholder="Secret Access Key"
              className={inputClass}
            />
            {(touched.awsSecretKey || submitAttempted) && !awsSecretKey.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">
                Secret Access Key is required
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="wizard-aws-region"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Region <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <input
              id="wizard-aws-region"
              value={awsRegion}
              onChange={(e) => onAwsRegion(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('awsRegion')
              }}
              placeholder="us-east-1"
              className={inputClass}
            />
            {(touched.awsRegion || submitAttempted) && !awsRegion.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">Region is required</p>
            )}
          </div>
          <div>
            <label
              htmlFor="wizard-aws-endpoint"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Endpoint
            </label>
            <input
              id="wizard-aws-endpoint"
              value={awsEndpoint}
              onChange={(e) => onAwsEndpoint(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={removeFocusGlow}
              placeholder="arn:aws:eks:us-east-1:123456789:cluster/my-cluster"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* ── Azure AKS ── */}
      {provider === 'azure' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="wizard-azure-subscription"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Subscription ID <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <input
              id="wizard-azure-subscription"
              value={azureSubscriptionId}
              onChange={(e) => onAzureSubscriptionId(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('azureSubscriptionId')
              }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={inputClass}
            />
            {(touched.azureSubscriptionId || submitAttempted) && !azureSubscriptionId.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">
                Subscription ID is required
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="wizard-azure-resource-group"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Resource Group <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <input
              id="wizard-azure-resource-group"
              value={azureResourceGroup}
              onChange={(e) => onAzureResourceGroup(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('azureResourceGroup')
              }}
              placeholder="my-resource-group"
              className={inputClass}
            />
            {(touched.azureResourceGroup || submitAttempted) && !azureResourceGroup.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">
                Resource Group is required
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="wizard-azure-cluster-name"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Cluster Name <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <input
              id="wizard-azure-cluster-name"
              value={azureClusterName}
              onChange={(e) => onAzureClusterName(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('azureClusterName')
              }}
              placeholder="https://myaks.eastus.azmk8s.io"
              className={inputClass}
            />
            {(touched.azureClusterName || submitAttempted) && !azureClusterName.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">
                Cluster Name is required
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Google GKE ── */}
      {provider === 'gke' && (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="wizard-gke-service-account"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Service Account JSON <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <textarea
              id="wizard-gke-service-account"
              rows={6}
              value={gkeServiceAccountJson}
              onChange={(e) => onGkeServiceAccountJson(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('gkeServiceAccountJson')
              }}
              placeholder={`{\n  "type": "service_account"\n}`}
              className={inputClass}
            />
            {(touched.gkeServiceAccountJson || submitAttempted) &&
              !gkeServiceAccountJson.trim() && (
                <p className="text-xs text-[var(--color-status-error)] mt-1">
                  Service Account JSON is required
                </p>
              )}
          </div>
          <div>
            <label
              htmlFor="wizard-gke-endpoint"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Endpoint
            </label>
            <input
              id="wizard-gke-endpoint"
              value={gkeEndpoint}
              onChange={(e) => onGkeEndpoint(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={removeFocusGlow}
              placeholder="https://35.xxx.xxx.xxx"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* ── Minikube / Local ── */}
      {provider === 'minikube' && (
        <div className="space-y-3">
          <FileDrop
            label="CA cert *"
            file={minikubeCaCert}
            onFile={onMinikubeCaCert}
            onError={onUploadError}
          />
          <FileDrop
            label="Client cert *"
            file={minikubeClientCert}
            onFile={onMinikubeClientCert}
            onError={onUploadError}
          />
          <FileDrop
            label="Client key *"
            file={minikubeClientKey}
            onFile={onMinikubeClientKey}
            onError={onUploadError}
          />
          <div>
            <label
              htmlFor="wizard-minikube-endpoint"
              className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
            >
              Endpoint <span className="text-[var(--color-status-error)]">*</span>
            </label>
            <input
              id="wizard-minikube-endpoint"
              value={minikubeEndpoint}
              onChange={(e) => onMinikubeEndpoint(e.target.value)}
              onFocus={applyFocusGlow}
              onBlur={(e) => {
                removeFocusGlow(e)
                onTouch('minikubeEndpoint')
              }}
              placeholder="https://192.168.49.2:8443"
              className={inputClass}
            />
            {(touched.minikubeEndpoint || submitAttempted) && !minikubeEndpoint.trim() && (
              <p className="text-xs text-[var(--color-status-error)] mt-1">
                Endpoint URL is required
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Upload error ── */}
      {uploadError && <p className="text-xs text-[var(--color-status-error)]">{uploadError}</p>}

      {/* ── Validation hint ── */}
      {!step2Valid && !uploadError && (
        <p className="text-xs text-[var(--color-status-error)]">
          Fill the required credential fields to continue.
        </p>
      )}
    </div>
  )
}
