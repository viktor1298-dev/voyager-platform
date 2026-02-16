import { describe, expect, it } from 'vitest'
import { detectAnomalies } from '../services/anomaly-service.js'

const CLUSTER_ID = '11111111-1111-1111-1111-111111111111'

describe('AnomalyService rule detection', () => {
  it('detects all configured anomalies when thresholds are exceeded', () => {
    const anomalies = detectAnomalies(CLUSTER_ID, {
      cpuPercent5m: 95,
      memoryPercent: 90,
      podRestarts10m: 8,
      events5m: 180,
      deploymentStuckMinutes: 15,
    })

    expect(anomalies).toHaveLength(5)
    expect(anomalies.map((item) => item.type)).toEqual([
      'cpu_spike',
      'memory_pressure',
      'pod_restart_storm',
      'event_flood',
      'deployment_stuck',
    ])
    expect(anomalies.map((item) => item.severity)).toEqual([
      'critical',
      'warning',
      'critical',
      'warning',
      'critical',
    ])
  })

  it('returns an empty list when no thresholds are exceeded', () => {
    const anomalies = detectAnomalies(CLUSTER_ID, {
      cpuPercent5m: 85,
      memoryPercent: 70,
      podRestarts10m: 3,
      events5m: 40,
      deploymentStuckMinutes: 6,
    })

    expect(anomalies).toEqual([])
  })

  it('uses custom thresholds when provided', () => {
    const anomalies = detectAnomalies(
      CLUSTER_ID,
      {
        cpuPercent5m: 88,
        memoryPercent: 80,
        podRestarts10m: 4,
        events5m: 70,
        deploymentStuckMinutes: 8,
      },
      {
        cpuSpikePercent: 87,
        cpuSpikeMinutes: 5,
        memoryPressurePercent: 79,
        podRestartStormCount: 3,
        podRestartStormMinutes: 10,
        eventFloodCount: 60,
        eventFloodMinutes: 5,
        deploymentStuckMinutes: 7,
      },
    )

    expect(anomalies).toHaveLength(5)
  })
})
