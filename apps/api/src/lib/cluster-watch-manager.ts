import * as k8s from '@kubernetes/client-node'
import {
  CLUSTER_METRICS_POLL_INTERVAL_MS,
  MAX_CONCURRENT_CLUSTER_WATCHES,
} from '@voyager/config/sse'
import type {
  ContainerStatusSummary,
  MetricsEvent,
  PodEvent,
  PodEventType,
  PodPhase,
} from '@voyager/types'
import { connectionState } from './cluster-connection-state.js'
import { clusterClientPool } from './cluster-client-pool.js'
import { voyagerEmitter } from './event-emitter.js'
import { parseCpuToNano, parseMemToBytes } from './k8s-units.js'

// ── Helpers ─────────────────────────────────────────────────



function mapContainerStatuses(
  statuses: k8s.V1ContainerStatus[] | undefined,
): ContainerStatusSummary[] {
  return (statuses ?? []).map((cs) => {
    let state: 'running' | 'waiting' | 'terminated' = 'waiting'
    let reason: string | undefined
    if (cs.state?.running) state = 'running'
    else if (cs.state?.terminated) {
      state = 'terminated'
      reason = cs.state.terminated.reason ?? undefined
    } else if (cs.state?.waiting) {
      reason = cs.state.waiting.reason ?? undefined
    }
    return {
      name: cs.name,
      ready: cs.ready ?? false,
      restartCount: cs.restartCount ?? 0,
      state,
      reason,
    }
  })
}

function mapPodToEvent(pod: k8s.V1Pod, type: PodEventType, clusterId: string): PodEvent {
  return {
    type,
    clusterId,
    name: pod.metadata?.name ?? 'unknown',
    namespace: pod.metadata?.namespace ?? 'default',
    phase: (pod.status?.phase as PodPhase) ?? 'Unknown',
    reason: pod.status?.reason,
    message: pod.status?.message,
    restartCount: (pod.status?.containerStatuses ?? []).reduce(
      (sum, cs) => sum + (cs.restartCount ?? 0), 0,
    ),
    containerStatuses: mapContainerStatuses(pod.status?.containerStatuses),
    timestamp: new Date().toISOString(),
  }
}

// ── Cluster Informer Set ────────────────────────────────────

interface ClusterInformerSet {
  pods: k8s.Informer<k8s.V1Pod>
  deployments: k8s.Informer<k8s.V1Deployment>
  nodes: k8s.Informer<k8s.V1Node>
  metricsInterval: ReturnType<typeof setInterval>
}

// ── ClusterWatchManager ─────────────────────────────────────

class ClusterWatchManager {
  private clusters = new Map<string, ClusterInformerSet>()

  async startCluster(clusterId: string): Promise<void> {
    if (this.clusters.has(clusterId)) return
    if (this.clusters.size >= MAX_CONCURRENT_CLUSTER_WATCHES) {
      console.warn(`[ClusterWatchManager] Max watches reached (${MAX_CONCURRENT_CLUSTER_WATCHES}), skipping ${clusterId}`)
      return
    }

    connectionState.onWatchConnecting(clusterId)

    try {
      const kc = await clusterClientPool.getClient(clusterId)
      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const appsApi = kc.makeApiClient(k8s.AppsV1Api)

      // Pod informer
      const pods = k8s.makeInformer(kc, '/api/v1/pods',
        () => coreApi.listPodForAllNamespaces())

      pods.on('add', (pod: k8s.V1Pod) => {
        voyagerEmitter.emitPodEvent(mapPodToEvent(pod, 'added', clusterId))
      })
      pods.on('update', (pod: k8s.V1Pod) => {
        voyagerEmitter.emitPodEvent(mapPodToEvent(pod, 'modified', clusterId))
      })
      pods.on('delete', (pod: k8s.V1Pod) => {
        voyagerEmitter.emitPodEvent(mapPodToEvent(pod, 'deleted', clusterId))
      })
      pods.on('error', (err: unknown) => {
        connectionState.onWatchError(clusterId, err)
      })

      // Deployment informer
      const deployments = k8s.makeInformer(kc, '/apis/apps/v1/deployments',
        () => appsApi.listDeploymentForAllNamespaces())

      deployments.on('add', (dep: k8s.V1Deployment) => {
        voyagerEmitter.emit('deployment-event', {
          type: 'added', clusterId, data: dep,
        })
      })
      deployments.on('update', (dep: k8s.V1Deployment) => {
        voyagerEmitter.emit('deployment-event', {
          type: 'modified', clusterId, data: dep,
        })
      })
      deployments.on('delete', (dep: k8s.V1Deployment) => {
        voyagerEmitter.emit('deployment-event', {
          type: 'deleted', clusterId, data: dep,
        })
      })
      deployments.on('error', (err: unknown) => {
        connectionState.onWatchError(clusterId, err)
      })

      // Node informer
      const nodes = k8s.makeInformer(kc, '/api/v1/nodes',
        () => coreApi.listNode())

      nodes.on('add', (node: k8s.V1Node) => {
        voyagerEmitter.emit('node-event', {
          type: 'added', clusterId, data: node,
        })
      })
      nodes.on('update', (node: k8s.V1Node) => {
        voyagerEmitter.emit('node-event', {
          type: 'modified', clusterId, data: node,
        })
      })
      nodes.on('delete', (node: k8s.V1Node) => {
        voyagerEmitter.emit('node-event', {
          type: 'deleted', clusterId, data: node,
        })
      })
      nodes.on('error', (err: unknown) => {
        connectionState.onWatchError(clusterId, err)
      })

      // Start all informers — clean up on partial failure
      const informers = [pods, deployments, nodes]
      const started: k8s.Informer<k8s.KubernetesObject>[] = []
      for (const informer of informers) {
        try {
          await informer.start()
          started.push(informer as k8s.Informer<k8s.KubernetesObject>)
        } catch (startErr) {
          for (const s of started) s.stop()
          throw startErr
        }
      }

      // Metrics polling (Metrics API is not watchable)
      const metricsInterval = setInterval(
        () => this.pollMetrics(clusterId, kc), CLUSTER_METRICS_POLL_INTERVAL_MS)
      // Initial metrics poll
      this.pollMetrics(clusterId, kc)

      this.clusters.set(clusterId, { pods, deployments, nodes, metricsInterval })
      connectionState.onWatchConnected(clusterId)

      console.log(`[ClusterWatchManager] Started watches for cluster ${clusterId}`)
    } catch (err) {
      connectionState.onWatchError(clusterId, err)
      throw err
    }
  }

