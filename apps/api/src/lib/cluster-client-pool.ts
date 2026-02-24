import * as k8s from '@kubernetes/client-node'
import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { createKubeConfigForCluster } from './k8s-client-factory.js'

type ClusterClient = {
  kubeConfig: k8s.KubeConfig
  coreV1Api: k8s.CoreV1Api
  versionApi: k8s.VersionApi
}

class ClusterClientPool {
  private clients = new Map<string, ClusterClient>()

  async getClient(clusterId: string): Promise<ClusterClient> {
    const cached = this.clients.get(clusterId)
    if (cached) return cached

    const [cluster] = await db.select().from(clusters).where(eq(clusters.id, clusterId)).limit(1)
    if (!cluster) {
      throw new Error(`Cluster not found: ${clusterId}`)
    }

    const kubeConfig = await createKubeConfigForCluster(cluster.provider, cluster.connectionConfig)
    const client: ClusterClient = {
      kubeConfig,
      coreV1Api: kubeConfig.makeApiClient(k8s.CoreV1Api),
      versionApi: kubeConfig.makeApiClient(k8s.VersionApi),
    }

    this.clients.set(clusterId, client)
    return client
  }

  invalidate(clusterId: string): void {
    this.clients.delete(clusterId)
  }

  clear(): void {
    this.clients.clear()
  }
}

export const clusterClientPool = new ClusterClientPool()
export type { ClusterClient }
