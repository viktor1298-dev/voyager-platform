# Post-Start Health Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated health checks that run after app startup (local dev) or K8s deployment, catching runtime errors before users discover them.

**Architecture:** Shared pure-function check module (`health-checks.ts`) used by two adapters: a CLI script for local dev (`scripts/health-check.ts`) and a K8s background job (`deploy-smoke-test.ts`). The K8s job listens for deployment rollout events via the existing `voyagerEmitter`, runs checks, and creates alerts.

**Tech Stack:** TypeScript, Vitest, Node.js `child_process.execFileSync` (docker compose), `fetch` (health/page probes), `@kubernetes/client-node` (pod logs/status), Drizzle ORM (alert records).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/lib/health-checks.ts` | Create | Shared pure-function check logic: log scanning, result assessment |
| `apps/api/src/__tests__/health-checks.test.ts` | Create | Unit tests for all check functions |
| `scripts/health-check.ts` | Create | CLI entry point for local dev mode |
| `apps/api/src/jobs/deploy-smoke-test.ts` | Create | K8s background job: listens for deployment events, runs checks, creates alerts |
| `apps/api/src/config/jobs.ts` | Modify | Add `DEPLOY_SMOKE_DELAY_MS` constant |
| `apps/api/src/server.ts` | Modify | Register deploy-smoke-test job start/stop |
| `package.json` (root) | Modify | Add `health:check` script |

---

### Task 1: Shared Health Check Logic — Log Scanner

**Files:**
- Create: `apps/api/src/lib/health-checks.ts`
- Create: `apps/api/src/__tests__/health-checks.test.ts`

- [ ] **Step 1: Write failing tests for `scanLogsForErrors`**

```typescript
// apps/api/src/__tests__/health-checks.test.ts
import { describe, expect, it } from 'vitest'
import { scanLogsForErrors } from '../lib/health-checks.js'

