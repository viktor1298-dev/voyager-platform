export type ClusterProviderOption = {
  id: 'kubeconfig' | 'aws' | 'azure' | 'gke' | 'minikube'
  label: string
  subtitle: string
}

export const CLUSTER_PROVIDERS = [
  { id: 'kubeconfig', label: 'Kubeconfig', subtitle: 'Upload config or paste YAML' },
  { id: 'aws', label: 'AWS EKS', subtitle: 'IAM credentials + region' },
  { id: 'azure', label: 'Azure AKS', subtitle: 'Subscription and app credentials' },
  { id: 'gke', label: 'Google GKE', subtitle: 'Project + zone + service account JSON' },
  { id: 'minikube', label: 'Minikube / Local', subtitle: 'Cert files + local endpoint' },
] as const satisfies readonly ClusterProviderOption[]

export type ProviderId = (typeof CLUSTER_PROVIDERS)[number]['id']
export type Environment = 'production' | 'staging' | 'development'

export type ConnectionConfig =
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

/**
 * Resolve provider ID to PROVIDER_ICONS key.
 * CLUSTER_PROVIDERS uses 'gke' but PROVIDER_ICONS uses 'gcp' (via PROVIDER_ALIASES).
 */
const PROVIDER_ICON_KEY: Record<string, string> = { gke: 'gcp' }
export function resolveProviderIconKey(id: string): string {
  return PROVIDER_ICON_KEY[id] ?? id
}
