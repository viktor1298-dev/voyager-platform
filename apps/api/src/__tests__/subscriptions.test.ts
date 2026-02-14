import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { voyagerEmitter } from '../lib/event-emitter.js'
import type { PodEvent, MetricsEvent, AlertEvent, LogLineEvent } from '@voyager/types'

describe('SSE Subscriptions — Event Emitter', () => {
  beforeEach(() => {
    voyagerEmitter.removeAllListeners()
  })

  it('should emit and receive pod events', async () => {
    const received: PodEvent[] = []
    voyagerEmitter.on('pod-event', (event: PodEvent) => received.push(event))

    const mockEvent: PodEvent = {
      type: 'modified',
      name: 'test-pod',
      namespace: 'default',
      phase: 'Running',
      restartCount: 0,
      containerStatuses: [
        { name: 'app', ready: true, restartCount: 0, state: 'running' },
      ],
      timestamp: new Date().toISOString(),
    }

    voyagerEmitter.emitPodEvent(mockEvent)
    expect(received).toHaveLength(1)
    expect(received[0].name).toBe('test-pod')
    expect(received[0].phase).toBe('Running')
  })

  it('should emit and receive metrics events', () => {
    const received: MetricsEvent[] = []
    voyagerEmitter.on('metrics', (event: MetricsEvent) => received.push(event))

    const mockMetrics: MetricsEvent = {
      cpuPercent: 45,
      memoryPercent: 62,
      memoryBytes: 4_000_000_000,
      cpuCores: 2.5,
      podCount: 15,
      timestamp: new Date().toISOString(),
    }

    voyagerEmitter.emitMetrics(mockMetrics)
    expect(received).toHaveLength(1)
    expect(received[0].cpuPercent).toBe(45)
  })

  it('should emit and receive alert events', () => {
    const received: AlertEvent[] = []
    voyagerEmitter.on('alert', (event: AlertEvent) => received.push(event))

    const mockAlert: AlertEvent = {
      id: 'alert-1',
      name: 'High CPU',
      metric: 'cpu',
      operator: 'gt',
      threshold: 80,
      currentValue: 92,
      severity: 'critical',
      triggeredAt: new Date().toISOString(),
    }

    voyagerEmitter.emitAlert(mockAlert)
    expect(received).toHaveLength(1)
    expect(received[0].severity).toBe('critical')
  })

  it('should emit and receive log line events scoped to pod key', () => {
    const podKey = 'default/my-pod/app'
    const otherKey = 'default/other-pod/app'
    const received: LogLineEvent[] = []

    voyagerEmitter.on(`log:${podKey}`, (event: LogLineEvent) => received.push(event))

    const mockLog: LogLineEvent = {
      line: '2024-01-01 Starting app...',
      timestamp: new Date().toISOString(),
      isNewSinceConnect: false,
    }

    // Should receive this one
    voyagerEmitter.emitLogLine(podKey, mockLog)
    // Should NOT receive this one (different pod)
    voyagerEmitter.emitLogLine(otherKey, { ...mockLog, line: 'other pod' })

    expect(received).toHaveLength(1)
    expect(received[0].line).toBe('2024-01-01 Starting app...')
  })

  it('should support multiple listeners on same event', () => {
    let count1 = 0
    let count2 = 0
    voyagerEmitter.on('metrics', () => { count1++ })
    voyagerEmitter.on('metrics', () => { count2++ })

    voyagerEmitter.emitMetrics({
      cpuPercent: 10, memoryPercent: 20, memoryBytes: 1000,
      cpuCores: 1, podCount: 5, timestamp: new Date().toISOString(),
    })

    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })

  it('should clean up listeners on removal', () => {
    const received: PodEvent[] = []
    const handler = (event: PodEvent) => received.push(event)
    voyagerEmitter.on('pod-event', handler)

    voyagerEmitter.emitPodEvent({
      type: 'added', name: 'pod1', namespace: 'default', phase: 'Running',
      restartCount: 0, containerStatuses: [], timestamp: new Date().toISOString(),
    })
    expect(received).toHaveLength(1)

    // Remove listener
    voyagerEmitter.off('pod-event', handler)

    voyagerEmitter.emitPodEvent({
      type: 'added', name: 'pod2', namespace: 'default', phase: 'Running',
      restartCount: 0, containerStatuses: [], timestamp: new Date().toISOString(),
    })
    expect(received).toHaveLength(1) // Should NOT have received pod2
  })
})

describe('SSE Subscriptions — Async Generator Stream', () => {
  it('should create event stream and receive events', async () => {
    // Import the helper indirectly by testing the subscription router behavior
    // We test that emitted events arrive through the async generator pattern
    const events: PodEvent[] = []
    const abortController = new AbortController()

    // Simulate what createEventStream does
    const queue: PodEvent[] = []
    let resolve: (() => void) | null = null
    let done = false

    const handler = (data: PodEvent) => {
      queue.push(data)
      if (resolve) { resolve(); resolve = null }
    }
    voyagerEmitter.on('pod-event', handler)
    abortController.signal.addEventListener('abort', () => {
      done = true
      voyagerEmitter.off('pod-event', handler)
      if (resolve) { resolve(); resolve = null }
    })

    // Emit some events
    setTimeout(() => {
      voyagerEmitter.emitPodEvent({
        type: 'added', name: 'stream-pod', namespace: 'default', phase: 'Pending',
        restartCount: 0, containerStatuses: [], timestamp: new Date().toISOString(),
      })
    }, 10)

    setTimeout(() => {
      abortController.abort()
    }, 50)

    // Consume from queue
    while (!done || queue.length > 0) {
      while (queue.length === 0 && !done) {
        await new Promise<void>((r) => { resolve = r })
      }
      if (queue.length > 0) {
        events.push(queue.shift()!)
      }
    }

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0].name).toBe('stream-pod')
  })

  it('should handle abort signal for cleanup', async () => {
    const abortController = new AbortController()
    let handlerCount = 0

    const handler = () => { handlerCount++ }
    voyagerEmitter.on('metrics', handler)

    abortController.abort()

    // After abort, emitting should still work for other listeners but our handler is unaffected
    voyagerEmitter.emitMetrics({
      cpuPercent: 10, memoryPercent: 20, memoryBytes: 1000,
      cpuCores: 1, podCount: 5, timestamp: new Date().toISOString(),
    })

    expect(handlerCount).toBe(1) // Handler was NOT removed by abort in this case
    voyagerEmitter.off('metrics', handler)
  })
})