describe('scanLogsForErrors', () => {
  it('returns pass for clean logs', () => {
    const lines = [
      '[INFO] Server started on port 4000',
      '[INFO] Database connected',
      '[INFO] Redis connected',
    ]
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('pass')
    expect(result.criticalMatches).toHaveLength(0)
    expect(result.errorCount).toBe(0)
  })

  it('returns fail for critical patterns', () => {
    const lines = [
      '[INFO] Server started',
      'FATAL: Cannot connect to database',
    ]
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('fail')
    expect(result.criticalMatches.length).toBeGreaterThan(0)
    expect(result.criticalMatches[0]).toContain('FATAL')
  })

  it('returns fail for hydration errors', () => {
    const lines = [
      'Warning: Text content did not match. Server: "x" Client: "y"',
      'Error: hydration mismatch detected',
    ]
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('fail')
    expect(result.criticalMatches.some((m) => m.includes('hydration'))).toBe(true)
  })

  it('returns warn when error count exceeds 5', () => {
    const lines = Array.from({ length: 6 }, (_, i) => `ERROR: something went wrong #${i}`)
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('warn')
    expect(result.errorCount).toBe(6)
  })

  it('returns fail when error count exceeds 20', () => {
    const lines = Array.from({ length: 21 }, (_, i) => `ERROR: failure #${i}`)
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('fail')
    expect(result.errorCount).toBe(21)
  })

  it('ignores WARN and deprecation lines', () => {
    const lines = [
      '[WARN] Something is deprecated',
      'DeprecationWarning: punycode module is deprecated',
      '[WARN] Retry attempt 3',
    ]
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('pass')
    expect(result.errorCount).toBe(0)
  })

  it('detects CrashLoopBackOff as critical', () => {
    const lines = ['Back-off restarting failed container — CrashLoopBackOff']
    const result = scanLogsForErrors(lines)
    expect(result.status).toBe('fail')
    expect(result.criticalMatches[0]).toContain('CrashLoopBackOff')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api test -- src/__tests__/health-checks.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `scanLogsForErrors`**

```typescript
// apps/api/src/lib/health-checks.ts

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface LogScanResult {
  status: CheckStatus
  errorCount: number
  criticalMatches: string[]
}

const CRITICAL_PATTERNS = [
  /FATAL/i,
  /\bpanic\b/i,
  /ECONNREFUSED/,
  /Cannot read properties/,
  /hydration/i,
  /SIGTERM/,
  /ENOMEM/,
  /OOMKilled/,
  /CrashLoopBackOff/,
  /ImagePullBackOff/,
]

const ERROR_PATTERNS = [
  /\bERROR\b/,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /UnhandledPromise/,
  /\bENOENT\b/,
]

const IGNORE_PATTERNS = [
  /\[WARN\]/,
  /DeprecationWarning/,
  /ExperimentalWarning/,
  /retry/i,
]

export function scanLogsForErrors(lines: string[]): LogScanResult {
  const criticalMatches: string[] = []
  let errorCount = 0

  for (const line of lines) {
    if (IGNORE_PATTERNS.some((p) => p.test(line))) continue

    const criticalMatch = CRITICAL_PATTERNS.find((p) => p.test(line))
    if (criticalMatch) {
      criticalMatches.push(line.trim().slice(0, 200))
      continue
    }

    if (ERROR_PATTERNS.some((p) => p.test(line))) {
      errorCount++
    }
  }

  let status: CheckStatus = 'pass'
  if (criticalMatches.length > 0 || errorCount > 20) status = 'fail'
  else if (errorCount > 5) status = 'warn'

  return { status, errorCount, criticalMatches }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test -- src/__tests__/health-checks.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/health-checks.ts apps/api/src/__tests__/health-checks.test.ts
git commit -m "feat: add log error scanner for post-start health checks"
```

---

### Task 2: Health Check Logic — Startup Probe & Page Smoke

**Files:**
- Modify: `apps/api/src/lib/health-checks.ts`
- Modify: `apps/api/src/__tests__/health-checks.test.ts`

- [ ] **Step 1: Write failing tests for `checkStartupHealth` and `checkPageSmoke`**

Append to `apps/api/src/__tests__/health-checks.test.ts`:

```typescript
import { checkStartupHealth, checkPageSmoke, assessResults, type CheckResult } from '../lib/health-checks.js'

describe('checkStartupHealth', () => {
  it('returns pass for 200 response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok' }),
    })

    const result = await checkStartupHealth('http://localhost:4001')
    expect(result.status).toBe('pass')
    expect(result.message).toContain('200')

    globalThis.fetch = originalFetch
  })

  it('returns fail when server is unreachable', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkStartupHealth('http://localhost:9999', { retries: 1, intervalMs: 10 })
    expect(result.status).toBe('fail')
    expect(result.message).toContain('ECONNREFUSED')

    globalThis.fetch = originalFetch
  })
})

describe('checkPageSmoke', () => {
  it('returns pass when all pages return 200', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    const result = await checkPageSmoke('http://localhost:3000', ['/', '/clusters', '/login'])
    expect(result.status).toBe('pass')
    expect(result.pages.every((p) => p.status === 200)).toBe(true)

    globalThis.fetch = originalFetch
  })

  it('returns fail when a page returns 500', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 })

    const result = await checkPageSmoke('http://localhost:3000', ['/', '/clusters', '/login'])
    expect(result.status).toBe('fail')
    expect(result.pages.find((p) => p.path === '/clusters')?.status).toBe(500)

    globalThis.fetch = originalFetch
  })
})

describe('assessResults', () => {
  it('returns pass when all checks pass', () => {
    const results: CheckResult[] = [
      { name: 'Health', status: 'pass', message: 'OK' },
      { name: 'Logs', status: 'pass', message: 'Clean' },
    ]
    const overall = assessResults(results)
    expect(overall.status).toBe('pass')
    expect(overall.exitCode).toBe(0)
  })

  it('returns warn when any check warns', () => {
    const results: CheckResult[] = [
      { name: 'Health', status: 'pass', message: 'OK' },
      { name: 'Logs', status: 'warn', message: '6 errors' },
    ]
    const overall = assessResults(results)
    expect(overall.status).toBe('warn')
    expect(overall.exitCode).toBe(1)
  })

  it('returns fail when any check fails', () => {
    const results: CheckResult[] = [
      { name: 'Health', status: 'fail', message: 'Down' },
      { name: 'Logs', status: 'pass', message: 'Clean' },
    ]
    const overall = assessResults(results)
    expect(overall.status).toBe('fail')
    expect(overall.exitCode).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api test -- src/__tests__/health-checks.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement `checkStartupHealth`, `checkPageSmoke`, and `assessResults`**

Append to `apps/api/src/lib/health-checks.ts`:

```typescript
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

export async function checkStartupHealth(
  baseUrl: string,
  opts: { retries?: number; intervalMs?: number } = {},
): Promise<CheckResult> {
  const retries = opts.retries ?? 15
  const intervalMs = opts.intervalMs ?? 2000
  let lastError = ''

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        return { name: 'Startup health', status: 'pass', message: `${res.status} OK` }
      }
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error'
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, intervalMs))
  }

  return { name: 'Startup health', status: 'fail', message: lastError }
}

