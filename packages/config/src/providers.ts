export type DetectionSignal = 'url' | 'exec' | 'context'

export type DetectionResult = {
  provider: 'aws' | 'azure' | 'gke' | 'minikube' | 'kubeconfig'
  confidence: 'high' | 'medium' | 'none'
  signal: DetectionSignal | null
  label: string
  context?: string
  endpoint?: string
}

export type DetectionRule = {
  provider: 'aws' | 'azure' | 'gke' | 'minikube'
  label: string
  urlPatterns: string[]
  execCommands: string[]
  contextPatterns: string[]
}

export const PROVIDER_LABELS: Record<string, string> = {
  aws: 'AWS EKS',
  azure: 'Azure AKS',
  gke: 'Google GKE',
  minikube: 'Minikube',
  kubeconfig: 'Kubeconfig',
}

export const PROVIDER_DETECTION_RULES: DetectionRule[] = [
  {
    provider: 'aws',
    label: 'AWS EKS',
    urlPatterns: ['.eks.amazonaws.com'],
    execCommands: ['aws eks get-token'],
    contextPatterns: ['arn:aws:eks:', 'eks-'],
  },
  {
    provider: 'azure',
    label: 'Azure AKS',
    urlPatterns: ['.azmk8s.io', '.azure.com'],
    execCommands: ['kubelogin'],
    contextPatterns: ['aks-'],
  },
  {
    provider: 'gke',
    label: 'Google GKE',
    urlPatterns: ['.googleapis.com', 'container.cloud.google.com'],
    execCommands: ['gke-gcloud-auth-plugin'],
    contextPatterns: ['gke_'],
  },
  {
    provider: 'minikube',
    label: 'Minikube',
    urlPatterns: [],
    execCommands: [],
    contextPatterns: ['minikube'],
  },
]
