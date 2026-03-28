import { describe, expect, it, vi } from 'vitest'
import { KarpenterService } from '../lib/karpenter-service.js'

const mockKubeConfigGetter = vi.fn().mockResolvedValue({} as never)

const mockCacheDb = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}

describe('KarpenterService', () => {
  it('maps NodePools correctly', async () => {
    const service = new KarpenterService(
      mockKubeConfigGetter,
      mockCacheDb as never,
      () => ({
        listClusterCustomObject: vi.fn().mockResolvedValue({
          items: [
            {
              metadata: { name: 'default' },
              spec: {
                template: {
                  spec: {
                    nodeClassRef: {
                      group: 'karpenter.k8s.aws',
                      kind: 'EC2NodeClass',
                      name: 'default-class',
                    },
                  },
                },
                limits: { cpu: '1000' },
                disruption: {
                  consolidationPolicy: 'WhenEmptyOrUnderutilized',
                  consolidateAfter: '1m',
                  budgets: [{ nodes: '10%' }],
                },
              },
              status: {
                nodes: 3,
                resources: { cpu: '24' },
                conditions: [{ type: 'Ready', status: 'True' }],
              },
            },
          ],
        }),
      }),
      () => ({
        listNode: vi.fn().mockResolvedValue({ items: [] }),
        listPodForAllNamespaces: vi.fn().mockResolvedValue({ items: [] }),
      }),
    )

    const result = await service.listNodePools('11111111-1111-1111-1111-111111111111')
    expect(result).toEqual([
      {
        name: 'default',
        nodeClassRef: {
          group: 'karpenter.k8s.aws',
          kind: 'EC2NodeClass',
          name: 'default-class',
        },
        limits: { cpu: '1000' },
        disruption: {
          consolidationPolicy: 'WhenEmptyOrUnderutilized',
          consolidateAfter: '1m',
          budgets: [{ nodes: '10%' }],
        },
        replicas: null,
        status: {
          nodes: 3,
          resources: { cpu: '24' },
          conditions: [{ type: 'Ready', status: 'True' }],
        },
      },
    ])
  })

  it('calculates metrics using Karpenter node labels', async () => {
    const service = new KarpenterService(
      mockKubeConfigGetter,
      mockCacheDb as never,
      () => ({ listClusterCustomObject: vi.fn() }),
      () => ({
        listNode: vi.fn().mockResolvedValue({
          items: [
            {
              metadata: {
                name: 'node-1',
                labels: {
                  'karpenter.sh/nodepool': 'default',
                },
              },
            },
            { metadata: { name: 'node-2', labels: {} } },
          ],
        }),
        listPodForAllNamespaces: vi.fn().mockResolvedValue({
          items: [
            { status: { phase: 'Pending' } },
            { status: { phase: 'Running' } },
            { status: { phase: 'Pending' } },
          ],
        }),
      }),
    )

    const metrics = await service.getMetrics('11111111-1111-1111-1111-111111111111')
    expect(metrics).toEqual({
      nodesProvisioned: 1,
      pendingPods: 2,
      estimatedHourlyCostUsd: 0.12,
    })
  })

  it('builds topology per nodepool and workload owner', async () => {
    const service = new KarpenterService(
      mockKubeConfigGetter,
      mockCacheDb as never,
      () => ({ listClusterCustomObject: vi.fn() }),
      () => ({
        listNode: vi.fn().mockResolvedValue({
          items: [
            {
              metadata: {
                name: 'ip-1',
                labels: {
                  'karpenter.sh/nodepool': 'batch-pool',
                },
              },
            },
          ],
        }),
        listPodForAllNamespaces: vi.fn().mockResolvedValue({
          items: [
            {
              metadata: {
                namespace: 'jobs',
                name: 'job-runner-1',
                ownerReferences: [{ kind: 'Job', name: 'nightly-report' }],
              },
              spec: { nodeName: 'ip-1' },
            },
            {
              metadata: {
                namespace: 'jobs',
                name: 'job-runner-2',
                ownerReferences: [{ kind: 'Job', name: 'nightly-report' }],
              },
              spec: { nodeName: 'ip-1' },
            },
          ],
        }),
      }),
    )

    const topology = await service.getTopology('11111111-1111-1111-1111-111111111111')
    expect(topology).toEqual({
      nodePools: [
        {
          nodePool: 'batch-pool',
          nodes: 1,
          workloads: [
            {
              namespace: 'jobs',
              kind: 'Job',
              name: 'nightly-report',
              replicas: 2,
            },
          ],
        },
      ],
    })
  })
})
