import { SSE_HEARTBEAT_INTERVAL_MS } from '@voyager/config/sse'
import type {
  AlertEvent,
  DeploymentProgressEvent,
  LogLineEvent,
  MetricsEvent,
  PodEvent,
} from '@voyager/types'
import { z } from 'zod'
import { voyagerEmitter } from '../lib/event-emitter'
import { streamLogs, watchDeploymentProgress } from '../lib/k8s-watchers'
import { protectedProcedure, router } from '../trpc'

/**
 * Helper: create an async generator that listens to EventEmitter events.
 * Automatically cleans up on abort signal.
 */
function createEventStream<T>(
  eventName: string,
  signal: AbortSignal,
): AsyncGenerator<T, void, unknown> {
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
  signal.addEventListener('abort', () => {
    done = true
    voyagerEmitter.off(eventName, handler)
    if (resolve) {
      resolve()
      resolve = null
    }
  })

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
   * Live pod events — subscribe to K8s watch API for pod status changes
   */
  podEvents: protectedProcedure
    .input(
      z
        .object({
          namespace: z.string().optional(),
        })
        .optional(),
    )
    .subscription(async function* ({ input, signal }) {
      const stream = createEventStream<PodEvent>('pod-event', signal)
      for await (const event of stream) {
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
      }),
    )
    .subscription(async function* ({ input, signal }) {
      // Start watching this specific deployment
      watchDeploymentProgress(input.name, input.namespace, signal)

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
   */
  metrics: protectedProcedure.subscription(async function* ({ signal }) {
    const stream = createEventStream<MetricsEvent>('metrics', signal)
    for await (const event of stream) {
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
   * Log streaming — tail logs via SSE
   */
  logs: protectedProcedure
    .input(
      z.object({
        podName: z.string(),
        namespace: z.string(),
        container: z.string().optional(),
      }),
    )
    .subscription(async function* ({ input, signal }) {
      const podKey = `${input.namespace}/${input.podName}${input.container ? `/${input.container}` : ''}`

      // Start streaming logs for this pod
      streamLogs(input.podName, input.namespace, input.container, signal)

      const stream = createEventStream<LogLineEvent>(`log:${podKey}`, signal)
      for await (const event of stream) {
        yield event
      }
    }),
})
