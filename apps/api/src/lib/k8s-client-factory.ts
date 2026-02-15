import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import {
  awsConnectionConfigSchema,
  azureConnectionConfigSchema,
  gkeConnectionConfigSchema,
  kubeconfigConnectionConfigSchema,
  minikubeConnectionConfigSchema,
  type ClusterConnectionConfig,
} from './connection-config.js'
import { getKubeConfig } from './k8s.js'
import { VALID_PROVIDERS, type Provider } from './providers.js'

export const CLUSTER_PROVIDERS = VALID_PROVIDERS
export type ClusterProvider = Provider

const MINIKUBE_CONTEXT_CANDIDATES = ['minikube', 'docker-desktop'] as const

export function createKubeConfigForCluster(
  provider: ClusterProvider,
  connectionConfig: ClusterConnectionConfig,
): k8s.KubeConfig {
  switch (provider) {
    case 'kubeconfig': {
      const config = kubeconfigConnectionConfigSchema.parse(connectionConfig)
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
      const config = minikubeConnectionConfigSchema.parse(connectionConfig)
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
      awsConnectionConfigSchema.parse(connectionConfig)
      // TODO: Implement IAM / STS-based EKS auth flow (aws eks get-token equivalent)
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'AWS provider support is not implemented yet',
      })

    case 'azure':
      azureConnectionConfigSchema.parse(connectionConfig)
      // TODO: Implement Azure workload identity / AAD integration for AKS auth
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'Azure provider support is not implemented yet',
      })

    case 'gke':
      gkeConnectionConfigSchema.parse(connectionConfig)
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
