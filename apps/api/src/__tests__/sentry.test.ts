import { describe, expect, it, vi } from 'vitest'

// Test that sentry module loads and works without DSN
describe('Sentry initialization', () => {
  it('does not crash when SENTRY_DSN is not set', async () => {
    process.env.SENTRY_DSN = undefined
    // Re-import to test fresh init
    const { initSentry, captureException, flushSentry } = await import('../lib/sentry')
    expect(() => initSentry()).not.toThrow()
    expect(() => captureException(new Error('test'))).not.toThrow()
    await expect(flushSentry()).resolves.not.toThrow()
  })

  it('exports expected functions', async () => {
    const sentry = await import('../lib/sentry')
    expect(typeof sentry.initSentry).toBe('function')
    expect(typeof sentry.captureException).toBe('function')
    expect(typeof sentry.flushSentry).toBe('function')
  })
})