  stopCluster(clusterId: string): void {
    const set = this.clusters.get(clusterId)
    if (!set) return

    set.pods.stop()
    set.deployments.stop()
    set.nodes.stop()
    clearInterval(set.metricsInterval)
    this.clusters.delete(clusterId)
    connectionState.onClusterRemoved(clusterId)

    console.log(`[ClusterWatchManager] Stopped watches for cluster ${clusterId}`)
  }

  stopAll(): void {
    for (const clusterId of this.clusters.keys()) {
      this.stopCluster(clusterId)
    }
  }

  isWatching(clusterId: string): boolean {
    return this.clusters.has(clusterId)
  }

  getWatchedClusterIds(): string[] {
    return [...this.clusters.keys()]
  }

  private async pollMetrics(clusterId: string, kc: k8s.KubeConfig): Promise<void> {
    try {
      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const metricsClient = new k8s.Metrics(kc)

      const [nodeMetrics, nodesResponse] = await Promise.all([
        metricsClient.getNodeMetrics(),
        coreApi.listNode(),
      ])

      const capacityMap = new Map<string, { cpuNano: number; memBytes: number }>()
      for (const node of nodesResponse.items) {
        const name = node.metadata?.name
        if (name) {
          capacityMap.set(name, {
            cpuNano: parseCpuToNano(node.status?.allocatable?.cpu ?? '0'),
            memBytes: parseMemToBytes(node.status?.allocatable?.memory ?? '0'),
          })
        }
      }

      let totalCpuNano = 0
      let totalMemBytes = 0
      let totalCpuAllocatable = 0
      let totalMemAllocatable = 0

      for (const node of nodeMetrics.items) {
        totalCpuNano += parseCpuToNano(node.usage?.cpu ?? '0')
        totalMemBytes += parseMemToBytes(node.usage?.memory ?? '0')
        const cap = capacityMap.get(node.metadata?.name ?? '')
        if (cap) {
          totalCpuAllocatable += cap.cpuNano
          totalMemAllocatable += cap.memBytes
        }
      }

      let podCount = 0
      try {
        const pods = await coreApi.listPodForAllNamespaces()
        podCount = pods.items?.length ?? 0
      } catch { /* ignore */ }

      const event: MetricsEvent = {
        clusterId,
        cpuCores: totalCpuNano / 1e9,
        cpuPercent: totalCpuAllocatable > 0
          ? Math.round((totalCpuNano / totalCpuAllocatable) * 1000) / 10
          : null,
        memoryBytes: totalMemBytes,
        memoryPercent: totalMemAllocatable > 0
          ? Math.round((totalMemBytes / totalMemAllocatable) * 1000) / 10
          : null,
        podCount,
        timestamp: new Date().toISOString(),
      }

      voyagerEmitter.emitMetrics(event)
    } catch {
      // Metrics API may not be available — silently skip
    }
  }
}

export const clusterWatchManager = new ClusterWatchManager()
