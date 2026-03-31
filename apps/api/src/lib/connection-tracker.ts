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
