import { EventEmitter } from 'node:events'
import type {
  AlertEvent,
  ClusterStateChangeEvent,
  DeploymentProgressEvent,
  LogLineEvent,
  MetricsEvent,
  MetricsStreamEvent,
  PodEvent,
  ResourceChangeEvent,
  WatchEvent,
  WatchStatusEvent,
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

  emitClusterStateChange(event: ClusterStateChangeEvent): void {
    this.emit('cluster-state-change', event)
  }

  emitMetricsStream(clusterId: string, event: MetricsStreamEvent): void {
    this.emit(`metrics-stream:${clusterId}`, event)
  }

  emitResourceChange(clusterId: string, event: ResourceChangeEvent): void {
    this.emit(`resource-change:${clusterId}`, event)
  }

  emitWatchEvent(clusterId: string, event: WatchEvent): void {
    this.emit(`watch-event:${clusterId}`, event)
  }

  emitWatchStatus(event: WatchStatusEvent): void {
    this.emit(`watch-status:${event.clusterId}`, event)
  }
}

// Prevent listener leak warnings for many concurrent subscribers
const MAX_LISTENERS = 200

export const voyagerEmitter = new VoyagerEventEmitter()
voyagerEmitter.setMaxListeners(MAX_LISTENERS)
