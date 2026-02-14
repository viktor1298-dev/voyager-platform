import { createClient } from 'redis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

let client: ReturnType<typeof createClient> | null = null

export async function getRedisClient() {
  if (!client) {
    client = createClient({ url: REDIS_URL })
    client.on('error', (err) => { console.warn('Redis error:', err); client = null })
    await client.connect().catch(() => {
      client = null
    })
  }
  return client
}

export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const redis = await getRedisClient()
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit) return JSON.parse(hit)
    } catch {}
  }
  const result = await fn()
  if (redis) {
    try {
      await redis.setEx(key, ttl, JSON.stringify(result))
    } catch {}
  }
  return result
}

export async function invalidateK8sCache(): Promise<number> {
  const redis = await getRedisClient()
  if (!redis) return 0
  try {
    const knownKeys = ['k8s:version', 'k8s:nodes', 'k8s:pods', 'k8s:namespaces', 'k8s:events', 'k8s:deployments']
    let deleted = 0
    for (const key of knownKeys) {
      deleted += await redis.del(key)
    }
    return deleted
  } catch {
    return 0
  }
}
