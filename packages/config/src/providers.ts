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
    urlPatterns: ['192.168.49.', '192.168.99.'],
    execCommands: [],
    contextPatterns: ['minikube'],
  },
]

/**
 * Parse kubeconfig YAML to extract the active context's cluster name,
 * server URL, and user exec command. Context-aware: follows current-context
 * → context entry → cluster/user entries. Does NOT regex the first server line.
 */
function parseKubeconfig(yaml: string): {
  contextName: string
  clusterName: string
  serverUrl: string
  userName: string
  execCommand: string
} {
  const result = { contextName: '', clusterName: '', serverUrl: '', userName: '', execCommand: '' }

  // 1. Get current-context
  const ctxMatch = yaml.match(/current-context:\s*(\S+)/)
  if (!ctxMatch?.[1]) return result
  result.contextName = ctxMatch[1]

  // 2. Find the matching context entry to get cluster and user references
  // Matches: - name: <contextName>\n  context:\n    cluster: <clusterRef>\n    user: <userRef>
  const ctxBlockRe = new RegExp(
    `-\\s+name:\\s*${escapeRegex(result.contextName)}\\s*\\n` +
      `\\s+context:\\s*\\n` +
      `(?:\\s+[a-z].*\\n)*`,
    'm',
  )
  const ctxBlock = yaml.match(ctxBlockRe)?.[0] ?? ''
  const clusterRef = ctxBlock.match(/cluster:\s*(\S+)/)?.[1] ?? ''
  const userRef = ctxBlock.match(/user:\s*(\S+)/)?.[1] ?? ''
  result.clusterName = clusterRef

  // 3. Find the cluster entry to get server URL
  if (clusterRef) {
    const clusterBlockRe = new RegExp(
      `-\\s+name:\\s*${escapeRegex(clusterRef)}\\s*\\n` +
        `\\s+cluster:\\s*\\n` +
        `(?:\\s+[a-z].*\\n)*`,
      'm',
    )
    const clusterBlock = yaml.match(clusterBlockRe)?.[0] ?? ''
    result.serverUrl = clusterBlock.match(/server:\s*(\S+)/)?.[1] ?? ''
  }

  // 4. Find the user entry to get exec command
  if (userRef) {
    const userBlockRe = new RegExp(
      `-\\s+name:\\s*${escapeRegex(userRef)}\\s*\\n` +
        `\\s+user:\\s*\\n` +
        `[\\s\\S]*?(?=\\n-\\s+name:|\\s*$)`,
    )
    const userBlock = yaml.match(userBlockRe)?.[0] ?? ''
    const execCmd = userBlock.match(/command:\s*(\S+)/)?.[1] ?? ''
    const execArgs = [...userBlock.matchAll(/- ['"]?([^'"\n]+)['"]?/g)]
      .map((m) => m[1]?.trim())
      .filter(Boolean)
      .join(' ')
    result.execCommand = execCmd ? `${execCmd} ${execArgs}`.trim() : ''
  }

  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Detect the cloud provider from a kubeconfig YAML string.
 * Uses a priority signal chain: server URL (high) → exec command (high) → context name (medium).
 * Context-aware: resolves current-context → cluster entry → server URL.
 */
export function detectProviderFromKubeconfig(yaml: string): DetectionResult {
  const none: DetectionResult = {
    provider: 'kubeconfig',
    confidence: 'none',
    signal: null,
    label: PROVIDER_LABELS.kubeconfig,
  }

  if (!yaml?.trim()) return none

  const parsed = parseKubeconfig(yaml)

  // Priority 1: Server URL (high confidence)
  if (parsed.serverUrl) {
    for (const rule of PROVIDER_DETECTION_RULES) {
      for (const pattern of rule.urlPatterns) {
        if (parsed.serverUrl.includes(pattern)) {
          return {
            provider: rule.provider,
            confidence: 'high',
            signal: 'url',
            label: rule.label,
            context: parsed.contextName,
            endpoint: parsed.serverUrl,
          }
        }
      }
    }
  }

  // Priority 2: Exec command (high confidence)
  if (parsed.execCommand) {
    for (const rule of PROVIDER_DETECTION_RULES) {
      for (const cmd of rule.execCommands) {
        if (parsed.execCommand.includes(cmd)) {
          return {
            provider: rule.provider,
            confidence: 'high',
            signal: 'exec',
            label: rule.label,
            context: parsed.contextName,
            endpoint: parsed.serverUrl || undefined,
          }
        }
      }
    }
  }

  // Priority 3: Context/cluster name (medium confidence)
  const namesToCheck = [parsed.contextName, parsed.clusterName, parsed.userName].filter(Boolean)
  for (const name of namesToCheck) {
    for (const rule of PROVIDER_DETECTION_RULES) {
      for (const pattern of rule.contextPatterns) {
        if (name.includes(pattern)) {
          return {
            provider: rule.provider,
            confidence: 'medium',
            signal: 'context',
            label: rule.label,
            context: parsed.contextName,
            endpoint: parsed.serverUrl || undefined,
          }
        }
      }
    }
  }

  return none
}
