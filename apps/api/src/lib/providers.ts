export const VALID_PROVIDERS = ['kubeconfig', 'aws-eks', 'azure-aks', 'google-gke', 'minikube'] as const

export type Provider = (typeof VALID_PROVIDERS)[number]

/**
 * Canonical backend provider IDs (must match frontend payloads exactly):
 * - kubeconfig
 * - aws-eks
 * - azure-aks
 * - google-gke
 * - minikube
 */
export function normalizeProvider(provider: string): Provider {
  const lower = provider.toLowerCase()

  if (lower === 'eks' || lower === 'aws' || lower === 'aws-eks') {
    return 'aws-eks'
  }

  if (lower === 'aks' || lower === 'azure' || lower === 'azure-aks') {
    return 'azure-aks'
  }

  if (lower === 'gcp' || lower === 'gke' || lower === 'google-gke') {
    return 'google-gke'
  }

  if (lower === 'minikube') {
    return 'minikube'
  }

  return 'kubeconfig'
}
