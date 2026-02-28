import * as k8s from '@kubernetes/client-node'
import { TOKEN_REFRESH_THRESHOLD_RATIO } from '@voyager/config/sse'
import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { decryptCredential } from './credential-crypto.js'
import { createKubeConfigForCluster } from './k8s-client-factory.js'
import type { ClusterConnectionConfig } from './connection-config.js'

const MAX_ENTRIES = 50
const TTL_MS = 5 * 60 * 1000 // 5 minutes
const ENCRYPTION_KEY = process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''

// Default token TTL assumptions by provider (ms)
const DEFAULT_TOKEN_TTL: Record<string, number> = {
  eks: 15 * 60 * 1000,   // EKS tokens: 15 min
  gke: 60 * 60 * 1000,   // GKE tokens: 1 hour
  aks: 60 * 60 * 1000,   // AKS tokens: 1 hour
}

interface CacheEntry {
  kc: k8s.KubeConfig
  expiresAt: number
  provider: string
  clusterId: string
  tokenExpiresAt: number | null  // IP3-006: token expiry tracking
  connectionConfig: Record<string, unknown>
}

export class ClusterClientPool {
  private cache = new Map<string, CacheEntry>()

  async getClient(clusterId: string): Promise<k8s.KubeConfig> {
    const now = Date.now()
    const cached = this.cache.get(clusterId)

    if (cached) {
      // IP3-006: Proactive token refresh at 80% of TTL
      if (cached.tokenExpiresAt) {
        const refreshAt = cached.tokenExpiresAt * TOKEN_REFRESH_THRESHOLD_RATIO +
          (now - (cached.expiresAt - TTL_MS)) * (1 - TOKEN_REFRESH_THRESHOLD_RATIO)
        if (now >= cached.tokenExpiresAt * TOKEN_REFRESH_THRESHOLD_RATIO) {
          console.log(`[ClusterClientPool] Proactive token refresh for ${clusterId}`)
          this.cache.delete(clusterId)
          return this.getClient(clusterId)
        }
      }

      if (cached.expiresAt > now) {
        return cached.kc
      }
    }

    const [cluster] = await db.select().from(clusters).where(eq(clusters.id, clusterId))
    if (!cluster) {
      throw new Error(`Cluster ${clusterId} not found`)
    }

    let config = cluster.connectionConfig as Record<string, unknown>
    if (typeof config.__encrypted === 'string' && /^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
      config = JSON.parse(decryptCredential(config.__encrypted, ENCRYPTION_KEY))
    }

    const kc = await createKubeConfigForCluster(cluster.provider, config as ClusterConnectionConfig)

    if (this.cache.size >= MAX_ENTRIES) {
      let oldestKey: string | undefined
      let oldestTime = Number.POSITIVE_INFINITY
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt < oldestTime) {
          oldestTime = entry.expiresAt
          oldestKey = key
        }
      }
      if (oldestKey) this.cache.delete(oldestKey)
    }

    // IP3-006: Calculate token expiry based on provider
    const defaultTtl = DEFAULT_TOKEN_TTL[cluster.provider]
    const tokenExpiresAt = defaultTtl ? now + defaultTtl : null

    this.cache.set(clusterId, {
      kc,
      expiresAt: now + TTL_MS,
      provider: cluster.provider,
      clusterId,
      tokenExpiresAt,
      connectionConfig: config,
    })
    return kc
  }

  /**
   * IP3-006: Retry with fresh token on 401/403.
   * Call this when a K8s API call fails with auth error.
   */
  async refreshAndRetry<T>(
    clusterId: string,
    operation: (kc: k8s.KubeConfig) => Promise<T>,
  ): Promise<T> {
    this.invalidate(clusterId)
    const kc = await this.getClient(clusterId)
    return operation(kc)
  }

  invalidate(clusterId: string): void {
    this.cache.delete(clusterId)
  }
}

export const clusterClientPool = new ClusterClientPool()
