import { Sha256 } from '@aws-crypto/sha256-js'
import { HttpRequest } from '@smithy/protocol-http'
import { SignatureV4 } from '@smithy/signature-v4'
import { formatUrl } from '@aws-sdk/util-format-url'
import { ContainerServiceClient } from '@azure/arm-containerservice'
import { DefaultAzureCredential } from '@azure/identity'
import { ClusterManagerClient } from '@google-cloud/container'
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

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function ensureEndpoint(endpoint: string | undefined, provider: string): string {
  if (!endpoint) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${provider} provider requires connectionConfig.endpoint` })
  }

  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `${provider} endpoint must use https` })
    }
    return endpoint
  } catch (error) {
    if (error instanceof TRPCError) throw error
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${provider} endpoint must be a valid URL` })
  }
}

function withOptionalCa(cluster: Pick<k8s.Cluster, 'name' | 'server'>, caCert?: string): k8s.Cluster {
  return {
    ...cluster,
    skipTLSVerify: false,
    ...(caCert ? { caData: caCert } : {}),
  }
}

async function generateEksToken(config: {
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  clusterName: string
}): Promise<string> {
  const signer = new SignatureV4({
    service: 'sts',
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    },
    sha256: Sha256,
  })

  const request = new HttpRequest({
    protocol: 'https:',
    hostname: `sts.${config.region}.amazonaws.com`,
    method: 'GET',
    path: '/',
    query: {
      Action: 'GetCallerIdentity',
      Version: '2011-06-15',
    },
    headers: {
      host: `sts.${config.region}.amazonaws.com`,
      'x-k8s-aws-id': config.clusterName,
    },
  })

  const presigned = await signer.presign(request, { expiresIn: 60, unsignableHeaders: new Set(['host']) })
  return `k8s-aws-v1.${toBase64Url(formatUrl(presigned))}`
}

export async function createKubeConfigForCluster(
  provider: ClusterProvider,
  connectionConfig: ClusterConnectionConfig,
): Promise<k8s.KubeConfig> {
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

    case 'aws': {
      const config = awsConnectionConfigSchema.parse(connectionConfig)
      const endpoint = ensureEndpoint(config.endpoint, 'AWS')

      try {
        const token = await generateEksToken({
          region: config.region,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          sessionToken: config.sessionToken,
          clusterName: config.clusterName,
        })

        const kc = new k8s.KubeConfig()
        kc.loadFromOptions({
          clusters: [withOptionalCa({ name: 'aws-cluster', server: endpoint }, config.caCert)],
          users: [{ name: 'aws-user', token }],
          contexts: [{ name: 'aws-context', cluster: 'aws-cluster', user: 'aws-user' }],
          currentContext: 'aws-context',
        })
        return kc
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to initialize AWS EKS authentication: ${error instanceof Error ? error.message : 'unknown error'}`,
        })
      }
    }

    case 'azure': {
      const config = azureConnectionConfigSchema.parse(connectionConfig)

      try {
        const credential = new DefaultAzureCredential({ managedIdentityClientId: config.clientId })
        const client = new ContainerServiceClient(credential, config.subscriptionId)
        const credentials = await client.managedClusters.listClusterUserCredentials(
          config.resourceGroup,
          config.clusterName,
        )

        const kubeconfigBytes = credentials.kubeconfigs?.[0]?.value
        if (!kubeconfigBytes) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'AKS did not return kubeconfig credentials' })
        }

        const kc = new k8s.KubeConfig()
        kc.loadFromString(Buffer.from(kubeconfigBytes).toString('utf8'))
        return kc
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to initialize Azure AKS authentication: ${error instanceof Error ? error.message : 'unknown error'}`,
        })
      }
    }

    case 'gke': {
      const config = gkeConnectionConfigSchema.parse(connectionConfig)
      const endpoint = ensureEndpoint(config.endpoint, 'GKE')

      try {
        const serviceAccount = JSON.parse(config.serviceAccountJson) as {
          client_email?: string
          private_key?: string
          project_id?: string
        }

        if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'serviceAccountJson must include client_email, private_key, and project_id',
          })
        }

        const clusterManager = new ClusterManagerClient({
          projectId: serviceAccount.project_id,
          credentials: {
            client_email: serviceAccount.client_email,
            private_key: serviceAccount.private_key,
          },
        })

        const token = await clusterManager.auth.getAccessToken()
        if (!token) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to acquire GKE access token' })
        }

        const kc = new k8s.KubeConfig()
        kc.loadFromOptions({
          clusters: [withOptionalCa({ name: 'gke-cluster', server: endpoint }, config.caCert)],
          users: [{ name: 'gke-user', token }],
          contexts: [{ name: 'gke-context', cluster: 'gke-cluster', user: 'gke-user' }],
          currentContext: 'gke-context',
        })

        return kc
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to initialize GKE authentication: ${error instanceof Error ? error.message : 'unknown error'}`,
        })
      }
    }

    default:
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Unsupported provider: ${provider}` })
  }
}

export async function validateClusterConnection(
  provider: ClusterProvider,
  connectionConfig: ClusterConnectionConfig,
): Promise<{ reachable: boolean; version?: string; context?: string; message: string }> {
  const kc = await createKubeConfigForCluster(provider, connectionConfig)
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
}
