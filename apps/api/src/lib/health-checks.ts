export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface LogScanResult {
  status: CheckStatus
  errorCount: number
  criticalMatches: string[]
}

export interface CheckResult {
  name: string
  status: CheckStatus
  message: string
}

export interface OverallResult {
  status: CheckStatus
  exitCode: number
  results: CheckResult[]
  summary: string
}

const CRITICAL_PATTERNS = [
  'FATAL',
  'panic',
  'ECONNREFUSED',
  'Cannot read properties',
  'hydration',
  'SIGTERM',
  'ENOMEM',
  'OOMKilled',
  'CrashLoopBackOff',
  'ImagePullBackOff',
]

const ERROR_PATTERNS = ['ERROR', 'TypeError', 'ReferenceError', 'UnhandledPromise', 'ENOENT']

const IGNORE_PATTERNS = ['[WARN]', 'DeprecationWarning', 'ExperimentalWarning', 'retry']

function shouldIgnoreLine(line: string): boolean {
  return IGNORE_PATTERNS.some((p) => line.includes(p))
}

export function scanLogsForErrors(lines: string[]): LogScanResult {
  const criticalMatches: string[] = []
  let errorCount = 0

  for (const line of lines) {
    if (shouldIgnoreLine(line)) continue

    for (const pattern of CRITICAL_PATTERNS) {
      if (line.includes(pattern)) {
        criticalMatches.push(pattern)
        break
      }
    }

    for (const pattern of ERROR_PATTERNS) {
      if (line.includes(pattern)) {
        errorCount++
        break
      }
    }
  }

  if (criticalMatches.length > 0) {
    return { status: 'fail', errorCount, criticalMatches }
  }
  if (errorCount > 20) {
    return { status: 'fail', errorCount, criticalMatches }
  }
  if (errorCount > 5) {
    return { status: 'warn', errorCount, criticalMatches }
  }
  return { status: 'pass', errorCount, criticalMatches }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function checkStartupHealth(
  baseUrl: string,
  opts?: { retries?: number; intervalMs?: number },
): Promise<CheckResult> {
  const retries = opts?.retries ?? 5
  const intervalMs = opts?.intervalMs ?? 2000

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/health`)
      if (res.ok) {
        return {
          name: 'startup-health',
          status: 'pass',
          message: `Health endpoint returned ${res.status}`,
        }
      }
    } catch {
      // connection refused or network error — retry
    }
    if (attempt < retries) {
      await sleep(intervalMs)
    }
  }

  return {
    name: 'startup-health',
    status: 'fail',
    message: `Health endpoint unreachable after ${retries + 1} attempts`,
  }
}

export async function checkPageSmoke(
  baseUrl: string,
  paths: string[],
): Promise<{
  status: CheckStatus
  pages: Array<{ path: string; status: number | null; error?: string }>
}> {
  const pages: Array<{ path: string; status: number | null; error?: string }> = []

  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl}${path}`)
      pages.push({ path, status: res.status, ...(res.ok ? {} : { error: `HTTP ${res.status}` }) })
    } catch (err) {
      pages.push({
        path,
        status: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const hasFail = pages.some((p) => p.status === null || (p.status !== null && p.status >= 500))
  const hasWarn = pages.some((p) => p.status !== null && p.status >= 400 && p.status < 500)

  const status: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass'
  return { status, pages }
}

export function assessResults(results: CheckResult[]): OverallResult {
  const hasFail = results.some((r) => r.status === 'fail')
  const hasWarn = results.some((r) => r.status === 'warn')

  const status: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass'
  const exitCode = hasFail ? 2 : hasWarn ? 1 : 0

  const passed = results.filter((r) => r.status === 'pass').length
  const warned = results.filter((r) => r.status === 'warn').length
  const failed = results.filter((r) => r.status === 'fail').length
  const summary = `${results.length} checks: ${passed} passed, ${warned} warned, ${failed} failed`

  return { status, exitCode, results, summary }
}
