export const VALID_PROVIDERS = ['kubeconfig', 'aws', 'azure', 'gke', 'minikube'] as const

export type Provider = (typeof VALID_PROVIDERS)[number]

export function normalizeProvider(provider: string): Provider {
  const lower = provider.toLowerCase()

  if (lower === 'eks' || lower === 'aws' || lower === 'aws-eks') {
    return 'aws'
  }

  if (lower === 'aks' || lower === 'azure' || lower === 'azure-aks') {
    return 'azure'
  }

  if (lower === 'gcp' || lower === 'gke') {
    return 'gke'
  }

  if (lower === 'minikube') {
    return 'minikube'
  }

  return 'kubeconfig'
}
