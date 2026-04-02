import { describe, it, expect } from 'vitest'
import {
  mapPod,
  mapDeployment,
  mapService,
  mapNode,
  mapConfigMap,
  mapSecret,
  mapPVC,
  mapNamespace,
  mapEvent,
  mapIngress,
  mapStatefulSet,
  mapDaemonSet,
  mapJob,
  mapCronJob,
  mapHPA,
  deriveImageVersion,
  deriveDeploymentStatus,
} from '../lib/resource-mappers.js'

// ── Helpers ───────────────────────────────────────────────────

describe('deriveImageVersion', () => {
  it('extracts tag from image', () => {
    expect(deriveImageVersion('nginx:1.21')).toBe('1.21')
  })

  it('returns "latest" for tagless image', () => {
    expect(deriveImageVersion('nginx')).toBe('latest')
  })

  it('returns digest for sha256 image', () => {
    expect(deriveImageVersion('nginx@sha256:abc')).toBe('sha256:abc')
  })

  it('returns "unknown" for empty/unknown', () => {
    expect(deriveImageVersion('unknown')).toBe('unknown')
    expect(deriveImageVersion('')).toBe('unknown')
  })
})

describe('deriveDeploymentStatus', () => {
  it('returns Running when all ready', () => {
    expect(deriveDeploymentStatus({ ready: 3, replicas: 3, available: 3, unavailable: 0 })).toBe(
      'Running',
    )
  })

  it('returns Scaling when generation > observedGeneration', () => {
    expect(
      deriveDeploymentStatus({
        ready: 3,
        replicas: 3,
        available: 3,
        unavailable: 0,
        generation: 5,
        observedGeneration: 4,
      }),
    ).toBe('Scaling')
  })

  it('returns Failed when unavailable > 0 and ready === 0', () => {
    expect(deriveDeploymentStatus({ ready: 0, replicas: 3, available: 0, unavailable: 3 })).toBe(
      'Failed',
    )
  })

  it('returns Pending when replicas === 0', () => {
    expect(deriveDeploymentStatus({ ready: 0, replicas: 0, available: 0, unavailable: 0 })).toBe(
      'Pending',
    )
  })
})

// ── Pod Mapper ────────────────────────────────────────────────

describe('mapPod', () => {
  const rawPod = {
    metadata: {
      name: 'test-pod',
      namespace: 'default',
      creationTimestamp: new Date('2026-01-01'),
      labels: { app: 'test' },
    },
    spec: {
      nodeName: 'node-1',
      containers: [
        {
          name: 'app',
          image: 'nginx:1.21',
          ports: [{ containerPort: 80, protocol: 'TCP' }],
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '500m', memory: '256Mi' },
          },
        },
      ],
    },
    status: {
      phase: 'Running',
      containerStatuses: [
        {
          name: 'app',
          ready: true,
          restartCount: 2,
          state: { running: { startedAt: new Date() } },
          lastState: { terminated: { reason: 'OOMKilled' } },
        },
      ],
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  }

  it('produces correct shape without metrics', () => {
    const result = mapPod(rawPod as never)
    expect(result.name).toBe('test-pod')
    expect(result.namespace).toBe('default')
    expect(result.status).toBe('Running')
    expect(result.nodeName).toBe('node-1')
    expect(result.cpuMillis).toBeNull()
    expect(result.memoryMi).toBeNull()
    expect(result.cpuPercent).toBeNull()
    expect(result.memoryPercent).toBeNull()
    expect(result.ready).toBe('1/1')
    expect(result.restartCount).toBe(2)
    expect(result.lastRestartReason).toBe('OOMKilled')
    expect(result.containers).toHaveLength(1)
    expect(result.labels).toEqual({ app: 'test' })
  })

  it('produces correct shape with metrics', () => {
    const metricsMap = new Map([
      ['default/test-pod', { cpuNano: 50_000_000, memBytes: 64 * 1024 * 1024 }],
    ])
    const result = mapPod(rawPod as never, metricsMap)
    expect(result.cpuMillis).toBe(50)
    expect(result.memoryMi).toBe(64)
    expect(result.cpuPercent).toBeGreaterThan(0)
    expect(result.memoryPercent).toBeGreaterThan(0)
  })

  it('defaults missing fields gracefully', () => {
    const emptyPod = { metadata: {}, spec: {}, status: {} }
    const result = mapPod(emptyPod as never)
    expect(result.name).toBe('')
    expect(result.namespace).toBe('')
    expect(result.status).toBe('Unknown')
    expect(result.nodeName).toBeNull()
    expect(result.ready).toBe('0/0')
    expect(result.containers).toEqual([])
  })
})

// ── Deployment Mapper ─────────────────────────────────────────

