import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assessResults,
  checkPageSmoke,
  checkStartupHealth,
  scanLogsForErrors,
} from '../lib/health-checks.js'
import type { CheckResult } from '../lib/health-checks.js'

// ─── scanLogsForErrors ───────────────────────────────────────────────────────

describe('scanLogsForErrors', () => {
  it('returns pass for clean logs', () => {
    const result = scanLogsForErrors([
      '2026-03-27 INFO server started on port 4000',
      '2026-03-27 INFO connected to database',
      '2026-03-27 INFO ready to accept connections',
    ])
    expect(result.status).toBe('pass')
    expect(result.errorCount).toBe(0)
    expect(result.criticalMatches).toEqual([])
  })

  it('returns fail when FATAL pattern is found', () => {
    const result = scanLogsForErrors([
      '2026-03-27 INFO starting',
      '2026-03-27 FATAL unable to bind port 4000',
    ])
    expect(result.status).toBe('fail')
    expect(result.criticalMatches).toContain('FATAL')
  })

  it('returns fail when hydration pattern is found', () => {
    const result = scanLogsForErrors(['Error: hydration mismatch in component App'])
    expect(result.status).toBe('fail')
    expect(result.criticalMatches).toContain('hydration')
  })

  it('returns fail when CrashLoopBackOff pattern is found', () => {
    const result = scanLogsForErrors(['pod/api-7f8b6c-xyz CrashLoopBackOff'])
    expect(result.status).toBe('fail')
    expect(result.criticalMatches).toContain('CrashLoopBackOff')
  })

  it('returns warn when error count is between 6 and 20', () => {
    const lines = Array.from({ length: 6 }, (_, i) => `ERROR: something failed #${i}`)
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('warn')
    expect(result.errorCount).toBe(6)
  })

  it('returns fail when error count exceeds 20', () => {
    const lines = Array.from({ length: 21 }, (_, i) => `ERROR: repeated failure #${i}`)
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('fail')
    expect(result.errorCount).toBe(21)
  })

  it('ignores [WARN] and DeprecationWarning lines', () => {
    const result = scanLogsForErrors([
      '[WARN] something is deprecated',
      'DeprecationWarning: use newMethod instead',
      'ExperimentalWarning: feature X is experimental',
      'retry attempt 3 of 5',
    ])
    expect(result.status).toBe('pass')
    expect(result.errorCount).toBe(0)
    expect(result.criticalMatches).toEqual([])
  })
})

// ─── checkStartupHealth ──────────────────────────────────────────────────────

describe('checkStartupHealth', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('returns pass when health endpoint returns 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await checkStartupHealth('http://localhost:4000')
    expect(result.status).toBe('pass')
    expect(result.name).toBe('startup-health')
    expect(result.message).toContain('200')
  })

  it('returns fail when all retries are exhausted (ECONNREFUSED)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const promise = checkStartupHealth('http://localhost:4000', { retries: 1, intervalMs: 10 })

    // Advance through the retry sleep
    await vi.advanceTimersByTimeAsync(50)

    const result = await promise
    expect(result.status).toBe('fail')
    expect(result.name).toBe('startup-health')
    expect(result.message).toContain('unreachable')
    expect(globalThis.fetch).toHaveBeenCalledTimes(2) // initial + 1 retry
  })
})

// ─── checkPageSmoke ──────────────────────────────────────────────────────────

describe('checkPageSmoke', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns pass when all pages return 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await checkPageSmoke('http://localhost:3000', ['/', '/clusters', '/alerts'])
    expect(result.status).toBe('pass')
    expect(result.pages).toHaveLength(3)
    expect(result.pages.every((p) => p.status === 200)).toBe(true)
  })

  it('returns fail when one page returns 500', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 })

    const result = await checkPageSmoke('http://localhost:3000', ['/', '/broken', '/alerts'])
    expect(result.status).toBe('fail')
    expect(result.pages[1].status).toBe(500)
    expect(result.pages[1].error).toBe('HTTP 500')
  })
})

// ─── assessResults ───────────────────────────────────────────────────────────

describe('assessResults', () => {
  it('returns pass with exitCode 0 when all checks pass', () => {
    const results: CheckResult[] = [
      { name: 'health', status: 'pass', message: 'ok' },
      { name: 'smoke', status: 'pass', message: 'ok' },
    ]
    const overall = assessResults(results)
    expect(overall.status).toBe('pass')
    expect(overall.exitCode).toBe(0)
    expect(overall.summary).toContain('2 passed')
  })

  it('returns warn with exitCode 1 when one check warns', () => {
    const results: CheckResult[] = [
      { name: 'health', status: 'pass', message: 'ok' },
      { name: 'logs', status: 'warn', message: '8 errors found' },
    ]
    const overall = assessResults(results)
    expect(overall.status).toBe('warn')
    expect(overall.exitCode).toBe(1)
    expect(overall.summary).toContain('1 warned')
  })

  it('returns fail with exitCode 2 when one check fails', () => {
    const results: CheckResult[] = [
      { name: 'health', status: 'pass', message: 'ok' },
      { name: 'logs', status: 'fail', message: 'critical errors' },
    ]
    const overall = assessResults(results)
    expect(overall.status).toBe('fail')
    expect(overall.exitCode).toBe(2)
    expect(overall.summary).toContain('1 failed')
  })
})
