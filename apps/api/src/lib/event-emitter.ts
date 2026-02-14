import { EventEmitter } from 'node:events'
import type {
  AlertEvent,
  DeploymentProgressEvent,
  LogLineEvent,
  MetricsEvent,
  PodEvent,
} from '@voyager/types'

/**
 * Global typed event emitter that bridges K8s watchers → tRPC subscriptions.
 * Each channel maps to a specific SSE event type.
 */
class VoyagerEventEmitter extends EventEmitter {
  emitPodEvent(event: PodEvent): void {
    this.emit('pod-event', event)
  }

  emitDeploymentProgress(event: DeploymentProgressEvent): void {
    this.emit('deployment-progress', event)
  }

  emitMetrics(event: MetricsEvent): void {
    this.emit('metrics', event)
  }

  emitAlert(event: AlertEvent): void {
    this.emit('alert', event)
  }

  emitLogLine(podKey: string, event: LogLineEvent): void {
    this.emit(`log:${podKey}`, event)
  }
}

// Prevent listener leak warnings for many concurrent subscribers
const MAX_LISTENERS = 100

export const voyagerEmitter = new VoyagerEventEmitter()
voyagerEmitter.setMaxListeners(MAX_LISTENERS)
