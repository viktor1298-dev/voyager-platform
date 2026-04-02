import * as k8s from '@kubernetes/client-node'
import { clusters, db, metricsHistory, nodeMetricsHistory } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { JOB_INTERVALS } from '../config/jobs.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false
let lastCollectTime: Date | null = null

/** Parse pod network stats from K8s metrics-server (best-effort, returns null on failure) */
async function collectNetworkBytes(
  podMetrics: k8s.PodMetricsList,
): Promise<{ bytesIn: number; bytesOut: number } | null> {
  try {
    let totalBytesIn = 0
    let totalBytesOut = 0
    let hasData = false

    for (const pod of podMetrics.items) {
      for (const container of pod.containers ?? []) {
        // metrics-server v0.7+ exposes network via window.average.totalBytesIn / Out on some distros
        // Fallback: read from container usage if available
        const usage = container.usage as unknown as Record<string, string> | undefined
        if (usage?.['network.rx_bytes']) {
          totalBytesIn += parseInt(usage['network.rx_bytes'] ?? '0', 10)
          hasData = true
        }
        if (usage?.['network.tx_bytes']) {
          totalBytesOut += parseInt(usage['network.tx_bytes'] ?? '0', 10)
          hasData = true
        }
      }
    }

    return hasData ? { bytesIn: totalBytesIn, bytesOut: totalBytesOut } : null
  } catch {
    return null
  }
}

/** Per-cluster metrics collection timeout (ms) */
const CLUSTER_TIMEOUT_MS = 15_000

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** Collect metrics for a single cluster */
async function collectClusterMetrics(clusterId: string): Promise<void> {
  let kc: k8s.KubeConfig
  try {
    kc = await withTimeout(
      clusterClientPool.getClient(clusterId),
      CLUSTER_TIMEOUT_MS,
      `getClient(${clusterId})`,
    )
  } catch (err) {
    console.warn(
      `[metrics-collector] skipping cluster ${clusterId} — cannot create client:`,
      err instanceof Error ? err.message : err,
    )
    return
  }
  const coreApi = kc.makeApiClient(k8s.CoreV1Api)
  const metricsClient = new k8s.Metrics(kc)

  // Fetch core API data (nodes, pods) and metrics separately so metrics failure
  // doesn't prevent storing pod/node counts
  const [nodesRes, podsRes] = await withTimeout(
    Promise.all([coreApi.listNode(), coreApi.listPodForAllNamespaces()]),
    CLUSTER_TIMEOUT_MS,
    `core-fetch(${clusterId})`,
  )

  let totalCpuUsageNano = 0
  let totalMemUsageBytes = 0
  let totalCpuAllocatable = 0
  let totalMemAllocatable = 0

  const allocMap = new Map<string, { cpu: number; mem: number }>()
  for (const node of nodesRes.items) {
    const name = node.metadata?.name
    if (name) {
      allocMap.set(name, {
        cpu: parseCpuToNano(node.status?.allocatable?.cpu ?? '0'),
        mem: parseMemToBytes(node.status?.allocatable?.memory ?? '0'),
      })
    }
  }

  // Metrics API (metrics-server) may not be available — collect best-effort
  let nodeMetricsItems: Awaited<ReturnType<typeof metricsClient.getNodeMetrics>>['items'] = []
  try {
    const nodeMetrics = await withTimeout(
      metricsClient.getNodeMetrics(),
      CLUSTER_TIMEOUT_MS,
      `metrics-api(${clusterId})`,
    )
    nodeMetricsItems = nodeMetrics.items
  } catch {
    console.warn(
      `[metrics-collector] metrics-server unavailable for cluster ${clusterId} — storing pod/node counts only`,
    )
  }

  for (const nm of nodeMetricsItems) {
    totalCpuUsageNano += parseCpuToNano(nm.usage?.cpu ?? '0')
    totalMemUsageBytes += parseMemToBytes(nm.usage?.memory ?? '0')
    const alloc = allocMap.get(nm.metadata?.name ?? '')
    if (alloc) {
      totalCpuAllocatable += alloc.cpu
      totalMemAllocatable += alloc.mem
    }
  }

  const cpuPercent =
    totalCpuAllocatable > 0 ? Math.round((totalCpuUsageNano / totalCpuAllocatable) * 1000) / 10 : 0
  const memPercent =
    totalMemAllocatable > 0 ? Math.round((totalMemUsageBytes / totalMemAllocatable) * 1000) / 10 : 0

  // M-P3-002: Collect network I/O (best-effort via pod metrics)
  let networkBytesIn = 0
  let networkBytesOut = 0
  try {
    const podMetrics = await metricsClient.getPodMetrics()
    const netStats = await collectNetworkBytes(podMetrics)
    if (netStats) {
      networkBytesIn = netStats.bytesIn
      networkBytesOut = netStats.bytesOut
    }
  } catch {
    // Network metrics not available — store 0 (chart will hide the series)
  }

  await db.insert(metricsHistory).values({
    clusterId,
    cpuPercent,
    memPercent,
    podCount: podsRes.items.length,
    nodeCount: nodesRes.items.length,
    networkBytesIn,
    networkBytesOut,
  })

  // Per-node metrics (MX-002) — batch insert to avoid N+1
  const nodeValues = nodeMetricsItems.map((nm) => {
    const nodeName = nm.metadata?.name ?? 'unknown'
    const usedCpuNano = parseCpuToNano(nm.usage?.cpu ?? '0')
    const usedMemBytes = parseMemToBytes(nm.usage?.memory ?? '0')
    const alloc = allocMap.get(nodeName)

    const nodeCpuPercent =
      alloc && alloc.cpu > 0 ? Math.round((usedCpuNano / alloc.cpu) * 1000) / 10 : 0
    const nodeMemPercent =
      alloc && alloc.mem > 0 ? Math.round((usedMemBytes / alloc.mem) * 1000) / 10 : 0

    return {
      clusterId,
      nodeName,
      timestamp: new Date(),
      cpuPercent: nodeCpuPercent,
      memPercent: nodeMemPercent,
      cpuMillis: Math.round(usedCpuNano / 1_000_000),
      memMi: Math.round(usedMemBytes / (1024 * 1024)),
    }
  })

  if (nodeValues.length > 0) {
    await db.insert(nodeMetricsHistory).values(nodeValues)
  }
}

