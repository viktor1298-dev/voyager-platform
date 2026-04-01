import { describe, expect, it } from 'vitest'
import { detectProviderFromKubeconfig } from '../providers.js'

// ── Sample kubeconfigs ───────────────────────────────────────

const eksKubeconfig = `
apiVersion: v1
kind: Config
current-context: eks-devops-separate-us-east-1
clusters:
- name: eks-devops-separate-us-east-1
  cluster:
    server: https://ABC123DEF456.gr7.us-east-1.eks.amazonaws.com
    certificate-authority-data: LS0tLS1...
contexts:
- name: eks-devops-separate-us-east-1
  context:
    cluster: eks-devops-separate-us-east-1
    user: eks-devops-user
users:
- name: eks-devops-user
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: aws
      args:
        - eks
        - get-token
        - --cluster-name
        - devops-separate
        - --region
        - us-east-1
`

const aksKubeconfig = `
apiVersion: v1
kind: Config
current-context: aks-prod-cluster
clusters:
- name: aks-prod-cluster
  cluster:
    server: https://aks-prod-dns-abc123.hcp.westeurope.azmk8s.io:443
contexts:
- name: aks-prod-cluster
  context:
    cluster: aks-prod-cluster
    user: aks-user
users:
- name: aks-user
  user:
    token: redacted
`

const gkeKubeconfig = `
apiVersion: v1
kind: Config
current-context: gke_my-project_us-central1_my-cluster
clusters:
- name: gke_my-project_us-central1_my-cluster
  cluster:
    server: https://35.200.100.50
contexts:
- name: gke_my-project_us-central1_my-cluster
  context:
    cluster: gke_my-project_us-central1_my-cluster
    user: gke-user
users:
- name: gke-user
  user:
    exec:
      command: gke-gcloud-auth-plugin
      apiVersion: client.authentication.k8s.io/v1beta1
`

const minikubeKubeconfig = `
apiVersion: v1
kind: Config
current-context: minikube
clusters:
- name: minikube
  cluster:
    server: https://192.168.49.2:8443
contexts:
- name: minikube
  context:
    cluster: minikube
    user: minikube
users:
- name: minikube
  user:
    client-certificate: /home/user/.minikube/profiles/minikube/client.crt
    client-key: /home/user/.minikube/profiles/minikube/client.key
`

const multiClusterKubeconfig = `
apiVersion: v1
kind: Config
current-context: eks-devops-separate-us-east-1
clusters:
- name: onprem-cluster
  cluster:
    server: https://10.0.0.1:6443
- name: eks-devops-separate-us-east-1
  cluster:
    server: https://ABC123.gr7.us-east-1.eks.amazonaws.com
contexts:
- name: onprem-context
  context:
    cluster: onprem-cluster
    user: onprem-user
- name: eks-devops-separate-us-east-1
  context:
    cluster: eks-devops-separate-us-east-1
    user: eks-user
users:
- name: onprem-user
  user:
    token: redacted
- name: eks-user
  user:
    token: redacted
`

const genericKubeconfig = `
apiVersion: v1
kind: Config
current-context: my-custom-cluster
clusters:
- name: my-custom-cluster
  cluster:
    server: https://10.0.0.1:6443
contexts:
- name: my-custom-cluster
  context:
    cluster: my-custom-cluster
    user: admin
users:
- name: admin
  user:
    token: redacted
`

// ── Tests ────────────────────────────────────────────────────

describe('detectProviderFromKubeconfig', () => {
  it('detects EKS from server URL (high confidence)', () => {
    const result = detectProviderFromKubeconfig(eksKubeconfig)
    expect(result.provider).toBe('aws')
    expect(result.confidence).toBe('high')
    expect(result.signal).toBe('url')
    expect(result.label).toBe('AWS EKS')
    expect(result.context).toBe('eks-devops-separate-us-east-1')
    expect(result.endpoint).toContain('.eks.amazonaws.com')
  })

  it('detects AKS from server URL (high confidence)', () => {
    const result = detectProviderFromKubeconfig(aksKubeconfig)
    expect(result.provider).toBe('azure')
    expect(result.confidence).toBe('high')
    expect(result.signal).toBe('url')
    expect(result.label).toBe('Azure AKS')
  })

  it('detects GKE from exec command (high confidence)', () => {
    const result = detectProviderFromKubeconfig(gkeKubeconfig)
    expect(result.provider).toBe('gke')
    expect(result.confidence).toBe('high')
    // GKE has a plain IP server URL, so detection falls through to exec
    expect(result.signal).toBe('exec')
    expect(result.label).toBe('Google GKE')
  })

  it('detects minikube from context name (medium confidence)', () => {
    const result = detectProviderFromKubeconfig(minikubeKubeconfig)
    expect(result.provider).toBe('minikube')
    expect(result.confidence).toBe('medium')
    expect(result.signal).toBe('context')
    expect(result.label).toBe('Minikube')
  })

  it('detects EKS from correct cluster in multi-cluster kubeconfig', () => {
    const result = detectProviderFromKubeconfig(multiClusterKubeconfig)
    expect(result.provider).toBe('aws')
    expect(result.confidence).toBe('high')
    expect(result.context).toBe('eks-devops-separate-us-east-1')
    // Must NOT match the on-prem cluster (first in file)
    expect(result.endpoint).toContain('.eks.amazonaws.com')
  })

  it('returns kubeconfig for generic/unrecognized clusters', () => {
    const result = detectProviderFromKubeconfig(genericKubeconfig)
    expect(result.provider).toBe('kubeconfig')
    expect(result.confidence).toBe('none')
    expect(result.signal).toBeNull()
  })

  it('returns kubeconfig for empty string', () => {
    const result = detectProviderFromKubeconfig('')
    expect(result.provider).toBe('kubeconfig')
    expect(result.confidence).toBe('none')
  })

  it('returns kubeconfig for malformed YAML', () => {
    const result = detectProviderFromKubeconfig('not: valid: kubeconfig: at: all')
    expect(result.provider).toBe('kubeconfig')
    expect(result.confidence).toBe('none')
  })

  it('detects EKS from context name when URL has no provider pattern (e.g., PrivateLink)', () => {
    const privateLink = `
apiVersion: v1
kind: Config
current-context: eks-prod-us-east-1
clusters:
- name: eks-prod-us-east-1
  cluster:
    server: https://vpce-abc123.eks.us-east-1.vpce.amazonaws.com
contexts:
- name: eks-prod-us-east-1
  context:
    cluster: eks-prod-us-east-1
    user: eks-user
users:
- name: eks-user
  user:
    token: redacted
`
    const result = detectProviderFromKubeconfig(privateLink)
    expect(result.provider).toBe('aws')
    expect(result.confidence).not.toBe('none')
    // vpce URL doesn't contain '.eks.amazonaws.com' — falls through to context name 'eks-' prefix
    expect(['url', 'context']).toContain(result.signal)
  })
})
