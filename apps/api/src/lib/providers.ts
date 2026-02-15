export const VALID_PROVIDERS = ['kubeconfig', 'aws', 'azure', 'gke', 'minikube'] as const

export type Provider = (typeof VALID_PROVIDERS)[number]

/**
 * Canonical backend provider IDs (must match frontend payloads exactly):
 * - kubeconfig
 * - aws
 * - azure
 * - gke
 * - minikube
 */
export function normalizeProvider(provider: string): Provider {
  const lower = provider.toLowerCase()

  if (lower === 'eks' || lower === 'aws') {
    return 'aws'
  }

  if (lower === 'aks' || lower === 'azure') {
    return 'azure'
  }

  if (lower === 'gcp' || lower === 'gke') {
    return 'gke'
  }

  if (lower === 'minikube') {
    return 'minikube'
  }

  if (lower === 'kubeconfig') {
    return 'kubeconfig'
  }

  throw new Error(`Unknown provider: ${provider}`)
}
