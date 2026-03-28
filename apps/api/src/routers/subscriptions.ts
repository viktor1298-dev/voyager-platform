import type {
  AlertEvent,
  ClusterStateChangeEvent,
  DeploymentProgressEvent,
  LogLineEvent,
  MetricsEvent,
  PodEvent,
} from '@voyager/types'
import { z } from 'zod'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { streamLogs, streamLogsFollow, watchDeploymentProgress } from '../lib/k8s-watchers.js'
import { protectedProcedure, router } from '../trpc.js'

/**
 * Helper: create an async generator that listens to EventEmitter events.
 * Automatically cleans up on abort signal.
 */
function createEventStream<T>(
  eventName: string,
  signal: AbortSignal | undefined,
): AsyncIterableIterator<T> {
  const queue: T[] = []
  let resolve: (() => void) | null = null
  let done = false

  const handler = (data: T) => {
    queue.push(data)
    if (resolve) {
      resolve()
      resolve = null
    }
  }

  voyagerEmitter.on(eventName, handler)
  if (signal) {
    signal.addEventListener('abort', () => {
      done = true
      voyagerEmitter.off(eventName, handler)
      if (resolve) {
        resolve()
        resolve = null
      }
    })
  }

  return {
    async next() {
      while (queue.length === 0 && !done) {
        await new Promise<void>((r) => {
          resolve = r
        })
      }
      if (done && queue.length === 0) return { done: true, value: undefined }
      return { done: false, value: queue.shift()! }
    },
    async return() {
      done = true
      voyagerEmitter.off(eventName, handler)
      return { done: true, value: undefined }
    },
    async throw() {
      done = true
      voyagerEmitter.off(eventName, handler)
      return { done: true, value: undefined }
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
}

export const subscriptionsRouter = router({
  /**
   * Live pod events — subscribe to K8s informer for pod status changes
   * IP3-003: Now accepts optional clusterId to filter by cluster
   */
  podEvents: protectedProcedure
    .input(
      z
        .object({
          namespace: z.string().optional(),
          clusterId: z.string().optional(),
        })
        .optional(),
    )
    .subscription(async function* ({ input, signal }) {
      const stream = createEventStream<PodEvent>('pod-event', signal)
      for await (const event of stream) {
        // Filter by clusterId if specified
        if (input?.clusterId && event.clusterId !== input.clusterId) continue
        // Filter by namespace if specified
        if (input?.namespace && event.namespace !== input.namespace) continue
        yield event
      }
    }),

  /**
   * Deployment progress — real-time rollout status
   */
  deploymentProgress: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        namespace: z.string(),
        clusterId: z.string().optional(),
      }),
    )
    .subscription(async function* ({ input, signal }) {
      watchDeploymentProgress(input.name, input.namespace, signal, input.clusterId)

      const eventName = 'deployment-progress'
      const stream = createEventStream<DeploymentProgressEvent>(eventName, signal)
      for await (const event of stream) {
        if (event.name === input.name && event.namespace === input.namespace) {
          yield event
        }
      }
    }),

  /**
   * Metrics stream — live CPU/memory updates
   * IP3-003: Now accepts optional clusterId to filter by cluster
   */
  metrics: protectedProcedure
    .input(
      z
        .object({
          clusterId: z.string().optional(),
        })
        .optional(),
    )
    .subscription(async function* ({ input, signal }) {
      const stream = createEventStream<MetricsEvent>('metrics', signal)
      for await (const event of stream) {
        // Filter by clusterId if specified
        if (input?.clusterId && event.clusterId !== input.clusterId) continue
        yield event
      }
    }),

  /**
   * Alert stream — new alerts pushed instantly
   */
  alerts: protectedProcedure.subscription(async function* ({ signal }) {
    const stream = createEventStream<AlertEvent>('alert', signal)
    for await (const event of stream) {
      yield event
    }
  }),

  /**
   * Log streaming — follow mode (IP3-005)
   * Uses k8s.Log follow mode when clusterId provided, falls back to polling otherwise
   */
  logs: protectedProcedure
    .input(
      z.object({
        podName: z.string(),
        namespace: z.string(),
        container: z.string().optional(),
        clusterId: z.string().optional(),
      }),
    )
    .subscription(async function* ({ input, signal }) {
      if (input.clusterId && signal) {
        // IP3-005: Use follow mode with clusterId
        const podKey = `${input.clusterId}/${input.namespace}/${input.podName}${input.container ? `/${input.container}` : ''}`
        streamLogsFollow(
          input.clusterId,
          input.namespace,
          input.podName,
          input.container,
          signal,
        ).catch((err) => {
          console.error(`[logs] Follow mode failed for ${podKey}:`, err.message)
        })

        const stream = createEventStream<LogLineEvent>(`log:${podKey}`, signal)
        for await (const event of stream) {
          yield event
        }
      } else {
        // Legacy: polling mode without clusterId
        const podKey = `${input.namespace}/${input.podName}${input.container ? `/${input.container}` : ''}`
        streamLogs(input.podName, input.namespace, input.container, signal)

        const stream = createEventStream<LogLineEvent>(`log:${podKey}`, signal)
        for await (const event of stream) {
          yield event
        }
      }
    }),

  /**
   * Cluster connection state changes — real-time FSM updates
   * IP3-004: New subscription for cluster state changes
   */
  clusterState: protectedProcedure
    .input(
      z
        .object({
          clusterId: z.string().optional(),
        })
        .optional(),
    )
    .subscription(async function* ({ input, signal }) {
      const stream = createEventStream<ClusterStateChangeEvent>('cluster-state-change', signal)
      for await (const event of stream) {
        if (input?.clusterId && event.clusterId !== input.clusterId) continue
        yield event
      }
    }),
})
