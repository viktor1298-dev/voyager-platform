import * as k8s from '@kubernetes/client-node'
import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { decryptCredential } from './credential-crypto.js'
import { createKubeConfigForCluster } from './k8s-client-factory.js'
import type { ClusterConnectionConfig } from './connection-config.js'

const MAX_ENTRIES = 50
const TTL_MS = 5 * 60 * 1000 // 5 minutes
const ENCRYPTION_KEY = process.env.CLUSTER_CRED_ENCRYPTION_KEY ?? ''

interface CacheEntry {
  kc: k8s.KubeConfig
  expiresAt: number
}

export class ClusterClientPool {
  private cache = new Map<string, CacheEntry>()

  async getClient(clusterId: string): Promise<k8s.KubeConfig> {
    const now = Date.now()
    const cached = this.cache.get(clusterId)
    if (cached && cached.expiresAt > now) {
      return cached.kc
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

    this.cache.set(clusterId, { kc, expiresAt: now + TTL_MS })
    return kc
  }

  invalidate(clusterId: string): void {
    this.cache.delete(clusterId)
  }
}

export const clusterClientPool = new ClusterClientPool()
