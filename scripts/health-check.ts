#!/usr/bin/env tsx
/**
 * Local dev environment health check CLI.
 *
 * Usage:
 *   pnpm health:check
 *   tsx scripts/health-check.ts --api-url http://localhost:4001 --timeout 30
 *
 * Exit codes: 0=pass, 1=warn, 2=fail
 */

import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const { values: flags } = parseArgs({
  options: {
    'api-url': { type: 'string', default: 'http://localhost:4001' },
    'web-url': { type: 'string', default: 'http://localhost:3000' },
    timeout: { type: 'string', default: '30' },
    'no-docker': { type: 'boolean', default: false },
  },
  strict: true,
})

const API_URL = flags['api-url']!
const WEB_URL = flags['web-url']!
const TIMEOUT_SEC = Number(flags.timeout)
const SKIP_DOCKER = flags['no-docker'] ?? false

// ---------------------------------------------------------------------------
// Log-scan error patterns (inlined to avoid importing from apps/api)
// ---------------------------------------------------------------------------

const POSTGRES_ERROR_PATTERNS: RegExp[] = [
  /FATAL:/i,
  /PANIC:/i,
  /could not connect/i,
  /password authentication failed/i,
  /role ".*" does not exist/i,
  /database ".*" does not exist/i,
  /permission denied/i,
  /out of memory/i,
  /data directory .* has wrong ownership/i,
  /could not open file/i,
  /server stopped/i,
  /shutdown/i,
  /aborting/i,
  /corrupt/i,
  /invalid page/i,
]

const REDIS_ERROR_PATTERNS: RegExp[] = [
  /# oops/i,
  /FATAL/i,
  /Can't open the append-only file/i,
  /Out of memory/i,
  /Background saving error/i,
  /MISCONF/i,
  /maxmemory/i,
  /permission denied/i,
  /Can't handle RDB format/i,
  /Bad file format/i,
  /Server started/i,
  /Connection refused/i,
  /# WARNING/,
  /overcommit_memory/i,
  /Transparent Huge Pages/i,
]

const ERROR_PATTERNS_BY_SERVICE: Record<string, RegExp[]> = {
  postgres: POSTGRES_ERROR_PATTERNS,
  redis: REDIS_ERROR_PATTERNS,
}

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------

type Status = 'PASS' | 'WARN' | 'FAIL'

interface CheckResult {
  name: string
  status: Status
  detail: string
}

const results: CheckResult[] = []

function record(name: string, status: Status, detail: string) {
  results.push({ name, status, detail })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

// ---------------------------------------------------------------------------
// Check: Startup health (retry loop)
// ---------------------------------------------------------------------------

async function checkStartupHealth() {
  const maxRetries = Math.max(1, Math.floor(TIMEOUT_SEC / 2))
  const intervalMs = 2000

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(`${API_URL}/health`, 5000)
      if (res.ok) {
        record('Startup health', 'PASS', `${res.status} OK`)
        return
      }
      if (attempt === maxRetries) {
        record('Startup health', 'FAIL', `${res.status} ${res.statusText}`)
        return
      }
    } catch {
      if (attempt === maxRetries) {
        record('Startup health', 'FAIL', 'API unreachable')
        return
      }
    }
    await sleep(intervalMs)
  }
}

// ---------------------------------------------------------------------------
// Check: Docker services
// ---------------------------------------------------------------------------

interface DockerService {
  Name?: string
  Service?: string
  State?: string
  Status?: string
}

function checkDockerServices() {
  try {
    const raw = execFileSync('docker', ['compose', 'ps', '--format', 'json'], {
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim()

    if (!raw) {
      record('Docker services', 'FAIL', 'no services found')
      return
    }

    // docker compose ps --format json emits one JSON object per line
    const services: DockerService[] = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    const statuses: string[] = []
    let allRunning = true

    for (const svc of services) {
      const name = svc.Service || svc.Name || 'unknown'
      const state = (svc.State || '').toLowerCase()
      statuses.push(`${name}: ${state}`)
      if (state !== 'running') allRunning = false
    }

    if (services.length === 0) {
      record('Docker services', 'FAIL', 'no services found')
    } else if (allRunning) {
      record('Docker services', 'PASS', statuses.join(', '))
    } else {
      record('Docker services', 'FAIL', statuses.join(', '))
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    record('Docker services', 'FAIL', `docker compose error: ${msg.split('\n')[0]}`)
  }
}

// ---------------------------------------------------------------------------
// Check: Docker log scan
// ---------------------------------------------------------------------------

function checkDockerLogs(service: string) {
  const patterns = ERROR_PATTERNS_BY_SERVICE[service]
  if (!patterns) {
    record(`Log scan (${service})`, 'WARN', 'no patterns defined')
    return
  }

  try {
    const logs = execFileSync('docker', ['compose', 'logs', '--tail', '50', service], {
      encoding: 'utf-8',
      timeout: 10_000,
    })

    const lines = logs.split('\n')
    const errors: string[] = []

    for (const line of lines) {
      for (const pat of patterns) {
        if (pat.test(line)) {
          errors.push(line.trim().slice(0, 120))
          break
        }
      }
    }

    if (errors.length === 0) {
      record(`Log scan (${service})`, 'PASS', '0 errors')
    } else {
      record(`Log scan (${service})`, 'WARN', `${errors.length} pattern match(es)`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    record(`Log scan (${service})`, 'FAIL', `docker logs error: ${msg.split('\n')[0]}`)
  }
}

// ---------------------------------------------------------------------------
// Check: Page smoke
// ---------------------------------------------------------------------------

async function checkPageSmoke(path: string) {
  const label = `Page smoke: ${path}`
  try {
    const res = await fetchWithTimeout(`${WEB_URL}${path}`, 10_000)
    if (res.ok) {
      record(label, 'PASS', `${res.status}`)
    } else {
      record(label, 'FAIL', `${res.status} ${res.statusText}`)
    }
  } catch {
    record(label, 'FAIL', 'unreachable')
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

async function main() {
  // 1. Startup health
  await checkStartupHealth()

  // 2 & 3. Docker (if not skipped)
  if (!SKIP_DOCKER) {
    checkDockerServices()
    checkDockerLogs('postgres')
    checkDockerLogs('redis')
  }

  // 4. Page smoke
  await checkPageSmoke('/')
  await checkPageSmoke('/clusters')
  await checkPageSmoke('/login')

  // --- Print results ---
  console.log()
  console.log('Health Check Results')
  console.log('=======================================================')
  console.log()

  let worstStatus: Status = 'PASS'

  for (const r of results) {
    const tag = r.status === 'PASS' ? 'PASS' : r.status === 'WARN' ? 'WARN' : 'FAIL'
    const dots = '.'.repeat(Math.max(1, 40 - r.name.length))
    console.log(`  ${r.name}${dots}${tag}  (${r.detail})`)
    if (r.status === 'FAIL') worstStatus = 'FAIL'
    else if (r.status === 'WARN' && worstStatus !== 'FAIL') worstStatus = 'WARN'
  }

  console.log()

  if (worstStatus === 'PASS') {
    console.log('Result: PASS -- all checks passed')
  } else if (worstStatus === 'WARN') {
    console.log('Result: WARN -- some checks had warnings')
  } else {
    console.log('Result: FAIL -- one or more checks failed')
  }

  console.log()

  // Exit code: 0=pass, 1=warn, 2=fail
  if (worstStatus === 'FAIL') process.exit(2)
  if (worstStatus === 'WARN') process.exit(1)
  process.exit(0)
}

main()
