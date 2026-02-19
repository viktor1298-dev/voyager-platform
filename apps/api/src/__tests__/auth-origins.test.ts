import { describe, expect, it } from 'vitest'
import { resolveTrustedOrigins } from '../lib/auth-origins.js'

describe('resolveTrustedOrigins', () => {
  it('uses localhost defaults in non-production when ALLOWED_ORIGINS is missing', () => {
    const origins = resolveTrustedOrigins({ NODE_ENV: 'development' })

    expect(origins).toEqual(['http://localhost:3000', 'http://localhost:9000'])
  })

  it('adds voyager platform origin only when explicitly enabled in non-production', () => {
    const origins = resolveTrustedOrigins({
      NODE_ENV: 'test',
      ALLOW_VOYAGER_PLATFORM_ORIGIN: 'true',
    })

    expect(origins).toContain('https://voyager-platform.voyagerlabs.co')
  })

  it('fails fast in production when ALLOWED_ORIGINS is missing', () => {
    expect(() => resolveTrustedOrigins({ NODE_ENV: 'production' })).toThrow(
      'ALLOWED_ORIGINS is required in production',
    )
  })

  it('rejects non-https origins in production', () => {
    expect(() =>
      resolveTrustedOrigins({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'http://voyager-platform.voyagerlabs.co',
      }),
    ).toThrow('must contain only HTTPS origins in production')
  })

  it('rejects localhost origins in production', () => {
    expect(() =>
      resolveTrustedOrigins({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://localhost:3000',
      }),
    ).toThrow('must not include localhost in production')
  })

  it('accepts explicit https origins in production', () => {
    const origins = resolveTrustedOrigins({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://voyager-platform.voyagerlabs.co, https://app.example.com',
    })

    expect(origins).toEqual(['https://voyager-platform.voyagerlabs.co', 'https://app.example.com'])
  })
})
