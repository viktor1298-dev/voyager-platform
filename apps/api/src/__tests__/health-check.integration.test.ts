import type * as k8s from '@kubernetes/client-node'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock cluster-client-pool
const mockGetClient = vi.fn()
vi.mock('../lib/cluster-client-pool.js', () => ({
  clusterClientPool: { getClient: (...args: unknown[]) => mockGetClient(...args) },
}))

const VALID_CLUSTER_ID = '00000000-0000-0000-0000-000000000001'
const INVALID_CLUSTER_ID = '00000000-0000-0000-0000-000000000002'

function createMockKubeConfig(opts: { healthy?: boolean; throwError?: boolean } = {}) {
  const mockCoreApi = {
    listNode: vi.fn(),
    listPodForAllNamespaces: vi.fn(),
  }

  if (opts.throwError) {
    mockCoreApi.listNode.mockRejectedValue(new Error('Connection refused: invalid credentials'))
    mockCoreApi.listPodForAllNamespaces.mockRejectedValue(new Error('Connection refused'))
  } else {
    mockCoreApi.listNode.mockResolvedValue({
      items: [
        {
          status: {
            conditions: [{ type: 'Ready', status: opts.healthy !== false ? 'True' : 'False' }],
          },
        },
      ],
    })
    mockCoreApi.listPodForAllNamespaces.mockResolvedValue({
      items: [{ status: { phase: 'Running' } }, { status: { phase: 'Running' } }],
    })
  }

  const mockKc = {
    makeApiClient: vi.fn().mockReturnValue(mockCoreApi),
  }

  return mockKc as unknown as k8s.KubeConfig
}

describe('health.check integration', () => {
  let performK8sHealthCheck: typeof import('../routers/health.js')['performK8sHealthCheck']

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../routers/health.js')
    performK8sHealthCheck = mod.performK8sHealthCheck
  })

  it('returns healthy status for a cluster with all nodes ready', async () => {
    const mockKc = createMockKubeConfig({ healthy: true })
    mockGetClient.mockResolvedValue(mockKc)

    const result = await performK8sHealthCheck(VALID_CLUSTER_ID)

    expect(mockGetClient).toHaveBeenCalledWith(VALID_CLUSTER_ID)
    expect(result.status).toBe('healthy')
    expect(result.status).not.toBe('unknown')
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
    expect(result.details).toMatchObject({
      totalNodes: 1,
      readyNodes: 1,
      totalPods: 2,
      runningPods: 2,
      podHealthRatio: 100,
    })
  })

  it('returns critical status with error details for invalid/expired credentials', async () => {
    mockGetClient.mockRejectedValue(new Error('Connection refused: invalid credentials'))

    const result = await performK8sHealthCheck(INVALID_CLUSTER_ID)

    expect(result.status).toBe('critical')
    expect(result.details.error).toContain('invalid credentials')
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('responseTimeMs > 0 for successful health checks', async () => {
    const mockKc = createMockKubeConfig({ healthy: true })
    mockGetClient.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return mockKc
    })

    const result = await performK8sHealthCheck(VALID_CLUSTER_ID)

    expect(result.responseTimeMs).toBeGreaterThan(0)
    expect(result.status).toBe('healthy')
  })
})
