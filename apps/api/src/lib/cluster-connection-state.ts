import type { ClusterConnectionState, ClusterStateChangeEvent } from '@voyager/types'
import { voyagerEmitter } from './event-emitter.js'

/**
 * Finite State Machine for per-cluster connection state.
 * States: connected | connecting | disconnected | error | auth_expired
 * Emits state changes to voyagerEmitter for real-time UI updates.
 */
class ClusterConnectionStateMachine {
  private states = new Map<string, ClusterConnectionState>()

  getState(clusterId: string): ClusterConnectionState {
    return this.states.get(clusterId) ?? 'disconnected'
  }

  getAllStates(): Map<string, ClusterConnectionState> {
    return new Map(this.states)
  }

  transition(clusterId: string, newState: ClusterConnectionState, error?: string): void {
    const currentState = this.getState(clusterId)
    if (currentState === newState) return

    this.states.set(clusterId, newState)

    const event: ClusterStateChangeEvent = {
      clusterId,
      state: newState,
      error,
      timestamp: new Date().toISOString(),
    }
    voyagerEmitter.emitClusterStateChange(event)

    console.log(
      `[ClusterState] ${clusterId}: ${currentState} → ${newState}${error ? ` (${error})` : ''}`,
    )
  }

  onWatchError(clusterId: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err)

    if (message.includes('401') || message.includes('403') || message.includes('Unauthorized')) {
      this.transition(clusterId, 'auth_expired', message)
      return
    }

    this.transition(clusterId, 'error', message)
  }

  onWatchConnected(clusterId: string): void {
    this.transition(clusterId, 'connected')
  }

  onWatchConnecting(clusterId: string): void {
    this.transition(clusterId, 'connecting')
  }

  onClusterRemoved(clusterId: string): void {
    this.states.delete(clusterId)
  }
}

export const connectionState = new ClusterConnectionStateMachine()
