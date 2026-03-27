# Post-Start Health Verification

Automated health checks that run after app startup (local dev) or deployment (K8s), catching runtime errors, startup failures, and log-level problems before users discover them.

## Problem

Recurring issue (4th occurrence): new app versions deploy with runtime errors (hydration, crashes, missing dependencies) that pass typecheck and build but fail at runtime. No automated system catches these — they're discovered manually.

## Design

One check system, two modes: local dev and K8s deploy.

### Trigger

| Mode | Trigger |
|------|---------|
| **Local** | `pnpm health:check` script (manual or auto 15s after `pnpm dev`) |
| **K8s** | Deployment rollout detected by cluster-watch-manager (generation change) |

### Checks (shared logic)

All checks live in a shared module so both modes use identical logic:

1. **Startup health** — `GET /health`, verify 200 with dependencies OK (DB, Redis). Retry up to 30s with 2s interval.

2. **Log error scan** — Tail recent logs (50 lines API, 50 lines web), match patterns:
   - Critical (any match = FAIL): `FATAL`, `panic`, `ECONNREFUSED`, `Cannot read properties`, `hydration`, `SIGTERM`, `ENOMEM`, `OOMKilled`, `CrashLoopBackOff`
   - Error (>5 = WARN, >20 = FAIL): `ERROR`, `TypeError`, `ReferenceError`, `UnhandledPromise`, `ENOENT`
   - Ignore: `[WARN]`, deprecation notices, expected retry messages

3. **Process stability** — Check the process/pod is still running after 10s. Any restart or crash within first 30s = FAIL.

4. **Key page smoke** — HTTP GET to `/`, `/clusters`, `/login`. Verify 200 status code (catches SSR crashes, missing pages, auth redirect loops).

5. **Docker health** (local only) — `docker compose ps --format json`, verify Postgres and Redis show "healthy" status.

6. **Pod status** (K8s only) — Check new pods for: CrashLoopBackOff, OOMKilled, ImagePullBackOff, Error states. Any = CRITICAL.

7. **Restart count** (K8s only) — Pods restarted within 3 minutes of rollout = WARNING. More than 3 restarts = CRITICAL.

### Log Sources

| Mode | API logs | Web logs | Infra logs |
|------|----------|----------|------------|
| **Local** | API process stdout (captured by tsx watch) | Next.js dev server stdout | `docker compose logs --tail 50 postgres redis` |
| **K8s** | `readNamespacedPodLog(api-pod)` via K8s API | `readNamespacedPodLog(web-pod)` | N/A (managed services) |

### Output

**Local mode** — Terminal report:

```
Health Check Results (15s post-start)
=====================================
  Startup health ............. PASS  (200 OK, DB connected, Redis connected)
  Docker services ............ PASS  (postgres: healthy, redis: healthy)
  Log scan (API) ............. PASS  (0 errors, 0 critical)
  Log scan (Web) ............. WARN  (3 errors: "TypeError: Cannot read...")
  Process stability .......... PASS  (running 15s, 0 restarts)
  Page smoke: / .............. PASS  (200)
  Page smoke: /clusters ...... PASS  (200)
  Page smoke: /login ......... PASS  (200)

Result: WARN (1 warning) — review log scan findings above
```

Exit code: 0 = pass, 1 = warn, 2 = fail.

**K8s mode** — Alert record in DB:

```json
{
  "type": "deploy_smoke_test",
  "severity": "critical|warning|info",
  "clusterId": "...",
  "metadata": {
    "deployment": "voyager-api",
    "namespace": "voyager",
    "previousRevision": "3",
    "newRevision": "4",
    "checks": { ... },
    "failedChecks": ["log_scan", "pod_status"]
  }
}
```

Plus SSE event emitted for real-time dashboard notification.

### Architecture

```
scripts/health-check.ts          — CLI entry point for local mode
apps/api/src/jobs/
  deploy-smoke-test.ts           — K8s mode entry point (background job)
apps/api/src/lib/
  health-checks.ts               — Shared check logic (pure functions)
    ├── checkStartupHealth(baseUrl)
    ├── scanLogsForErrors(lines[])
    ├── checkPageSmoke(baseUrl, paths[])
    └── assessResults(checkResults[]) → { status, summary }
```

The shared `health-checks.ts` module takes log lines and URLs as input — it doesn't know where they came from (docker, k8s, or stdin). Each mode provides the adapter.

### K8s Integration

The deploy smoke test hooks into the existing watch infrastructure:

1. `cluster-watch-manager` already emits events for Deployment changes
2. New listener in `deploy-smoke-test.ts` filters for `generation` changes (new revision)
3. Waits for rollout completion: polls `deployment.status.conditions` for `Available=True` or 5-minute timeout
4. Runs checks via K8s API (pod logs, pod status, service endpoint)
5. Creates alert via existing `alerts` table insert
6. Emits SSE event via `voyagerEmitter`

### New Alert Type

Add `deploy_smoke_test` to the alert types. Severity mapping:
- Any CRITICAL check → `critical` alert
- Any WARNING check (no criticals) → `warning` alert
- All pass → `info` alert (optional, can be disabled)

### Package Script

```json
{
  "health:check": "tsx scripts/health-check.ts"
}
```

Accepts flags:
- `--api-url` (default: `http://localhost:4001`)
- `--web-url` (default: `http://localhost:3000`)
- `--timeout` (default: 30s)
- `--no-docker` (skip docker checks)

## What This Does NOT Do

- No automatic rollback (manual decision)
- No before/after metric comparison (future enhancement)
- No custom check configuration per deployment (YAGNI)
- No Slack/email notification (use existing alert webhook system)
- No performance benchmarks (just health/error checks)

## Implementation Order

1. `health-checks.ts` — shared check logic with tests
2. `scripts/health-check.ts` — local CLI tool
3. `deploy-smoke-test.ts` — K8s background job
4. Alert type + SSE integration