describe('mapDeployment', () => {
  it('produces correct shape', () => {
    const rawDep = {
      metadata: {
        name: 'web',
        namespace: 'production',
        creationTimestamp: new Date('2026-01-01'),
        generation: 3,
      },
      spec: {
        replicas: 3,
        template: { spec: { containers: [{ image: 'web:v2.1' }] } },
      },
      status: {
        readyReplicas: 3,
        availableReplicas: 3,
        observedGeneration: 3,
        conditions: [
          {
            type: 'Available',
            status: 'True',
            lastTransitionTime: new Date('2026-01-02'),
          },
        ],
      },
    }

    const result = mapDeployment(rawDep as never, 'cluster-1', 'my-cluster')
    expect(result.clusterId).toBe('cluster-1')
    expect(result.clusterName).toBe('my-cluster')
    expect(result.name).toBe('web')
    expect(result.namespace).toBe('production')
    expect(result.replicas).toBe(3)
    expect(result.ready).toBe(3)
    expect(result.image).toBe('web:v2.1')
    expect(result.imageVersion).toBe('v2.1')
    expect(result.status).toBe('Running')
    expect(result.rolloutHistory).toEqual([])
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

// ── Service Mapper ────────────────────────────────────────────

describe('mapService', () => {
  it('produces correct shape', () => {
    const rawSvc = {
      metadata: {
        name: 'web-svc',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
      },
      spec: {
        type: 'ClusterIP',
        clusterIP: '10.0.0.1',
        ports: [{ name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }],
      },
    }

    const result = mapService(rawSvc as never)
    expect(result.name).toBe('web-svc')
    expect(result.namespace).toBe('default')
    expect(result.type).toBe('ClusterIP')
    expect(result.clusterIP).toBe('10.0.0.1')
    expect(result.ports).toHaveLength(1)
    expect(result.ports[0].port).toBe(80)
  })
})

// ── Node Mapper ───────────────────────────────────────────────

describe('mapNode', () => {
  it('produces correct shape without metrics', () => {
    const rawNode = {
      metadata: {
        name: 'node-1',
        labels: { 'node-role.kubernetes.io/control-plane': '' },
      },
      spec: {
        taints: [{ key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' }],
      },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        capacity: { cpu: '4', memory: '16Gi', pods: '110' },
        allocatable: { cpu: '3800m', memory: '15Gi', pods: '110' },
        nodeInfo: { kubeletVersion: 'v1.28.0', osImage: 'Ubuntu 22.04' },
        addresses: [{ type: 'InternalIP', address: '10.0.1.1' }],
      },
    }

    const result = mapNode(rawNode as never)
    expect(result.name).toBe('node-1')
    expect(result.status).toBe('Ready')
    expect(result.role).toBe('control-plane')
    expect(result.kubeletVersion).toBe('v1.28.0')
    expect(result.cpuCapacityMillis).toBe(4000)
    expect(result.cpuAllocatableMillis).toBe(3800)
    expect(result.cpuUsageMillis).toBeNull()
    expect(result.memUsageMi).toBeNull()
    expect(result.cpuPercent).toBeNull()
    expect(result.memPercent).toBeNull()
    expect(result.taints).toHaveLength(1)
    expect(result.addresses).toHaveLength(1)
  })

  it('includes metrics when provided', () => {
    const rawNode = {
      metadata: { name: 'node-1', labels: {} },
      spec: {},
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        capacity: { cpu: '4', memory: '16Gi' },
        allocatable: { cpu: '4', memory: '16Gi' },
        nodeInfo: {},
      },
    }

    const metricsMap = new Map([
      ['node-1', { cpuNano: 2_000_000_000, memBytes: 8 * 1024 * 1024 * 1024 }],
    ])
    const result = mapNode(rawNode as never, metricsMap)
    expect(result.cpuUsageMillis).toBe(2000)
    expect(result.cpuPercent).toBe(50)
  })
})

// ── ConfigMap Mapper ──────────────────────────────────────────

describe('mapConfigMap', () => {
  it('produces correct shape', () => {
    const rawCM = {
      metadata: {
        name: 'my-config',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
        labels: {},
      },
      data: { key1: 'value1', key2: 'value2' },
    }

    const result = mapConfigMap(rawCM as never)
    expect(result.name).toBe('my-config')
    expect(result.namespace).toBe('default')
    expect(result.dataKeysCount).toBe(2)
    expect(result.dataEntries).toHaveLength(2)
    expect(result.dataEntries[0].key).toBe('key1')
    expect(result.dataEntries[0].value).toBe('value1')
  })
})

// ── Secret Mapper ─────────────────────────────────────────────

describe('mapSecret', () => {
  it('produces correct shape (no data values exposed)', () => {
    const rawSecret = {
      metadata: {
        name: 'my-secret',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
        labels: {},
        annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '...', note: 'hello' },
      },
      type: 'Opaque',
      data: { password: 'encoded', token: 'encoded2' },
    }

    const result = mapSecret(rawSecret as never)
    expect(result.name).toBe('my-secret')
    expect(result.type).toBe('Opaque')
    expect(result.dataKeysCount).toBe(2)
    expect(result.dataKeyNames).toEqual(['password', 'token'])
    // kubectl annotations filtered out
    expect(result.annotations).toEqual({ note: 'hello' })
  })
})

// ── PVC Mapper ────────────────────────────────────────────────

describe('mapPVC', () => {
  it('produces correct shape', () => {
    const rawPVC = {
      metadata: {
        name: 'data-vol',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
        labels: {},
        annotations: {},
        finalizers: ['kubernetes.io/pvc-protection'],
      },
      spec: {
        storageClassName: 'gp3',
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '10Gi' } },
        volumeName: 'pv-123',
        volumeMode: 'Filesystem',
      },
      status: {
        phase: 'Bound',
        capacity: { storage: '10Gi' },
      },
    }

    const result = mapPVC(rawPVC as never)
    expect(result.name).toBe('data-vol')
    expect(result.phase).toBe('Bound')
    expect(result.storageClass).toBe('gp3')
    expect(result.accessModes).toEqual(['ReadWriteOnce'])
    expect(result.volumeName).toBe('pv-123')
    expect(result.capacity).toBe('10Gi')
    expect(result.requestedStorage).toBe('10Gi')
  })
})

// ── Namespace Mapper ──────────────────────────────────────────

describe('mapNamespace', () => {
  it('produces correct shape', () => {
    const rawNS = {
      metadata: {
        name: 'production',
        creationTimestamp: new Date('2026-01-01'),
        labels: { team: 'backend' },
      },
      status: { phase: 'Active' },
    }

    const result = mapNamespace(rawNS as never)
    expect(result.name).toBe('production')
    expect(result.status).toBe('Active')
    expect(result.labels).toEqual({ team: 'backend' })
    expect(result.resourceQuota).toBeNull()
  })
})

// ── Event Mapper ──────────────────────────────────────────────

describe('mapEvent', () => {
  it('produces correct shape', () => {
    const rawEvent = {
      metadata: {
        uid: 'evt-123',
        namespace: 'default',
      },
      type: 'Warning',
      reason: 'FailedScheduling',
      message: 'No nodes available',
      source: { component: 'default-scheduler' },
      involvedObject: { kind: 'Pod', name: 'test-pod', namespace: 'default' },
      lastTimestamp: new Date('2026-01-01'),
    }

    const result = mapEvent(rawEvent as never)
    expect(result.id).toBe('evt-123')
    expect(result.kind).toBe('Warning')
    expect(result.reason).toBe('FailedScheduling')
    expect(result.source).toBe('default-scheduler')
    expect(result.involvedObject).toEqual({
      kind: 'Pod',
      name: 'test-pod',
      namespace: 'default',
    })
  })
})

// ── Ingress Mapper ────────────────────────────────────────────

describe('mapIngress', () => {
  it('produces correct shape', () => {
    const rawIngress = {
      metadata: {
        name: 'web-ingress',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
        annotations: { 'nginx.ingress.kubernetes.io/rewrite-target': '/' },
      },
      spec: {
        ingressClassName: 'nginx',
        rules: [
          {
            host: 'example.com',
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: { service: { name: 'web', port: { number: 80 } } },
                },
              ],
            },
          },
        ],
        tls: [{ hosts: ['example.com'], secretName: 'tls-secret' }],
      },
    }

    const result = mapIngress(rawIngress as never)
    expect(result.name).toBe('web-ingress')
    expect(result.ingressClassName).toBe('nginx')
    expect(result.hosts).toEqual(['example.com'])
    expect(result.ports).toBe('80, 443')
    expect(result.rules).toHaveLength(1)
    expect(result.tls).toHaveLength(1)
  })
})