/** Concurrency-limited parallel collection across all active clusters */
const CONCURRENCY_LIMIT = 5

async function collectMetrics(): Promise<void> {
  const allClusters = await db
    .select({ id: clusters.id })
    .from(clusters)
    .where(eq(clusters.isActive, true))

  // Process clusters in batches of CONCURRENCY_LIMIT to avoid overwhelming K8s APIs
  for (let i = 0; i < allClusters.length; i += CONCURRENCY_LIMIT) {
    const batch = allClusters.slice(i, i + CONCURRENCY_LIMIT)
    const results = await Promise.allSettled(
      batch.map((cluster) => collectClusterMetrics(cluster.id)),
    )
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'rejected') {
        console.warn(
          `[metrics-collector] failed for cluster ${batch[j].id}`,
          (results[j] as PromiseRejectedResult).reason,
        )
      }
    }
  }

  lastCollectTime = new Date()
  console.log(
    `[metrics-collector] collected at ${lastCollectTime.toISOString()} for ${allClusters.length} clusters`,
  )
}

export function startMetricsHistoryCollector(): void {
  if (intervalHandle) return

  const run = async () => {
    if (isRunning) return
    isRunning = true
    try {
      await collectMetrics()
    } catch (error) {
      console.error('[metrics-collector] job run failed', error)
    } finally {
      isRunning = false
    }
  }

  void run()
  intervalHandle = setInterval(() => {
    void run()
  }, JOB_INTERVALS.METRICS_COLLECT_MS)
}

export function stopMetricsHistoryCollector(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

/** MX-004: Health endpoint for metrics collector status */
export function getCollectorStatus() {
  return {
    running: intervalHandle !== null,
    lastCollectTime: lastCollectTime?.toISOString() ?? null,
    intervalMs: JOB_INTERVALS.METRICS_COLLECT_MS,
  }
}
