import { describe, expect, it } from 'vitest'
import { shouldRequireAuth } from '../lib/auth-guard.js'

describe('shouldRequireAuth', () => {
  it('does not require auth for Better Auth endpoints', () => {
    expect(shouldRequireAuth('GET', '/api/auth/get-session')).toBe(false)
    expect(shouldRequireAuth('POST', '/api/auth/sign-in/email')).toBe(false)
  })

  it('does not require auth for public health/docs endpoints', () => {
    expect(shouldRequireAuth('GET', '/health')).toBe(false)
    expect(shouldRequireAuth('GET', '/system-health')).toBe(false)
    expect(shouldRequireAuth('GET', '/docs')).toBe(false)
    expect(shouldRequireAuth('GET', '/openapi.json')).toBe(false)
  })

  it('does not require auth for explicitly public tRPC procedure', () => {
    expect(shouldRequireAuth('GET', '/trpc/sso.getProviders')).toBe(false)
    expect(shouldRequireAuth('GET', '/trpc/sso.getProviders?batch=1&input=%7B%7D')).toBe(false)
  })

  it('requires auth for protected tRPC procedures', () => {
    expect(shouldRequireAuth('GET', '/trpc/clusters.list')).toBe(true)
    expect(shouldRequireAuth('POST', '/trpc/auth.me')).toBe(true)
  })

  it('requires auth when tRPC batch includes a protected procedure', () => {
    expect(shouldRequireAuth('POST', '/trpc/sso.getProviders,clusters.list')).toBe(true)
  })

  it('does not require auth for preflight requests', () => {
    expect(shouldRequireAuth('OPTIONS', '/trpc/clusters.list')).toBe(false)
  })
})
