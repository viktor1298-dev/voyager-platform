import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetricsStreamEvent } from '@voyager/types'

// ── Shared mock state ─────────────────────────────────────────
// vi.hoisted() lets us define mock state that vi.mock factories can reference
const mocks = vi.hoisted(() => {
  const coreV1Api = {
    listNode: vi.fn().mockResolvedValue({
      items: [
        {
          metadata: { name: 'node-1' },
          status: { allocatable: { cpu: '2', memory: '4Gi' } },
        },
      ],
    }),
    listPodForAllNamespaces: vi.fn().mockResolvedValue({
      items: Array.from({ length: 10 }, (_, i) => ({ metadata: { name: `pod-${i}` } })),
    }),
  }

  const metricsClient = {
    getNodeMetrics: vi.fn().mockResolvedValue({
      items: [
        {
          metadata: { name: 'node-1' },
          usage: { cpu: '500m', memory: '1Gi' },
        },
      ],
    }),
    getPodMetrics: vi.fn().mockResolvedValue({ items: [] }),
  }

  const kubeConfig = {
    makeApiClient: vi.fn().mockReturnValue(coreV1Api),
  }

  const getClient = vi.fn().mockResolvedValue(kubeConfig)

  return { coreV1Api, metricsClient, kubeConfig, getClient }
})

vi.mock('../lib/cluster-client-pool.js', () => ({
  clusterClientPool: { getClient: mocks.getClient },
}))

vi.mock('@kubernetes/client-node', () => ({
  Metrics: vi.fn(function () {
    return mocks.metricsClient
  }),
  CoreV1Api: vi.fn(),
}))

// Imports after mocks
import { voyagerEmitter } from '../lib/event-emitter.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { metricsStreamJob } from '../jobs/metrics-stream-job.js'

const CLUSTER_ID = '11111111-1111-1111-1111-111111111111'
const CONN_A = 'conn-a'
const CONN_B = 'conn-b'

describe('MetricsStreamJob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    metricsStreamJob.stopAll()
    voyagerEmitter.removeAllListeners()
    vi.useRealTimers()
  })

  it('subscribe with no prior poller creates a new poller and polls immediately', async () => {
    const events: MetricsStreamEvent[] = []
    const handler = (e: MetricsStreamEvent) => events.push(e)
    voyagerEmitter.on(`metrics-stream:${CLUSTER_ID}`, handler)

    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)

    // Flush multiple microtask ticks so all chained awaits in poll() resolve
    await vi.advanceTimersByTimeAsync(100)

    expect(events.length).toBe(1)
    expect(events[0].clusterId).toBe(CLUSTER_ID)
    expect(typeof events[0].cpu).toBe('number')
    expect(typeof events[0].memory).toBe('number')
    expect(typeof events[0].pods).toBe('number')
    expect(events[0].timestamp).toBeTruthy()
  })

  it('subscribe with existing poller reuses the same interval (subscribers.size === 2)', async () => {
    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)
    await vi.advanceTimersByTimeAsync(0)

    metricsStreamJob.subscribe(CLUSTER_ID, CONN_B)
    await vi.advanceTimersByTimeAsync(0)

    const status = metricsStreamJob.getStatus()
    expect(status.activePollers).toBe(1)
    expect(status.clusterIds).toContain(CLUSTER_ID)
  })

  it('unsubscribe with 2 subscribers leaves poller running (subscribers.size === 1)', async () => {
    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)
    metricsStreamJob.subscribe(CLUSTER_ID, CONN_B)
    await vi.advanceTimersByTimeAsync(0)

    metricsStreamJob.unsubscribe(CLUSTER_ID, CONN_A)

    const status = metricsStreamJob.getStatus()
    expect(status.activePollers).toBe(1)
  })

  it('unsubscribe with 1 subscriber left stops the interval and deletes the poller', async () => {
    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)
    await vi.advanceTimersByTimeAsync(0)

    metricsStreamJob.unsubscribe(CLUSTER_ID, CONN_A)

    const status = metricsStreamJob.getStatus()
    expect(status.activePollers).toBe(0)
    expect(status.clusterIds).toEqual([])
  })

  it('stopAll clears all pollers', async () => {
    const CLUSTER_2 = '22222222-2222-2222-2222-222222222222'
    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)
    metricsStreamJob.subscribe(CLUSTER_2, CONN_B)
    await vi.advanceTimersByTimeAsync(0)

    metricsStreamJob.stopAll()

    const status = metricsStreamJob.getStatus()
    expect(status.activePollers).toBe(0)
    expect(status.clusterIds).toEqual([])
  })

  it('getStatus returns correct activePollers and clusterIds', async () => {
    const CLUSTER_2 = '22222222-2222-2222-2222-222222222222'
    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)
    metricsStreamJob.subscribe(CLUSTER_2, CONN_B)
    await vi.advanceTimersByTimeAsync(0)

    const status = metricsStreamJob.getStatus()
    expect(status.activePollers).toBe(2)
    expect(status.clusterIds).toContain(CLUSTER_ID)
    expect(status.clusterIds).toContain(CLUSTER_2)
  })

  it('poll emits MetricsStreamEvent on voyagerEmitter channel', async () => {
    const events: MetricsStreamEvent[] = []
    const handler = (e: MetricsStreamEvent) => events.push(e)
    voyagerEmitter.on(`metrics-stream:${CLUSTER_ID}`, handler)

    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)
    await vi.advanceTimersByTimeAsync(0) // First immediate poll

    // Advance to trigger interval poll
    await vi.advanceTimersByTimeAsync(15_000)

    expect(events.length).toBe(2) // Immediate + interval
    for (const event of events) {
      expect(event.clusterId).toBe(CLUSTER_ID)
      expect(event.timestamp).toBeTruthy()
    }
  })

  it('poll catches K8s errors and emits error event with code METRICS_UNAVAILABLE', async () => {
    mocks.getClient.mockRejectedValueOnce(new Error('Connection refused'))

    const events: MetricsStreamEvent[] = []
    const handler = (e: MetricsStreamEvent) => events.push(e)
    voyagerEmitter.on(`metrics-stream:${CLUSTER_ID}`, handler)

    metricsStreamJob.subscribe(CLUSTER_ID, CONN_A)
    await vi.advanceTimersByTimeAsync(0)

    expect(events.length).toBe(1)
    expect(events[0].error).toBeDefined()
    expect(events[0].error?.code).toBe('METRICS_UNAVAILABLE')
    expect(events[0].error?.message).toBe('Connection refused')
    expect(events[0].cpu).toBeNull()
    expect(events[0].memory).toBeNull()
    expect(events[0].pods).toBeNull()
  })
})