export async function checkPageSmoke(
  baseUrl: string,
  paths: string[],
): Promise<{ status: CheckStatus; pages: Array<{ path: string; status: number | null; error?: string }> }> {
  const pages: Array<{ path: string; status: number | null; error?: string }> = []
  let hasFailure = false

  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      })
      pages.push({ path, status: res.status })
      if (!res.ok) hasFailure = true
    } catch (err) {
      pages.push({ path, status: null, error: err instanceof Error ? err.message : 'Failed' })
      hasFailure = true
    }
  }

  return { status: hasFailure ? 'fail' : 'pass', pages }
}

export function assessResults(results: CheckResult[]): OverallResult {
  let status: CheckStatus = 'pass'
  const failed = results.filter((r) => r.status === 'fail')
  const warned = results.filter((r) => r.status === 'warn')

  if (failed.length > 0) status = 'fail'
  else if (warned.length > 0) status = 'warn'

  const exitCode = status === 'fail' ? 2 : status === 'warn' ? 1 : 0

  const parts: string[] = []
  if (failed.length > 0) parts.push(`${failed.length} failed`)
  if (warned.length > 0) parts.push(`${warned.length} warning${warned.length > 1 ? 's' : ''}`)
  const summary = parts.length > 0 ? parts.join(', ') : 'all checks passed'

  return { status, exitCode, results, summary }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test -- src/__tests__/health-checks.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/health-checks.ts apps/api/src/__tests__/health-checks.test.ts
git commit -m "feat: add startup health probe, page smoke, and result assessment"
```

---

### Task 3: Local Dev CLI Script

**Files:**
- Create: `scripts/health-check.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Create the CLI script**

The script uses `execFileSync` (not `exec`) for shell safety when calling `docker compose`. It inlines the log-scanning patterns (~30 lines) to avoid requiring an API build before running.

```typescript
// scripts/health-check.ts
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

type CheckStatus = 'pass' | 'warn' | 'fail'
interface CheckResult { name: string; status: CheckStatus; message: string }

// --- Inlined log scanner (avoids dependency on api build) ---
const CRITICAL_PATTERNS = [
  /FATAL/i, /\bpanic\b/i, /ECONNREFUSED/, /Cannot read properties/,
  /hydration/i, /SIGTERM/, /ENOMEM/, /OOMKilled/, /CrashLoopBackOff/,
]
const ERROR_PATTERNS = [/\bERROR\b/, /\bTypeError\b/, /\bReferenceError\b/, /UnhandledPromise/]
const IGNORE_PATTERNS = [/\[WARN\]/, /DeprecationWarning/, /ExperimentalWarning/, /retry/i]

function scanLogs(lines: string[]): { status: CheckStatus; errorCount: number; criticals: string[] } {
  const criticals: string[] = []
  let errorCount = 0
  for (const line of lines) {
    if (IGNORE_PATTERNS.some((p) => p.test(line))) continue
    if (CRITICAL_PATTERNS.find((p) => p.test(line))) { criticals.push(line.trim().slice(0, 200)); continue }
    if (ERROR_PATTERNS.some((p) => p.test(line))) errorCount++
  }
  let status: CheckStatus = 'pass'
  if (criticals.length > 0 || errorCount > 20) status = 'fail'
  else if (errorCount > 5) status = 'warn'
  return { status, errorCount, criticals }
}

// --- CLI ---
const { values } = parseArgs({
  options: {
    'api-url': { type: 'string', default: 'http://localhost:4001' },
    'web-url': { type: 'string', default: 'http://localhost:3000' },
    timeout: { type: 'string', default: '30' },
    'no-docker': { type: 'boolean', default: false },
  },
})

const API_URL = values['api-url']!
const WEB_URL = values['web-url']!
const TIMEOUT_S = Number.parseInt(values.timeout!, 10)
const SKIP_DOCKER = values['no-docker']!
const results: CheckResult[] = []

function pad(label: string): string { return label.padEnd(30, '.') }
function statusLabel(s: CheckStatus): string {
  return s === 'pass' ? 'PASS' : s === 'warn' ? 'WARN' : 'FAIL'
}

async function checkHealth(): Promise<void> {
  const retries = Math.floor(TIMEOUT_S / 2)
  let lastError = ''
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) { results.push({ name: 'Startup health', status: 'pass', message: `${res.status} OK` }); return }
      lastError = `HTTP ${res.status}`
    } catch (err) { lastError = err instanceof Error ? err.message : 'Unknown' }
    await new Promise((r) => setTimeout(r, 2000))
  }
  results.push({ name: 'Startup health', status: 'fail', message: lastError })
}

function checkDocker(): void {
  if (SKIP_DOCKER) return
  try {
    const output = execFileSync('docker', ['compose', 'ps', '--format', 'json'], {
      encoding: 'utf-8', timeout: 10000,
    })
    const services = output.trim().split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line) as { Service: string; Health: string; State: string } }
      catch { return null }
    }).filter(Boolean) as Array<{ Service: string; Health: string; State: string }>

    const unhealthy = services.filter((s) => s.State !== 'running')
    if (unhealthy.length > 0) {
      results.push({ name: 'Docker services', status: 'fail', message: unhealthy.map((s) => `${s.Service}: ${s.State}`).join(', ') })
    } else {
      results.push({ name: 'Docker services', status: 'pass', message: services.map((s) => `${s.Service}: ${s.State}`).join(', ') })
    }
  } catch {
    results.push({ name: 'Docker services', status: 'warn', message: 'docker compose not available' })
  }
}

function checkDockerLogs(service: string): void {
  if (SKIP_DOCKER) return
  try {
    const output = execFileSync('docker', ['compose', 'logs', '--tail', '50', service], {
      encoding: 'utf-8', timeout: 10000,
    })
    const scan = scanLogs(output.split('\n'))
    const msg = scan.criticals.length > 0
      ? `${scan.criticals.length} critical: "${scan.criticals[0]}"`
      : `${scan.errorCount} errors`
    results.push({ name: `Log scan (${service})`, status: scan.status, message: msg })
  } catch {
    results.push({ name: `Log scan (${service})`, status: 'warn', message: 'could not read logs' })
  }
}

async function checkPages(): Promise<void> {
  for (const path of ['/', '/clusters', '/login']) {
    try {
      const res = await fetch(`${WEB_URL}${path}`, { signal: AbortSignal.timeout(10000), redirect: 'follow' })
      results.push({ name: `Page smoke: ${path}`, status: res.ok ? 'pass' : 'fail', message: `${res.status}` })
    } catch (err) {
      results.push({ name: `Page smoke: ${path}`, status: 'fail', message: err instanceof Error ? err.message : 'Failed' })
    }
  }
}

async function main(): Promise<void> {
  console.log('\nHealth Check Results')
  console.log('='.repeat(55))

  await checkHealth()
  checkDocker()
  checkDockerLogs('postgres')
  checkDockerLogs('redis')
  await checkPages()

  console.log()
  for (const r of results) console.log(`  ${pad(r.name)} ${statusLabel(r.status)}  (${r.message})`)

  const failed = results.filter((r) => r.status === 'fail')
  const warned = results.filter((r) => r.status === 'warn')
  console.log()

  if (failed.length > 0) { console.log(`Result: FAIL (${failed.length} failed)`); process.exit(2) }
  else if (warned.length > 0) { console.log(`Result: WARN (${warned.length} warning${warned.length > 1 ? 's' : ''})`); process.exit(1) }
  else { console.log('Result: PASS — all checks passed'); process.exit(0) }
}

main().catch((err) => { console.error('Health check script failed:', err); process.exit(2) })
```

- [ ] **Step 2: Add `health:check` to root package.json**

Add to root `package.json` scripts:
```json
"health:check": "tsx scripts/health-check.ts"
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Test manually (with dev servers running)**

Run: `pnpm health:check --no-docker`
Expected: Terminal output showing check results

- [ ] **Step 5: Commit**

```bash
git add scripts/health-check.ts package.json
git commit -m "feat: add pnpm health:check CLI for local dev health verification"
```

---

### Task 4: K8s Deploy Smoke Test Job

**Files:**
- Create: `apps/api/src/jobs/deploy-smoke-test.ts`
- Modify: `apps/api/src/config/jobs.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Add job interval constant**

In `apps/api/src/config/jobs.ts`, add:
```typescript
DEPLOY_SMOKE_DELAY_MS: 30 * 1000, // Wait 30s after rollout before checking
```

- [ ] **Step 2: Create the deploy smoke test job**

```typescript
// apps/api/src/jobs/deploy-smoke-test.ts
import * as k8s from '@kubernetes/client-node'
import { db, alerts, alertHistory } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { scanLogsForErrors, type CheckStatus } from '../lib/health-checks.js'
import { JOB_INTERVALS } from '../config/jobs.js'

interface DeploymentEvent {
  type: 'added' | 'modified' | 'deleted'
  clusterId: string
  data: k8s.V1Deployment
}

// Track seen generations to avoid re-checking the same rollout
const seenGenerations = new Map<string, number>()

async function runSmokeTest(clusterId: string, deployment: k8s.V1Deployment): Promise<void> {
  const depName = deployment.metadata?.name ?? 'unknown'
  const namespace = deployment.metadata?.namespace ?? 'default'
  const generation = deployment.metadata?.generation ?? 0
  const key = `${clusterId}/${namespace}/${depName}`

  if (seenGenerations.get(key) === generation) return
  seenGenerations.set(key, generation)

  console.log(`[deploy-smoke] new rollout detected: ${depName} in ${namespace} (gen ${generation})`)

  // Wait for rollout to stabilize
  await new Promise((r) => setTimeout(r, JOB_INTERVALS.DEPLOY_SMOKE_DELAY_MS))

  const checks: Array<{ name: string; status: CheckStatus; message: string }> = []

  try {
    const kc = await clusterClientPool.getClient(clusterId)
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    // Check 1: Pod status
    const podsRes = await coreApi.listNamespacedPod({ namespace, labelSelector: `app=${depName}` })
    const pods = podsRes.items

    const badPods = pods.filter((p) => {
      const containerStatuses = p.status?.containerStatuses ?? []
      return containerStatuses.some((cs) => {
        const waiting = cs.state?.waiting?.reason ?? ''
        return ['CrashLoopBackOff', 'OOMKilled', 'ImagePullBackOff', 'Error'].includes(waiting)
      })
    })

    if (badPods.length > 0) {
      const reasons = badPods.map((p) =>
        p.status?.containerStatuses?.map((cs) => cs.state?.waiting?.reason).filter(Boolean).join(','),
      )
      checks.push({ name: 'Pod status', status: 'fail', message: `${badPods.length} unhealthy: ${reasons.join('; ')}` })
    } else {
      checks.push({ name: 'Pod status', status: 'pass', message: `${pods.length} pods healthy` })
    }

    // Check 2: Restart count
    const maxRestarts = Math.max(0, ...pods.flatMap((p) =>
      (p.status?.containerStatuses ?? []).map((cs) => cs.restartCount ?? 0),
    ))
    const restarted = pods.filter((p) =>
      (p.status?.containerStatuses ?? []).some((cs) => (cs.restartCount ?? 0) > 0),
    )

    if (maxRestarts > 3) {
      checks.push({ name: 'Restart count', status: 'fail', message: `${maxRestarts} restarts (max)` })
    } else if (restarted.length > 0) {
      checks.push({ name: 'Restart count', status: 'warn', message: `${restarted.length} pods restarted` })
    } else {
      checks.push({ name: 'Restart count', status: 'pass', message: '0 restarts' })
    }

    // Check 3: Log scan (first pod, last 100 lines)
    if (pods.length > 0) {
      const podName = pods[0].metadata?.name ?? ''
      try {
        const logRes = await coreApi.readNamespacedPodLog({ name: podName, namespace, tailLines: 100 })
        const logLines = (typeof logRes === 'string' ? logRes : '').split('\n')
        const scan = scanLogsForErrors(logLines)
        const msg = scan.criticalMatches.length > 0
          ? `${scan.criticalMatches.length} critical errors`
          : `${scan.errorCount} errors`
        checks.push({ name: 'Log scan', status: scan.status, message: msg })
      } catch {
        checks.push({ name: 'Log scan', status: 'warn', message: 'could not read pod logs' })
      }
    }

    // Check 4: Readiness
    const notReady = pods.filter((p) => {
      const conditions = p.status?.conditions ?? []
      return !conditions.some((c) => c.type === 'Ready' && c.status === 'True')
    })
    if (notReady.length > 0) {
      checks.push({ name: 'Readiness', status: 'fail', message: `${notReady.length}/${pods.length} not ready` })
    } else {
      checks.push({ name: 'Readiness', status: 'pass', message: `${pods.length}/${pods.length} ready` })
    }
  } catch (err) {
    checks.push({
      name: 'Connection',
      status: 'fail',
      message: err instanceof Error ? err.message : 'Failed to connect',
    })
  }

  // Assess overall result
  const hasFail = checks.some((c) => c.status === 'fail')
  const hasWarn = checks.some((c) => c.status === 'warn')
  const severity = hasFail ? 'critical' : hasWarn ? 'warning' : 'info'

  if (severity !== 'info') {
    const alertName = `Deploy smoke test: ${depName}`
    let [alertRule] = await db.select().from(alerts).where(eq(alerts.name, alertName)).limit(1)

    if (!alertRule) {
      ;[alertRule] = await db.insert(alerts).values({
        name: alertName,
        metric: 'restarts',
        operator: 'gt',
        threshold: '0',
        clusterFilter: clusterId,
        enabled: true,
      }).returning()
    }

    await db.insert(alertHistory).values({
      alertId: alertRule.id,
      value: String(checks.filter((c) => c.status === 'fail').length),
      message: `Deploy smoke test ${severity}: ${depName} in ${namespace} — ${checks.filter((c) => c.status !== 'pass').map((c) => `${c.name}: ${c.message}`).join('; ')}`,
    })

    console.warn(`[deploy-smoke] ${severity.toUpperCase()}: ${depName} — ${checks.filter((c) => c.status !== 'pass').map((c) => c.name).join(', ')}`)
  } else {
    console.log(`[deploy-smoke] PASS: ${depName} in ${namespace} — all checks passed`)
  }

  voyagerEmitter.emit('alert', {
    type: 'deploy_smoke_test',
    severity,
    clusterId,
    deployment: depName,
    namespace,
    checks,
  })
}

let listening = false

export function startDeploySmokeTest(): void {
  if (listening) return
  listening = true

  voyagerEmitter.on('deployment-event', (event: DeploymentEvent) => {
    if (event.type !== 'modified') return
    const dep = event.data
    const generation = dep.metadata?.generation ?? 0
    const observedGeneration = dep.status?.observedGeneration ?? 0
    if (generation > observedGeneration) {
      void runSmokeTest(event.clusterId, dep)
    }
  })

  console.log('[deploy-smoke] listening for deployment rollouts')
}

export function stopDeploySmokeTest(): void {
  listening = false
  voyagerEmitter.removeAllListeners('deployment-event')
}
```

- [ ] **Step 3: Register in server.ts**

In `apps/api/src/server.ts`:
- Add import: `import { startDeploySmokeTest, stopDeploySmokeTest } from './jobs/deploy-smoke-test.js'`
- In the `if (k8sEnabled)` startup block: add `startDeploySmokeTest()`
- In the graceful shutdown: add `stopDeploySmokeTest()`
- Update the log message to include the new job

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/deploy-smoke-test.ts apps/api/src/config/jobs.ts apps/api/src/server.ts
git commit -m "feat: add deploy smoke test K8s job with rollout detection and alerting"
```

---

### Task 5: Typecheck, Build, Final Verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: ALL PASS

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: ALL PASS

- [ ] **Step 4: Final commit if any fixes needed**
