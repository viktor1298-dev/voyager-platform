import { createClient } from 'redis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

let client: ReturnType<typeof createClient> | null = null

export async function getRedisClient() {
  if (!client) {
    client = createClient({
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 100, 5000),
      },
    })
    client.on('error', (err) => {
      console.warn('Redis error:', err)
    })
    await client.connect().catch(() => {
      client = null
    })
  }
  return client
}

/** In-flight promise map — deduplicates concurrent cache misses for the same key */
const inflight = new Map<string, Promise<unknown>>()

export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const redis = await getRedisClient()
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit) return JSON.parse(hit)
    } catch {}
  }

  // Singleflight: if another caller is already computing this key, reuse its promise
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fn()
    .then(async (result) => {
      if (redis) {
        try {
          await redis.setEx(key, ttl, JSON.stringify(result))
        } catch {}
      }
      return result
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

export async function invalidateKey(key: string): Promise<void> {
  const redis = await getRedisClient()
  if (!redis) return
  try {
    await redis.del(key)
  } catch {}
}

export async function closeRedis(): Promise<void> {
  try {
    await client?.quit()
  } catch {
    // ignore
  }
}

export async function invalidateK8sCache(): Promise<number> {
  const redis = await getRedisClient()
  if (!redis) return 0
  try {
    let deleted = 0
    let cursor = '0'
    do {
      const result = await redis.scan(cursor, { MATCH: 'k8s:*', COUNT: 100 })
      cursor = result.cursor
      if (result.keys.length > 0) {
        deleted += await redis.del(result.keys)
      }
    } while (cursor !== '0')
    return deleted
  } catch {
    return 0
  }
}
