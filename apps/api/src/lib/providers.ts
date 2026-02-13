const PROVIDER_ALIASES: Record<string, string> = {
  eks: 'aws',
  aks: 'azure',
  gke: 'gcp',
  digitalocean: 'do',
  'docker-desktop': 'docker',
}

export const VALID_PROVIDERS = ['aws', 'azure', 'gcp', 'minikube', 'k3s', 'kind', 'docker', 'do', 'onprem'] as const

export type Provider = (typeof VALID_PROVIDERS)[number]

export function normalizeProvider(provider: string): string {
  const lower = provider.toLowerCase()
  return PROVIDER_ALIASES[lower] || lower
}