// ── StatefulSet Mapper ────────────────────────────────────────

describe('mapStatefulSet', () => {
  it('produces correct shape', () => {
    const rawSS = {
      metadata: {
        name: 'redis',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
      },
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: 'redis' } },
        template: { spec: { containers: [{ image: 'redis:7' }] } },
        volumeClaimTemplates: [
          {
            metadata: { name: 'data' },
            spec: {
              storageClassName: 'gp3',
              accessModes: ['ReadWriteOnce'],
              resources: { requests: { storage: '5Gi' } },
            },
          },
        ],
      },
      status: {
        readyReplicas: 3,
        currentReplicas: 3,
        updatedReplicas: 3,
      },
    }

    const result = mapStatefulSet(rawSS as never)
    expect(result.name).toBe('redis')
    expect(result.replicas).toBe(3)
    expect(result.readyReplicas).toBe(3)
    expect(result.selector).toEqual({ app: 'redis' })
    expect(result.volumeClaimTemplates).toHaveLength(1)
    expect(result.volumeClaimTemplates[0].storageClass).toBe('gp3')
  })
})

// ── DaemonSet Mapper ──────────────────────────────────────────

describe('mapDaemonSet', () => {
  it('produces correct shape', () => {
    const rawDS = {
      metadata: {
        name: 'fluentd',
        namespace: 'kube-system',
        creationTimestamp: new Date('2026-01-01'),
      },
      spec: {
        selector: { matchLabels: { app: 'fluentd' } },
        template: { spec: { tolerations: [] } },
      },
      status: {
        desiredNumberScheduled: 5,
        currentNumberScheduled: 5,
        numberReady: 4,
        updatedNumberScheduled: 5,
        numberAvailable: 4,
        numberUnavailable: 1,
      },
    }

    const result = mapDaemonSet(rawDS as never)
    expect(result.name).toBe('fluentd')
    expect(result.desired).toBe(5)
    expect(result.ready).toBe(4)
    expect(result.unavailable).toBe(1)
    expect(result.selector).toEqual({ app: 'fluentd' })
  })
})

