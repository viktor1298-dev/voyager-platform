import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { getKubeConfig } from './k8s.js'

export const CLUSTER_PROVIDERS = ['kubeconfig', 'aws', 'azure', 'gke', 'minikube'] as const
export type ClusterProvider = (typeof CLUSTER_PROVIDERS)[number]

const MINIKUBE_CONTEXT_CANDIDATES = ['minikube', 'docker-desktop'] as const

type KubeconfigConnectionConfig = {
  kubeconfig: string
  context?: string
}

type MinikubeConnectionConfig = {
  context?: string
}

type AwsConnectionConfig = {
  clusterName: string
  region: string
  roleArnRef?: string
}

type AzureConnectionConfig = {
  clusterName: string
  resourceGroup: string
  subscriptionIdRef?: string
}

type GkeConnectionConfig = {
  clusterName: string
  location: string
  projectIdRef?: string
}

export type ClusterConnectionConfig =
  | KubeconfigConnectionConfig
  | MinikubeConnectionConfig
  | AwsConnectionConfig
  | AzureConnectionConfig
  | GkeConnectionConfig

export function createKubeConfigForCluster(
  provider: ClusterProvider,
  connectionConfig: ClusterConnectionConfig,
): k8s.KubeConfig {
  switch (provider) {
    case 'kubeconfig': {
      const config = connectionConfig as KubeconfigConnectionConfig
      if (!config.kubeconfig || config.kubeconfig.trim().length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'kubeconfig is required for kubeconfig provider' })
      }

      const kc = new k8s.KubeConfig()
      try {
        kc.loadFromString(config.kubeconfig)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid kubeconfig content: ${error instanceof Error ? error.message : 'unknown parse error'}`,
        })
      }

      if (config.context) {
        kc.setCurrentContext(config.context)
      }

      return kc
    }

    case 'minikube': {
      const kc = getKubeConfig()
      const config = connectionConfig as MinikubeConnectionConfig
      if (config.context) {
        kc.setCurrentContext(config.context)
        return kc
      }

      for (const candidate of MINIKUBE_CONTEXT_CANDIDATES) {
        if (kc.contexts.some((ctx) => ctx.name === candidate)) {
          kc.setCurrentContext(candidate)
          break
        }
      }

      return kc
    }

    case 'aws':
      // TODO: Implement IAM / STS-based EKS auth flow (aws eks get-token equivalent)
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'AWS provider support is not implemented yet',
      })

    case 'azure':
      // TODO: Implement Azure workload identity / AAD integration for AKS auth
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'Azure provider support is not implemented yet',
      })

    case 'gke':
      // TODO: Implement GCP auth provider integration for GKE auth
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'GKE provider support is not implemented yet',
      })

    default:
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Unsupported provider: ${provider}` })
  }
}

export async function validateClusterConnection(
  provider: ClusterProvider,
  connectionConfig: ClusterConnectionConfig,
): Promise<{ reachable: boolean; version?: string; context?: string; message: string }> {
  try {
    const kc = createKubeConfigForCluster(provider, connectionConfig)
    const [versionRes, namespaceRes] = await Promise.all([
      kc.makeApiClient(k8s.VersionApi).getCode(),
      kc.makeApiClient(k8s.CoreV1Api).listNamespace(),
    ])

    return {
      reachable: true,
      version: `v${versionRes.major}.${versionRes.minor}`,
      context: kc.getCurrentContext(),
      message: `Connected successfully (${namespaceRes.items.length} namespaces visible)`,
    }
  } catch (error) {
    return {
      reachable: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }
}
