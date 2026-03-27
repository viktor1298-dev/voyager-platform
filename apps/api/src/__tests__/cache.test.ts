import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn()
const mockSetEx = vi.fn()
const mockDel = vi.fn()
const mockScan = vi.fn()

vi.mock('redis', () => ({
  createClient: () => ({
    get: mockGet,
    setEx: mockSetEx,
    del: mockDel,
    scan: mockScan,
    on: vi.fn(),
    connect: () => Promise.resolve(),
  }),
}))

import { cached, invalidateK8sCache } from '../lib/cache.js'

describe('cached()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached value on cache hit', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ data: 'cached' }))
    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
    const result = await cached('test-key', 60, fn)
    expect(result).toEqual({ data: 'cached' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('calls fn and caches result on cache miss', async () => {
    mockGet.mockResolvedValue(null)
    mockSetEx.mockResolvedValue('OK')
    const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
    const result = await cached('test-key', 60, fn)
    expect(result).toEqual({ data: 'fresh' })
    expect(fn).toHaveBeenCalledOnce()
    expect(mockSetEx).toHaveBeenCalledWith('test-key', 60, JSON.stringify({ data: 'fresh' }))
  })

  it('calls fn when redis.get throws', async () => {
    mockGet.mockRejectedValue(new Error('Redis error'))
    mockSetEx.mockResolvedValue('OK')
    const fn = vi.fn().mockResolvedValue({ data: 'fallback' })
    const result = await cached('test-key', 60, fn)
    expect(result).toEqual({ data: 'fallback' })
    expect(fn).toHaveBeenCalledOnce()
  })
})

describe('invalidateK8sCache()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes all k8s cache keys via SCAN', async () => {
    mockScan.mockResolvedValue({
      cursor: '0',
      keys: ['k8s:abc:nodes', 'k8s:abc:pods', 'k8s:abc:events'],
    })
    mockDel.mockResolvedValue(3)
    const count = await invalidateK8sCache()
    expect(count).toBe(3)
    expect(mockScan).toHaveBeenCalledWith('0', { MATCH: 'k8s:*', COUNT: 100 })
    expect(mockDel).toHaveBeenCalledWith(['k8s:abc:nodes', 'k8s:abc:pods', 'k8s:abc:events'])
  })

  it('returns 0 when scan throws', async () => {
    mockScan.mockRejectedValue(new Error('Redis down'))
    const count = await invalidateK8sCache()
    expect(count).toBe(0)
  })
})

describe('graceful degradation', () => {
  it('cached() works when redis ops fail', async () => {
    mockGet.mockRejectedValue(new Error('no connection'))
    mockSetEx.mockRejectedValue(new Error('no connection'))
    const fn = vi.fn().mockResolvedValue({ data: 'no-redis' })
    const result = await cached('key', 30, fn)
    expect(result).toEqual({ data: 'no-redis' })
    expect(fn).toHaveBeenCalledOnce()
  })
})