// ── Job Mapper ────────────────────────────────────────────────

describe('mapJob', () => {
  it('produces correct shape for completed job', () => {
    const rawJob = {
      metadata: {
        name: 'data-import',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
      },
      spec: {
        completions: 1,
        parallelism: 1,
        backoffLimit: 6,
      },
      status: {
        succeeded: 1,
        failed: 0,
        active: 0,
        startTime: new Date('2026-01-01T00:00:00Z'),
        completionTime: new Date('2026-01-01T00:05:00Z'),
      },
    }

    const result = mapJob(rawJob as never)
    expect(result.name).toBe('data-import')
    expect(result.status).toBe('Complete')
    expect(result.completions).toBe('1/1')
    expect(result.duration).not.toBeNull()
  })

  it('returns Running for active job', () => {
    const rawJob = {
      metadata: { name: 'test', creationTimestamp: new Date() },
      spec: { completions: 1 },
      status: { active: 1, succeeded: 0, failed: 0 },
    }
    expect(mapJob(rawJob as never).status).toBe('Running')
  })
})

// ── CronJob Mapper ────────────────────────────────────────────

describe('mapCronJob', () => {
  it('produces correct shape', () => {
    const rawCJ = {
      metadata: {
        name: 'cleanup',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
      },
      spec: {
        schedule: '0 0 * * *',
        suspend: false,
        concurrencyPolicy: 'Forbid',
        successfulJobsHistoryLimit: 3,
        failedJobsHistoryLimit: 1,
      },
      status: {
        lastScheduleTime: new Date('2026-01-02'),
        lastSuccessfulTime: new Date('2026-01-02'),
        active: [],
      },
    }

    const result = mapCronJob(rawCJ as never)
    expect(result.name).toBe('cleanup')
    expect(result.schedule).toBe('0 0 * * *')
    expect(result.suspend).toBe(false)
    expect(result.concurrencyPolicy).toBe('Forbid')
    expect(result.activeJobs).toBe(0)
    expect(result.lastScheduleTime).not.toBeNull()
  })
})

// ── HPA Mapper ────────────────────────────────────────────────

describe('mapHPA', () => {
  it('produces correct shape', () => {
    const rawHPA = {
      metadata: {
        name: 'web-hpa',
        namespace: 'default',
        creationTimestamp: new Date('2026-01-01'),
      },
      spec: {
        scaleTargetRef: { kind: 'Deployment', name: 'web' },
        minReplicas: 2,
        maxReplicas: 10,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: { type: 'Utilization', averageUtilization: 80 },
            },
          },
        ],
      },
      status: {
        currentReplicas: 3,
        desiredReplicas: 4,
        currentMetrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              current: { averageUtilization: 85 },
            },
          },
        ],
        conditions: [{ type: 'ScalingActive', status: 'True' }],
      },
    }

    const result = mapHPA(rawHPA as never)
    expect(result.name).toBe('web-hpa')
    expect(result.reference).toBe('Deployment/web')
    expect(result.minReplicas).toBe(2)
    expect(result.maxReplicas).toBe(10)
    expect(result.currentReplicas).toBe(3)
    expect(result.desiredReplicas).toBe(4)
    expect(result.metrics).toHaveLength(1)
    expect(result.metrics[0].name).toBe('cpu')
    expect(result.metrics[0].targetValue).toBe(80)
    expect(result.metrics[0].currentValue).toBe(85)
  })
})
