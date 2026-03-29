import http from 'node:http'
import { NextRequest } from 'next/server'

const API_URL = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://voyager-api:4000')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const clusterId = req.nextUrl.searchParams.get('clusterId')
  if (!clusterId) return new Response('Missing clusterId', { status: 400 })

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const proxyReq = http.get(
    {
      hostname: API_URL.hostname,
      port: API_URL.port,
      path: `/api/resources/stream?clusterId=${encodeURIComponent(clusterId)}`,
      headers: { cookie: req.headers.get('cookie') ?? '' },
    },
    (proxyRes) => {
      if (proxyRes.statusCode !== 200) {
        writer.write(encoder.encode(`event: error\ndata: ${proxyRes.statusCode}\n\n`))
        writer.close()
        return
      }
      proxyRes.on('data', (chunk: Buffer) => {
        writer.write(chunk).catch(() => proxyRes.destroy())
      })
      proxyRes.on('end', () => {
        writer.close().catch(() => {})
      })
      proxyRes.on('error', () => {
        writer.close().catch(() => {})
      })
    },
  )

  proxyReq.on('error', () => {
    writer.close().catch(() => {})
  })
  req.signal.addEventListener('abort', () => {
    proxyReq.destroy()
  })

  return new Response(readable, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
