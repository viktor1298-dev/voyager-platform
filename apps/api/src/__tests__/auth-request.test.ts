import { describe, expect, it } from 'vitest'
import { resolveExternalRequestOrigin, resolveExternalRequestUrl } from '../lib/auth-request.js'

describe('resolveExternalRequestOrigin', () => {
  it('prefers forwarded proto + host only when proxy metadata is trusted', () => {
    const origin = resolveExternalRequestOrigin({
      headers: {
        host: 'voyager-api.voyager.svc.cluster.local',
        'x-forwarded-host': 'voyager-platform.voyagerlabs.co',
        'x-forwarded-proto': 'https',
      },
      trustedProtocol: 'http',
      trustedHost: 'voyager-api.voyager.svc.cluster.local',
      trustForwardedHeaders: true,
    })

    expect(origin).toBe('https://voyager-platform.voyagerlabs.co')
  })

  it('uses trusted request metadata when forwarded headers are not trusted', () => {
    const origin = resolveExternalRequestOrigin({
      headers: {
        host: 'localhost:4000',
        'x-forwarded-host': 'attacker.example',
        'x-forwarded-proto': 'https',
      },
      trustedProtocol: 'http',
      trustedHost: 'localhost:4000',
      trustForwardedHeaders: false,
    })

    expect(origin).toBe('http://localhost:4000')
  })

  it('falls back safely when forwarded proto/host are malformed or empty', () => {
    const origin = resolveExternalRequestOrigin({
      headers: {
        host: 'localhost:4000',
        'x-forwarded-host': ' , bad host',
        'x-forwarded-proto': 'javascript',
      },
      trustedProtocol: 'http',
      trustedHost: 'localhost:4000',
      trustForwardedHeaders: true,
    })

    expect(origin).toBe('http://localhost:4000')
  })

  it('uses first forwarded value from proxy chain when trusted', () => {
    const origin = resolveExternalRequestOrigin({
      headers: {
        'x-forwarded-host': 'voyager-platform.voyagerlabs.co, internal-gateway',
        'x-forwarded-proto': 'https, http',
      },
      trustForwardedHeaders: true,
    })

    expect(origin).toBe('https://voyager-platform.voyagerlabs.co')
  })

  it('rejects malformed forwarded host and falls back to trusted host', () => {
    const origin = resolveExternalRequestOrigin({
      headers: {
        host: 'localhost:4000',
        'x-forwarded-host': 'evil.com/path',
        'x-forwarded-proto': 'https',
      },
      trustedProtocol: 'https',
      trustedHost: 'voyager-platform.voyagerlabs.co',
      trustForwardedHeaders: true,
    })

    expect(origin).toBe('https://voyager-platform.voyagerlabs.co')
  })
})

describe('resolveExternalRequestUrl', () => {
  it('builds a full URL for auth routes using trusted external origin', () => {
    const url = resolveExternalRequestUrl('/api/auth/sign-in/email', {
      headers: {
        host: 'voyager-api.voyager.svc.cluster.local',
        'x-forwarded-host': 'voyager-platform.voyagerlabs.co',
        'x-forwarded-proto': 'https',
      },
      trustedProtocol: 'http',
      trustedHost: 'voyager-api.voyager.svc.cluster.local',
      trustForwardedHeaders: true,
    })

    expect(url.toString()).toBe('https://voyager-platform.voyagerlabs.co/api/auth/sign-in/email')
  })

  it('never throws on invalid host/proto input and falls back to defaults', () => {
    const url = resolveExternalRequestUrl('/api/auth/get-session', {
      headers: {
        host: 'bad host value',
        'x-forwarded-host': 'bad host value',
        'x-forwarded-proto': 'file',
      },
      trustedProtocol: 'ws',
      trustedHost: 'also bad host',
      trustForwardedHeaders: true,
    })

    expect(url.toString()).toBe('http://localhost/api/auth/get-session')
  })
})
