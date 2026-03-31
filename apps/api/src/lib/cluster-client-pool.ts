import type * as k8s from '@kubernetes/client-node'
import { CACHE_TTL, TOKEN_REFRESH_THRESHOLD_RATIO } from '@voyager/config'
import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { K8S_CONFIG } from '../config/k8s.js'
import type { ClusterConnectionConfig } from './connection-config.js'
import { decryptCredential } from './credential-crypto.js'
import { createKubeConfigForCluster } from './k8s-client-factory.js'

// Default token TTL assumptions by provider (ms)
const DEFAULT_TOKEN_TTL: Record<string, number> = {
  eks: 15 * 60 * 1000, // EKS tokens: 15 min
  gke: 60 * 60 * 1000, // GKE tokens: 1 hour
  aks: 60 * 60 * 1000, // AKS tokens: 1 hour
}

interface CacheEntry {
  kc: k8s.KubeConfig
  expiresAt: number
  provider: string
  clusterId: string
  tokenExpiresAt: number | null // IP3-006: token expiry tracking
  connectionConfig: Record<string, unknown>
  lastAccessedAt: number // True LRU eviction timestamp
}

export class ClusterClientPool {
  private cache = new Map<string, CacheEntry>()

  async getClient(clusterId: string): Promise<k8s.KubeConfig> {
    const now = Date.now()
    const cached = this.cache.get(clusterId)

    if (cached) {
      // IP3-006: Proactive token refresh at 80% of TTL
      if (cached.tokenExpiresAt) {
        const ttl = cached.tokenExpiresAt - (cached.expiresAt - CACHE_TTL.CLUSTER_CLIENT_MS)
        const refreshAt = cached.tokenExpiresAt - ttl * (1 - TOKEN_REFRESH_THRESHOLD_RATIO)
        if (now >= refreshAt) {
          console.log(`[ClusterClientPool] Proactive token refresh for ${clusterId}`)
          this.cache.delete(clusterId)
          return this.getClient(clusterId)
        }
      }

      if (cached.expiresAt > now) {
        cached.lastAccessedAt = now
        return cached.kc
      }
    }

    const [cluster] = await db.select().from(clusters).where(eq(clusters.id, clusterId))
    if (!cluster) {
      throw new Error(`Cluster ${clusterId} not found`)
    }

    let config = cluster.connectionConfig as Record<string, unknown>
    if (
      typeof config.__encrypted === 'string' &&
      /^[0-9a-fA-F]{64}$/.test(K8S_CONFIG.ENCRYPTION_KEY)
    ) {
      config = JSON.parse(decryptCredential(config.__encrypted, K8S_CONFIG.ENCRYPTION_KEY))
    }

    const kc = await createKubeConfigForCluster(cluster.provider, config as ClusterConnectionConfig)

    if (this.cache.size >= K8S_CONFIG.CLIENT_POOL_MAX) {
      let lruKey: string | undefined
      let lruTime = Number.POSITIVE_INFINITY
      for (const [key, entry] of this.cache) {
        if (entry.lastAccessedAt < lruTime) {
          lruTime = entry.lastAccessedAt
          lruKey = key
        }
      }
      if (lruKey) this.cache.delete(lruKey)
    }

    // IP3-006: Calculate token expiry based on provider
    const defaultTtl = DEFAULT_TOKEN_TTL[cluster.provider]
    const tokenExpiresAt = defaultTtl ? now + defaultTtl : null

    this.cache.set(clusterId, {
      kc,
      expiresAt: now + CACHE_TTL.CLUSTER_CLIENT_MS,
      provider: cluster.provider,
      clusterId,
      tokenExpiresAt,
      connectionConfig: config,
      lastAccessedAt: now,
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
