import type { ServerResponse } from 'node:http'

const activeConnections = new Set<ServerResponse>()

export function trackConnection(res: ServerResponse): void {
  activeConnections.add(res)
  res.on('close', () => activeConnections.delete(res))
}

export function drainConnections(): void {
  for (const res of activeConnections) {
    try {
      res.write('event: shutdown\ndata: \n\n')
      res.end()
    } catch {
      // already closed
    }
  }
  activeConnections.clear()
}

export function getActiveConnectionCount(): number {
  return activeConnections.size
}

// ── Socket-Tracked Connection Limiter ────────────────────────
// Replaces naive counter-based limiters. Tracks actual socket references
// and purges destroyed sockets before checking limits. Prevents the
// counter-leak bug where rapid EventSource reconnects exhaust the limit.

export class ConnectionLimiter {
  private sockets = new Map<string, Set<ServerResponse>>()

  constructor(
    private maxPerKey: number,
    private maxGlobal: number,
  ) {}

  private purgeStale(): void {
    for (const [key, set] of this.sockets) {
      for (const res of set) {
        if (res.destroyed || res.writableEnded) set.delete(res)
      }
      if (set.size === 0) this.sockets.delete(key)
    }
  }

  private globalCount(): number {
    let n = 0
    for (const set of this.sockets.values()) n += set.size
    return n
  }

  add(key: string, res: ServerResponse): boolean {
    this.purgeStale()
    if (this.globalCount() >= this.maxGlobal) return false
    const set = this.sockets.get(key)
    if ((set?.size ?? 0) >= this.maxPerKey) return false
    if (!set) {
      this.sockets.set(key, new Set([res]))
    } else {
      set.add(res)
    }
    return true
  }

  remove(key: string, res: ServerResponse): void {
    const set = this.sockets.get(key)
    if (set) {
      set.delete(res)
      if (set.size === 0) this.sockets.delete(key)
    }
  }

  /** Returns true if any active connections exist for the given key. */
  has(key: string): boolean {
    return this.sockets.has(key)
  }
}
