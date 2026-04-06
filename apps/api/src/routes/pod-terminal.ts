import { PassThrough } from 'node:stream'
import { Exec } from '@kubernetes/client-node'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { auth } from '../lib/auth.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'

const querySchema = z.object({
  clusterId: z.string().uuid(),
  namespace: z.string().min(1),
  podName: z.string().min(1),
  container: z.string().min(1),
})

const SHELLS = ['/bin/bash', '/bin/sh', '/bin/ash'] as const

export async function registerPodTerminalRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/pod-terminal', { websocket: true }, async (socket, request) => {
    // 1. Authenticate
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.append(key, String(value))
    }
    const sessionResult = await auth.api.getSession({ headers }).catch(() => null)
    if (!sessionResult?.session || !sessionResult.user) {
      socket.close(1008, 'Unauthorized')
      return
    }

    // 2. Parse and validate query params
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      socket.close(1008, 'Invalid parameters')
      return
    }
    const { clusterId, namespace, podName, container } = parsed.data

    // 3. Get KubeConfig for cluster
    let kc
    try {
      kc = await clusterClientPool.getClient(clusterId)
    } catch {
      socket.close(1008, 'Cluster not found or unreachable')
      return
    }

    // 4. Create PassThrough streams for stdin/stdout/stderr bridging
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const stdin = new PassThrough()

    // 5. Forward stdout/stderr to WebSocket
    stdout.on('data', (data: Buffer) => {
      if (socket.readyState === 1) socket.send(data)
    })
    stdout.on('error', (err) => {
      app.log.error({ err }, 'terminal stream error')
    })
    stderr.on('data', (data: Buffer) => {
      if (socket.readyState === 1) socket.send(data)
    })
    stderr.on('error', (err) => {
      app.log.error({ err }, 'terminal stream error')
    })

    // 6. Forward WebSocket messages to stdin
    stdin.on('error', (err) => {
      app.log.error({ err }, 'stdin write error')
    })
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      stdin.write(buf)
    })

    // 7. Attempt shells in order using K8s Exec API (not child_process)
    let k8sWs: { close: () => void; readyState: number } | null = null
    let connected = false

    for (const shell of SHELLS) {
      try {
        const k8sExec = new Exec(kc)
        k8sWs = await k8sExec.exec(
          namespace,
          podName,
          container,
          [shell],
          stdout,
          stderr,
          stdin,
          true, // tty
          (status) => {
            if (socket.readyState === 1) {
              // WebSocket close reason must be ≤123 bytes (RFC 6455 §5.5)
              const reason = JSON.stringify(status).slice(0, 123)
              socket.close(1000, reason)
            }
          },
        )
        connected = true
        app.log.info(
          `[pod-terminal] Connected to ${namespace}/${podName}/${container} with ${shell}`,
        )
        break
      } catch (err) {
        app.log.debug(
          `[pod-terminal] Shell ${shell} failed for ${namespace}/${podName}/${container}: ${err}`,
        )
        continue
      }
    }

    if (!connected) {
      socket.close(1008, 'No shell available in container')
      stdin.end()
      return
    }

    // 8. Cleanup on disconnect
    socket.on('close', () => {
      stdin.end()
      stdout.destroy()
      stderr.destroy()
      if (k8sWs && k8sWs.readyState <= 1) {
        try {
          k8sWs.close()
        } catch {
          // ignore close errors
        }
      }
    })

    socket.on('error', (err: Error) => {
      app.log.error({ err }, 'Pod terminal WebSocket error')
    })
  })
}
