# Stability & Performance Roadmap

**Generated:** 2026-03-31
**Sources:** API Resilience Audit, Frontend Performance Audit, Infrastructure Audit, Database & Caching Audit
**Total Issues:** 113 (17 Critical, 26 High, 51 Medium, 29 Low/Info)

---

## Executive Summary

Four automated audits identified 113 issues across backend, frontend, infrastructure, and database layers. The codebase is architecturally sound with good patterns (SSE backoff, generation-based stale protection, non-fatal Redis, batch event flushing), but has critical gaps in cache TTLs, shutdown handling, database optimization, and test coverage.

### Top 5 Most Impactful Issues

| # | Issue | Impact | Source |
|---|-------|--------|--------|
| 1 | **Cache TTL bug** -- 6 routers pass milliseconds as seconds to `cached()`, caching data for 4-17 hours instead of 15-60 seconds | Every user sees stale Helm, CRD, RBAC, Topology, YAML data | API + DB reports |
| 2 | **TimescaleDB hypertables never created** -- `time_bucket()` works but no partitioning, compression, or retention | Unbounded table growth, no auto-cleanup, degrading query performance | DB report |
| 3 | **N+1 queries in watch-db-writer** -- individual SELECT+INSERT per node and per event during sync | 200-1000 DB calls per sync cycle per cluster, bottleneck under load | DB report |
| 4 | **No SSE connection draining on shutdown** -- active SSE/WS connections killed without cleanup during rolling deploys | Connection leaks, stale counters, client reconnect storms | API report |
| 5 | **Zero unit tests for 43 tRPC routers** -- core business logic, live data pipeline, and credential encryption untested | Regressions undetectable, security-critical code unverified | Infra report |

---

## Phase 1: Critical Fixes (Immediate)

All issues that could cause data corruption, crashes, stale data, or security vulnerabilities. Fix before next deploy.

### Crash Prevention

- [ ] **[CRITICAL] Fix cache TTL in `helm.ts`** -- Effort: **S**
  - **Files:** `apps/api/src/routers/helm.ts` lines 113, 167-168, 233, 291
  - **Fix:** Change all `30_000` to `30` in `cached()` calls. The function passes TTL to `redis.setEx()` which expects seconds, not milliseconds.
  - **Verify:** After fix, `redis-cli TTL k8s:helm:*` returns ~30, not ~30000.
  - **Refs:** API-ISSUE-13, DB-3.1

- [ ] **[CRITICAL] Fix cache TTL in `topology.ts`** -- Effort: **S**
  - **Files:** `apps/api/src/routers/topology.ts` line 93
  - **Fix:** Change `15_000` to `15`.
  - **Verify:** Same as above with topology cache keys.
  - **Refs:** API-ISSUE-14, DB-3.1

- [ ] **[CRITICAL] Fix cache TTL in `crds.ts`** -- Effort: **S**
  - **Files:** `apps/api/src/routers/crds.ts` lines 59, 96
  - **Fix:** Change `30_000` to `30` and `15_000` to `15`.
  - **Refs:** API-ISSUE-15, DB-3.1

- [ ] **[CRITICAL] Fix cache TTL in `rbac.ts`** -- Effort: **S**
  - **Files:** `apps/api/src/routers/rbac.ts` lines 103, 191
  - **Fix:** Change `60_000` to `60`.
  - **Refs:** API-ISSUE-16, DB-3.1

- [ ] **[CRITICAL] Fix cache TTL in `yaml.ts`** -- Effort: **S**
  - **Files:** `apps/api/src/routers/yaml.ts` line 100
  - **Fix:** Change `15_000` to `15`.
  - **Refs:** API-ISSUE-17, DB-3.1

- [ ] **[CRITICAL] Drain SSE/WS connections on shutdown** -- Effort: **M**
  - **Files:** `apps/api/src/server.ts` lines 299-320, `apps/api/src/routes/resource-stream.ts`, `apps/api/src/routes/metrics-stream.ts`, `apps/api/src/routes/log-stream.ts`, `apps/api/src/routes/ai-stream.ts`, `apps/api/src/routes/pod-terminal.ts`
  - **Fix:** Track active SSE connections in a `Set<ServerResponse>`. On shutdown, send `event: shutdown\n\n` to each, then `reply.raw.end()`. Track active WebSockets in a separate `Set<WebSocket>` and close with code 1012 (Service Restart).
  - **Verify:** During a rolling deploy, browser reconnects cleanly without error toasts. `globalConnections` counter resets to 0.
  - **Refs:** API-ISSUE-20

- [ ] **[CRITICAL] Add `seenGenerations` TTL eviction** -- Effort: **S**
  - **Files:** `apps/api/src/jobs/deploy-smoke-test.ts` line 21
  - **Fix:** After adding an entry to `seenGenerations`, schedule `setTimeout(() => seenGenerations.delete(key), 5 * 60_000)`. Alternatively use a bounded LRU Map with max 1000 entries.
  - **Verify:** After 10 minutes of runtime, `seenGenerations.size` stays bounded (not monotonically increasing).
  - **Refs:** API-ISSUE-08

### Data Integrity

- [ ] **[CRITICAL] Create TimescaleDB hypertables** -- Effort: **M**
  - **Files:** `charts/voyager/sql/init.sql` (end of file)
  - **Fix:** Add after table creation:
    ```sql
    SELECT create_hypertable('metrics_history', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE);
    SELECT create_hypertable('node_metrics_history', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE);
    SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE, migrate_data => TRUE);
    SELECT add_retention_policy('metrics_history', INTERVAL '30 days', if_not_exists => TRUE);
    SELECT add_retention_policy('node_metrics_history', INTERVAL '14 days', if_not_exists => TRUE);
    SELECT add_retention_policy('events', INTERVAL '7 days', if_not_exists => TRUE);
    ```
  - **Verify:** `SELECT * FROM timescaledb_information.hypertables;` returns 3 rows. `SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';` returns 3 rows.
  - **Refs:** DB-1.1

- [ ] **[CRITICAL] Fix Helm chart DB image -- use TimescaleDB** -- Effort: **S**
  - **Files:** `charts/voyager/values.yaml` (db image section)
  - **Fix:** Change `postgres:17-alpine` to `timescale/timescaledb:latest-pg17` (or a pinned version like `2.17.0-pg17`). The init.sql requires TimescaleDB extensions which are not available in vanilla postgres.
  - **Verify:** `helm template charts/voyager | grep 'image:' | grep timescale`. After deploy, `SELECT default_version FROM pg_available_extensions WHERE name = 'timescaledb';` returns a version.
  - **Refs:** INFRA-31
  - **Depends on:** None, but coordinate with hypertable creation above.

- [ ] **[CRITICAL] Configure PostgreSQL connection pool** -- Effort: **S**
  - **Files:** `packages/db/src/client.ts` lines 8-10
  - **Fix:** Replace `new pg.Pool({ connectionString })` with:
    ```typescript
    new pg.Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      allowExitOnIdle: true,
    })
    ```
    Add `pool.on('error', (err) => console.error('[pg-pool] Unexpected error on idle client', err))`.
  - **Verify:** Under load, `SELECT count(*) FROM pg_stat_activity WHERE usename = 'voyager';` stays at or below 20.
  - **Refs:** DB-4.1

- [ ] **[CRITICAL] Batch upsert nodes in watch-db-writer** -- Effort: **M**
  - **Files:** `apps/api/src/lib/watch-db-writer.ts` lines 54-111, `charts/voyager/sql/init.sql` (nodes table)
  - **Fix:** (1) Add `UNIQUE (cluster_id, name)` constraint to `nodes` table in init.sql. (2) Replace the per-node SELECT+INSERT loop with a single `db.insert(nodes).values(nodeValues).onConflictDoUpdate({ target: [nodes.clusterId, nodes.name], set: { ... } })`.
  - **Verify:** For a 100-node cluster, the sync generates 1 SQL statement instead of 200. Check with `log_min_duration_statement = 0` in Postgres.
  - **Depends on:** Unique constraint must be added first (init.sql change).
  - **Refs:** DB-2.1, DB-5.1

- [ ] **[CRITICAL] Batch insert events in watch-db-writer** -- Effort: **M**
  - **Files:** `apps/api/src/lib/watch-db-writer.ts` lines 122-161
  - **Fix:** Replace per-event SELECT+INSERT loop with `db.insert(events).values(eventValues).onConflictDoNothing()`. The events table PK already prevents duplicates.
  - **Verify:** For 500 events, generates 1 SQL statement instead of 1000.
  - **Refs:** DB-2.2

### Security

- [ ] **[CRITICAL] Reject all-zeros encryption key on startup** -- Effort: **S** (depends on: none)
  - **Files:** `apps/api/src/server.ts` (startup validation section), `.env.example`
  - **Fix:** (1) In server.ts, after the existing encryption key validation, add: `if (key === '0'.repeat(64)) throw new Error('CLUSTER_CRED_ENCRYPTION_KEY must not be all zeros')`. (2) In `.env.example`, replace the all-zeros key with `<generate-with-openssl-rand-hex-32>`.
  - **Verify:** Starting the API with all-zeros key exits with error. `.env.example` no longer contains a valid hex key.
  - **Refs:** INFRA-47

---

## Phase 2: High Priority (Week 1)

Issues affecting stability, performance, and security hardening. Should be fixed within the first week.

### API Stability

- [ ] **[HIGH] Add forced shutdown timeout** -- Effort: **S**
  - **Files:** `apps/api/src/server.ts` lines 299-320
  - **Fix:** Add at the start of the shutdown handler:
    ```typescript
    const forceExitTimer = setTimeout(() => {
      console.error('[shutdown] Force exit after 25s timeout')
      process.exit(1)
    }, 25_000)
    forceExitTimer.unref()
    ```
  - **Verify:** If Sentry flush hangs, process still exits within 25s (not stuck).
  - **Refs:** API-ISSUE-21

- [ ] **[HIGH] Fix AI stream error handling** -- Effort: **S**
  - **Files:** `apps/api/src/routes/ai-stream.ts` lines 91-96
  - **Fix:** Wrap both `reply.raw.write()` calls in `writeEvent` with try/catch, matching the pattern in `resource-stream.ts` lines 103-106.
  - **Verify:** Kill a client mid-AI-stream; server logs a warning but no uncaught exception.
  - **Refs:** API-ISSUE-01

- [ ] **[HIGH] Add `request.raw.on('close')` to AI stream** -- Effort: **S**
  - **Files:** `apps/api/src/routes/ai-stream.ts` lines 67-141
  - **Fix:** Add `request.raw.on('close', () => { clearInterval(heartbeat); /* abort AI stream if possible */ })` after heartbeat setup, matching pattern in `resource-stream.ts:195`.
  - **Verify:** Disconnect mid-AI-stream; heartbeat interval is cleared immediately, not after stream resolves.
  - **Depends on:** Pairs with AI stream write fix above.
  - **Refs:** API-ISSUE-02

- [ ] **[HIGH] Increase EventEmitter maxListeners** -- Effort: **S**
  - **Files:** `apps/api/src/lib/event-emitter.ts` line 64
  - **Fix:** Change `setMaxListeners(100)` to `setMaxListeners(200)`. Calculation: (50 resource * 2) + (50 metrics * 1) + (20 clusters * 1 db-writer) + presence + deploy = ~170.
  - **Verify:** No `MaxListenersExceededWarning` in server logs under full load.
  - **Refs:** API-ISSUE-10

- [ ] **[HIGH] Add `maxOutputLength` to Helm gunzipSync** -- Effort: **S**
  - **Files:** `apps/api/src/routers/helm.ts` lines 47-58
  - **Fix:** Change `gunzipSync(compressed)` to `gunzipSync(compressed, { maxOutputLength: 50 * 1024 * 1024 })`.
  - **Verify:** Corrupted Helm secret data triggers a caught error instead of OOM.
  - **Refs:** API-ISSUE-18

- [ ] **[HIGH] Stop presence sweep timer on shutdown** -- Effort: **S**
  - **Files:** `apps/api/src/lib/presence.ts` lines 82-84, `apps/api/src/server.ts` (shutdown handler)
  - **Fix:** Export `stopPresenceSweep()` from `presence.ts` that calls `clearInterval(sweepTimer)`. Call it in the shutdown handler.
  - **Verify:** After shutdown signal, sweep timer stops firing (check with log statement).
  - **Refs:** API-ISSUE-09

- [ ] **[HIGH] Close PostgreSQL pool on shutdown** -- Effort: **S**
  - **Files:** `packages/db/src/client.ts`, `apps/api/src/server.ts` lines 299-320
  - **Fix:** Export `closeDatabase()` from `@voyager/db` that calls `await pool.end()`. Call it in shutdown handler after stopping all jobs but before `app.close()`.
  - **Verify:** After shutdown, `pg_stat_activity` shows 0 connections from voyager.
  - **Depends on:** Pool configuration from Phase 1.
  - **Refs:** API-ISSUE-22, DB-4.2

- [ ] **[HIGH] Close Redis client on shutdown** -- Effort: **S**
  - **Files:** `apps/api/src/lib/cache.ts`, `apps/api/src/server.ts`
  - **Fix:** Export `closeRedis()` from `cache.ts` that calls `await client?.quit()`. Call it in the shutdown handler.
  - **Verify:** After shutdown, Redis `CLIENT LIST` shows no connections from API.
  - **Refs:** API-ISSUE-23, DB-4.3

### Frontend Performance

- [ ] **[HIGH/CRITICAL] Fix 1-second re-render storm in useClusterResources** -- Effort: **M**
  - **Files:** `apps/web/src/hooks/useResources.ts` line 24
  - **Fix:** Remove the per-hook `setInterval(() => setTick(t => t + 1), 1_000)`. Instead, subscribe to the global `useResourceStore(s => s.tick)` selector (the global tick already runs at 5s in the cluster layout via `useResourceTick()`). Memoize resource data separately with `useCallback`.
  - **Verify:** In React DevTools Profiler, cluster detail page shows ~5x fewer renders. No visible jank on a 200-pod cluster.
  - **Refs:** FE-P-01

- [ ] **[HIGH] Fix DashboardGrid ResizeObserver memory leak** -- Effort: **S**
  - **Files:** `apps/web/src/components/dashboard/DashboardGrid.tsx` lines 77-85
  - **Fix:** Callback ref return values are silently ignored by React. Use a `useRef<ResizeObserver | null>(null)` pattern: disconnect previous observer in the `!node` branch, create new observer in the `node` branch.
  - **Verify:** Mount/unmount dashboard 10 times; Chrome DevTools Performance Monitor shows no growth in Observers count.
  - **Refs:** FE-M-01

- [ ] **[HIGH] Add ErrorBoundary to cluster layout children** -- Effort: **S**
  - **Files:** `apps/web/src/app/clusters/[id]/layout.tsx`
  - **Fix:** Wrap `{children}` with `<ErrorBoundary fallback={<div className="p-8 text-center">Tab failed to render. <button onClick={() => window.location.reload()}>Reload</button></div>}>`.
  - **Verify:** Throw an error in any cluster tab component; only that tab shows fallback, sidebar and tabs remain interactive.
  - **Refs:** FE-E-01

- [ ] **[HIGH] Cap LogViewer sseLines array** -- Effort: **S**
  - **Files:** `apps/web/src/components/logs/LogViewer.tsx` line 113
  - **Fix:** Change `setSseLines(prev => [...prev, line])` to:
    ```tsx
    setSseLines(prev => {
      const next = [...prev, line]
      return next.length > 10_000 ? next.slice(-10_000) : next
    })
    ```
  - **Verify:** Follow a verbose pod for 5 minutes; array length plateaus at 10,000.
  - **Refs:** FE-P-05

- [ ] **[HIGH] Lazy-load react-diff-viewer-continued** -- Effort: **S**
  - **Files:** `apps/web/src/components/resource/ResourceDiff.tsx` line 7, `apps/web/src/components/helm/HelmRevisionDiff.tsx` line 7
  - **Fix:** Replace `import ReactDiffViewer from 'react-diff-viewer-continued'` with `const ReactDiffViewer = dynamic(() => import('react-diff-viewer-continued'), { ssr: false })`.
  - **Verify:** `next build` shows diff-viewer in a separate chunk, not in shared/page bundles.
  - **Refs:** FE-P-03, FE-B-01

- [ ] **[HIGH] Replace 5s topology polling with SSE-derived data or longer interval** -- Effort: **M**
  - **Files:** `apps/web/src/components/topology/TopologyMap.tsx` line 68, `apps/web/src/components/network/NetworkPolicyGraph.tsx` line 108
  - **Fix:** Increase `refetchInterval` from `5000` to `30_000` (30 seconds). Add a manual refresh button. If server-side graph building is not needed, derive from `useClusterResources` instead.
  - **Verify:** Network tab shows topology requests every 30s, not every 5s. Dagre layout recalculations drop from 12/min to 2/min.
  - **Refs:** FE-P-02

### Database Optimization

- [ ] **[HIGH] Add cache stampede protection (singleflight)** -- Effort: **M**
  - **Files:** `apps/api/src/lib/cache.ts` lines 21-36
  - **Fix:** Add an `inflight` Map that deduplicates concurrent calls to the same cache key. When a cache miss occurs, check `inflight.get(key)` before calling `fn()`. Set `inflight.set(key, promise)` and clean up in `.finally()`.
  - **Verify:** Fire 50 concurrent requests for the same uncached resource; K8s API receives only 1 call (check via request logs or Prometheus counter).
  - **Refs:** DB-3.2

- [ ] **[HIGH] Fix Redis client error handling** -- Effort: **S**
  - **Files:** `apps/api/src/lib/cache.ts` lines 10-12
  - **Fix:** Remove `client = null` from the error handler. Instead, configure the Redis client with `socket.reconnectStrategy: (retries) => Math.min(retries * 100, 5000)`. Let the client's built-in reconnection handle transient errors.
  - **Verify:** Kill Redis briefly; API logs reconnection attempts but continues working (falls back to no-cache). No connection churn in Redis `CLIENT LIST`.
  - **Refs:** DB-3.3

- [ ] **[HIGH] Add data retention cleanup** -- Effort: **M**
  - **Files:** `apps/api/src/jobs/` (new file: `data-retention.ts`), `apps/api/src/server.ts` (register job)
  - **Fix:** Create a background job that runs daily and deletes old rows:
    - `health_history` older than 30 days
    - `audit_log` older than 90 days
    - `alert_history` older than 30 days
    - `webhook_deliveries` older than 30 days
  - **Verify:** After job runs, `SELECT count(*) FROM audit_log WHERE timestamp < NOW() - INTERVAL '90 days'` returns 0.
  - **Depends on:** For `metrics_history`, `node_metrics_history`, `events` -- use TimescaleDB retention policies from Phase 1 instead.
  - **Refs:** DB-1.5

- [ ] **[HIGH] Fix N+1 in webhooks list** -- Effort: **M**
  - **Files:** `apps/api/src/routers/webhooks.ts` lines 51-69
  - **Fix:** Replace the per-webhook delivery query loop with a single JOIN query or use `Promise.all()` with the existing queries. Prefer the JOIN approach for fewer round-trips.
  - **Verify:** Webhooks list endpoint makes 1 SQL query instead of N+1 (check with `log_min_duration_statement`).
  - **Refs:** DB-2.3

- [ ] **[HIGH] Push health bucketing to SQL** -- Effort: **M**
  - **Files:** `apps/api/src/routers/metrics.ts` lines 147-149, 193-199, 278-282
  - **Fix:** Replace the JS-side aggregation with a SQL query using `time_bucket()`:
    ```sql
    SELECT time_bucket('1 hour', checked_at) AS bucket, cluster_id,
           count(*) FILTER (WHERE status = 'healthy') AS healthy,
           count(*) FILTER (WHERE status = 'degraded') AS degraded
    FROM health_history WHERE checked_at >= $1 GROUP BY 1, 2 ORDER BY 1
    ```
  - **Verify:** For a 7-day range, the endpoint returns in <100ms instead of loading 20K+ rows into Node.js.
  - **Refs:** DB-2.4

- [ ] **[HIGH] Add UNIQUE constraint on nodes(cluster_id, name)** -- Effort: **S**
  - **Files:** `charts/voyager/sql/init.sql` (nodes table section)
  - **Fix:** Add `ALTER TABLE nodes ADD CONSTRAINT nodes_cluster_name_unique UNIQUE (cluster_id, name);` or change the existing index to `CREATE UNIQUE INDEX`.
  - **Verify:** `\d nodes` in psql shows unique constraint. Duplicate node inserts raise conflict errors.
  - **Note:** Required by the batch upsert fix in Phase 1.
  - **Refs:** DB-5.1

### Security Hardening

- [ ] **[HIGH] Reject insecure defaults in production** -- Effort: **S**
  - **Files:** `apps/api/src/server.ts` (startup section)
  - **Fix:** Add production-mode checks:
    ```typescript
    if (process.env.NODE_ENV === 'production') {
      if (process.env.JWT_SECRET === 'change-me-in-production') throw new Error('...')
      if (process.env.ADMIN_PASSWORD === 'admin123') throw new Error('...')
      if (!isEncryptionEnabled) throw new Error('CLUSTER_CRED_ENCRYPTION_KEY required in production')
    }
    ```
  - **Verify:** Starting with default `.env.example` values and `NODE_ENV=production` fails immediately.
  - **Refs:** INFRA-48, DB-5.2

- [ ] **[HIGH] Remove duplicate root dependencies** -- Effort: **S**
  - **Files:** `package.json` (root)
  - **Fix:** Remove `@aws-crypto/sha256-js`, `@aws-sdk/client-sts`, `@aws-sdk/util-format-url`, `@azure/arm-containerservice`, `@azure/identity`, `@google-cloud/container`, `@smithy/protocol-http`, `@smithy/signature-v4` from root package.json. They are already in `apps/api/package.json`.
  - **Verify:** `pnpm install` succeeds. `pnpm --filter api build` succeeds. Root `node_modules` is smaller.
  - **Refs:** INFRA-7

- [ ] **[HIGH] Fix Helm values.yaml plaintext passwords** -- Effort: **S**
  - **Files:** `charts/voyager/values.yaml`, `charts/voyager/values-production.yaml`
  - **Fix:** (1) In the secret template, use `required` function: `{{ required "DATABASE_URL must be set" .Values.config.databaseUrl }}`. Add a check that rejects URLs containing `changeme`. (2) Remove plaintext passwords from committed values files; use `values-local.yaml` (gitignored) for dev.
  - **Verify:** `helm template charts/voyager -f values-production.yaml` fails if password is `changeme`.
  - **Refs:** INFRA-33, INFRA-34

- [ ] **[HIGH] Remove `POSTGRES_HOST_AUTH_METHOD: trust` from docker-compose** -- Effort: **S**
  - **Files:** `docker-compose.yml`
  - **Fix:** Remove `POSTGRES_HOST_AUTH_METHOD: trust`. The `POSTGRES_PASSWORD` env var already enables `md5` auth by default.
  - **Verify:** `docker compose down -v && docker compose up -d` -- connecting without password fails. `.env` DATABASE_URL with correct password works.
  - **Refs:** INFRA-28

- [ ] **[HIGH] Deduplicate `env.NODE_ENV` in values.yaml** -- Effort: **S**
  - **Files:** `charts/voyager/values.yaml` (lines 3-4 and 35-36)
  - **Fix:** Remove the duplicate `env` block. Keep one at the top level.
  - **Verify:** `yq '.env.NODE_ENV' charts/voyager/values.yaml` returns exactly one value.
  - **Refs:** INFRA-32

---

## Phase 3: Medium Priority (Week 2-3)

Code quality, best practices, and non-critical improvements.

### Testing

- [ ] **[HIGH] Add unit tests for tRPC routers** -- Effort: **L**
  - **Files:** `apps/api/src/__tests__/` (new files)
  - **Fix:** Add vitest tests for critical routers using mocked K8s client. Priority order: `clusters`, `metrics.history`, `helm`, `pods`, `deployments`.
  - **Verify:** `pnpm --filter api test` runs at least 5 new router test files. Coverage for routers goes from 0% to >50%.
  - **Refs:** INFRA-14

- [ ] **[HIGH] Add unit tests for watch-manager and resource-mappers** -- Effort: **L**
  - **Files:** `apps/api/src/__tests__/` (new files)
  - **Fix:** Test resource mapper pure functions (easy, high value). Test watch-manager lifecycle (subscribe, error, teardown, generation checks) with mocked informers.
  - **Verify:** `pnpm --filter api test` covers watch lifecycle and all 17 resource type mappers.
  - **Refs:** INFRA-15

- [ ] **[HIGH] Add unit tests for credential-crypto** -- Effort: **S**
  - **Files:** `apps/api/src/__tests__/credential-crypto.test.ts` (new)
  - **Fix:** Test: encrypt/decrypt round-trip, invalid key rejection, tampered ciphertext detection, format validation.
  - **Verify:** `pnpm --filter api test -- credential-crypto` passes all cases.
  - **Refs:** INFRA-16

- [ ] **[MEDIUM] Add vitest config for web app** -- Effort: **S**
  - **Files:** `apps/web/vitest.config.ts` (new)
  - **Fix:** Create vitest config with `environment: 'jsdom'`, path alias support, and setup file.
  - **Verify:** `pnpm --filter web test` runs successfully.
  - **Refs:** INFRA-18

- [ ] **[MEDIUM] Add unit tests for frontend pure functions** -- Effort: **M**
  - **Files:** `apps/web/src/lib/__tests__/` (new files)
  - **Fix:** Test: `formatters.ts`, `lttb.ts`, `metrics-buffer.ts`. These are pure functions, easily testable.
  - **Verify:** `pnpm --filter web test` passes with coverage for utility functions.
  - **Refs:** INFRA-17

### Error Handling

- [ ] **[MEDIUM] Add `reply.raw.end()` to MCP SSE close handler** -- Effort: **S**
  - **Files:** `apps/api/src/routes/mcp.ts` lines 153-174
  - **Fix:** Add `try { reply.raw.end() } catch { /* already ended */ }` in the `request.raw.on('close')` handler.
  - **Refs:** API-ISSUE-03

- [ ] **[MEDIUM] Add try/catch to `deployments.list` for missing clusters** -- Effort: **S**
  - **Files:** `apps/api/src/routers/deployments.ts` lines 148-216
  - **Fix:** Wrap in try/catch with `handleK8sError` or return empty array when no clusters exist.
  - **Refs:** API-ISSUE-04

- [ ] **[MEDIUM] Add try/catch to `logs.get` K8s API call** -- Effort: **S**
  - **Files:** `apps/api/src/routers/logs.ts` lines 361-390
  - **Fix:** Wrap the `coreApi.readNamespacedPodLog()` call in try/catch using `handleK8sError(error, 'get pod logs')`.
  - **Refs:** API-ISSUE-05

- [ ] **[MEDIUM] Add error handlers to pod-terminal PassThrough streams** -- Effort: **S**
  - **Files:** `apps/api/src/routes/pod-terminal.ts` lines 48-58
  - **Fix:** Add `.on('error', (err) => { app.log.error({ err }, 'stream error'); socket.close(1011, 'Stream error') })` to both `stdout` and `stderr`.
  - **Refs:** API-ISSUE-06

- [ ] **[MEDIUM] Add ErrorBoundary to dashboard widgets** -- Effort: **S**
  - **Files:** `apps/web/src/components/dashboard/DashboardGrid.tsx` line 133
  - **Fix:** Wrap each widget render in `<ErrorBoundary>` with a per-widget fallback showing "Widget failed to load".
  - **Refs:** FE-E-02

- [ ] **[MEDIUM] Add ErrorBoundary to topology/network graphs** -- Effort: **S**
  - **Files:** `apps/web/src/components/topology/TopologyMap.tsx`, `apps/web/src/components/network/NetworkPolicyGraph.tsx`
  - **Fix:** Wrap `<ReactFlow>` in `<ErrorBoundary>` with graph-specific fallback.
  - **Refs:** FE-E-03

- [ ] **[MEDIUM] Fix FilterBar debounce cleanup on unmount** -- Effort: **S**
  - **Files:** `apps/web/src/components/FilterBar.tsx` lines 54, 137
  - **Fix:** Add `useEffect(() => () => clearTimeout(debounceRef.current), [])`.
  - **Refs:** FE-M-02

### Performance

- [ ] **[MEDIUM] Clean up orphaned watch-db-writer listeners** -- Effort: **M**
  - **Files:** `apps/api/src/lib/watch-db-writer.ts` lines 238-250
  - **Fix:** Listen for `watch-status` disconnected events to remove per-cluster listeners from the `listeners` Map and the emitter.
  - **Refs:** API-ISSUE-11

- [ ] **[MEDIUM] Parallelize `metrics.currentStats` cluster loop** -- Effort: **S**
  - **Files:** `apps/api/src/routers/metrics.ts` lines 330-391
  - **Fix:** Replace `for (const cluster of allClusters)` with `Promise.allSettled(allClusters.map(...))`.
  - **Verify:** With 10 clusters, endpoint responds in ~15s (worst single cluster) instead of ~150s.
  - **Refs:** DB-2.5

- [ ] **[MEDIUM] Use column-specific selects for clusters.list** -- Effort: **S**
  - **Files:** `apps/api/src/routers/clusters.ts` line 185
  - **Fix:** Replace `select().from(clusters)` with specific columns, excluding `connectionConfig`. Currently the code fetches it then strips it.
  - **Refs:** DB-2.6

- [ ] **[MEDIUM] Centralize inline cache keys** -- Effort: **S**
  - **Files:** `apps/api/src/lib/cache-keys.ts`, 9 routers (`ingresses.ts`, `cronjobs.ts`, `daemonsets.ts`, `jobs.ts`, `hpa.ts`, `secrets.ts`, `pvcs.ts`, `statefulsets.ts`, `configmaps.ts`)
  - **Fix:** Add missing entries to `cache-keys.ts` (e.g., `k8sIngresses`, `k8sCronjobs`, etc.) and replace inline template literals in all 9 routers.
  - **Refs:** DB-3.4

- [ ] **[MEDIUM] Add missing FK indexes** -- Effort: **S**
  - **Files:** `charts/voyager/sql/init.sql`
  - **Fix:** Add indexes on: `session.user_id`, `account.user_id`, `ai_conversations.user_id`, `ai_conversations.cluster_id`, `ai_recommendations.cluster_id`, `webhook_deliveries.webhook_id`, `user_tokens.user_id`, `shared_dashboards.created_by`, `audit_log.user_id`.
  - **Verify:** `\di` in psql shows the new indexes.
  - **Refs:** DB-1.2, DB-1.3

- [ ] **[MEDIUM] Split barrel file to avoid heavy re-exports** -- Effort: **S**
  - **Files:** `apps/web/src/components/resource/index.ts`
  - **Fix:** Remove `ResourceDiff` and `YamlViewer` from the barrel file. Import heavy components directly from their files at consumption points.
  - **Refs:** FE-P-07

- [ ] **[MEDIUM] Reconsider AnimatePresence mode on tab switches** -- Effort: **S**
  - **Files:** `apps/web/src/app/clusters/[id]/layout.tsx` lines 201-211
  - **Fix:** Change `mode="wait"` to `mode="sync"` for crossfade, or remove AnimatePresence entirely for instant tab switches. The `mode="wait"` pattern forces the old tab to fully exit before the new tab mounts.
  - **Refs:** FE-P-08

- [ ] **[MEDIUM] Pause presence heartbeat when tab is hidden** -- Effort: **S**
  - **Files:** `apps/web/src/hooks/usePresence.ts` lines 230-246
  - **Fix:** Add `if (document.hidden) return` at the top of the heartbeat callback.
  - **Refs:** FE-K-04

### DX Improvements

- [ ] **[MEDIUM] Add `.gitignore` entries for test artifacts** -- Effort: **S**
  - **Files:** `.gitignore`
  - **Fix:** Add `test-results/`, `.playwright-mcp/`, `playwright/.auth/`.
  - **Refs:** INFRA-60

- [ ] **[MEDIUM] Add HEALTHCHECK to Dockerfiles** -- Effort: **S**
  - **Files:** `docker/Dockerfile.api`, `docker/Dockerfile.web`
  - **Fix:** Add `HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4000/health || exit 1` to API. Similar for web on port 3000.
  - **Refs:** INFRA-22, INFRA-25

- [ ] **[MEDIUM] Make /health endpoint check backends** -- Effort: **M**
  - **Files:** `apps/api/src/server.ts` (`/health` route)
  - **Fix:** Add `SELECT 1` on Postgres and `PING` on Redis. Return `{ status: 'ok', db: true, redis: true }` or `{ status: 'degraded', ... }` with appropriate HTTP status.
  - **Refs:** INFRA-71

- [ ] **[MEDIUM] Add security headers** -- Effort: **S**
  - **Files:** `apps/api/src/server.ts`, `apps/web/next.config.ts`
  - **Fix:** Add `@fastify/helmet` to API. Add `headers()` config to Next.js with `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.
  - **Refs:** INFRA-56, INFRA-57

- [ ] **[MEDIUM] Add securityContext to Helm deployments** -- Effort: **M**
  - **Files:** `charts/voyager/templates/deployment-api.yaml`, `charts/voyager/templates/deployment-web.yaml`, `charts/voyager/templates/deployment-db.yaml`, `charts/voyager/templates/deployment-redis.yaml`
  - **Fix:** Add to all containers: `securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false }`.
  - **Refs:** INFRA-36

- [ ] **[MEDIUM] Add startupProbe to API deployment** -- Effort: **S**
  - **Files:** `charts/voyager/templates/deployment-api.yaml`
  - **Fix:** Add `startupProbe: { httpGet: { path: /health, port: 4000 }, failureThreshold: 30, periodSeconds: 10 }`.
  - **Refs:** INFRA-37

- [ ] **[MEDIUM] Add rate limiting to auth routes** -- Effort: **S**
  - **Files:** `apps/api/src/server.ts` (auth route registration)
  - **Fix:** Apply rate limit of 10 req/min to `/api/auth/sign-in/*` instead of `rateLimit: false`.
  - **Refs:** INFRA-51

- [ ] **[MEDIUM] Remove `/trpc` from rate limit bypass** -- Effort: **S**
  - **Files:** `packages/config/src/routes.ts`
  - **Fix:** Remove `/trpc` from `RATE_LIMIT_BYPASS_PATHS`. Apply a higher limit (1000 req/min) to tRPC routes.
  - **Refs:** INFRA-52

- [ ] **[MEDIUM] Standardize secret key names across values files** -- Effort: **S**
  - **Files:** `charts/voyager/values.yaml`, `charts/voyager/values-production.yaml`, `charts/voyager/values-dev.yaml`, `charts/voyager/templates/secret.yaml`
  - **Fix:** Pick one name (`jwtSecret` or `betterAuthSecret`) and use it consistently everywhere.
  - **Refs:** INFRA-35

- [ ] **[MEDIUM] Add NetworkPolicy to Helm chart** -- Effort: **M**
  - **Files:** `charts/voyager/templates/network-policy.yaml` (new)
  - **Fix:** Only API can talk to postgres/redis, only web can talk to API, only ingress can talk to web/API.
  - **Refs:** INFRA-38

- [ ] **[MEDIUM] Add PodDisruptionBudget** -- Effort: **S**
  - **Files:** `charts/voyager/templates/pdb.yaml` (new)
  - **Fix:** `minAvailable: 1` for API and web when `replicaCount >= 2`.
  - **Refs:** INFRA-39

- [ ] **[MEDIUM] Add missing RBAC rules to ClusterRole** -- Effort: **S**
  - **Files:** `charts/voyager/templates/rbac.yaml`
  - **Fix:** Add rules for: `configmaps`, `secrets`, `persistentvolumeclaims`, `ingresses`, `cronjobs`, `jobs`, `horizontalpodautoscalers`, `networkpolicies`, `resourcequotas`, `customresourcedefinitions`.
  - **Refs:** INFRA-42

- [ ] **[MEDIUM] Fix web app tsconfig to extend base** -- Effort: **S**
  - **Files:** `apps/web/tsconfig.json`
  - **Fix:** Extend `../../packages/config/tsconfig.base.json` and override only Next.js-specific options. Align `target` to `ES2022`.
  - **Refs:** INFRA-11

- [ ] **[MEDIUM] OTel SDK should be conditional** -- Effort: **S**
  - **Files:** `apps/api/src/lib/telemetry.ts` line 39
  - **Fix:** Only call `sdk.start()` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Wrap in try/catch.
  - **Refs:** INFRA-63, API-ISSUE-19

- [ ] **[MEDIUM] Fix Sentry `as never` type casts** -- Effort: **S**
  - **Files:** `apps/api/src/lib/sentry.ts`
  - **Fix:** Fix types properly or upgrade `@sentry/node` to a version where types align.
  - **Refs:** INFRA-66

- [ ] **[MEDIUM] Add `corepack enable` to Dockerfile.api** -- Effort: **S**
  - **Files:** `docker/Dockerfile.api`
  - **Fix:** Add `RUN corepack enable` in deps stage, matching Dockerfile.web.
  - **Refs:** INFRA-21

- [ ] **[MEDIUM] Add hot-reload for feature flags** -- Effort: **M**
  - **Files:** `apps/api/src/lib/feature-flags.ts`
  - **Fix:** Add a file watcher or periodic 60s reload for `feature-flags.json`.
  - **Refs:** INFRA-69

### Accessibility

- [ ] **[MEDIUM] Add aria-labels to select elements** -- Effort: **S**
  - **Files:** `apps/web/src/components/topology/TopologyMap.tsx` line 178, `apps/web/src/components/network/NetworkPolicyGraph.tsx` line 389
  - **Fix:** Add `aria-label="Filter by namespace"` to both `<select>` elements.
  - **Refs:** FE-A-01

- [ ] **[MEDIUM] Add focus management after tab navigation** -- Effort: **M**
  - **Files:** `apps/web/src/app/clusters/[id]/layout.tsx`
  - **Fix:** After tab navigation, programmatically set focus to main content area.
  - **Refs:** FE-A-03

- [ ] **[MEDIUM] Add focus trap to terminal drawer** -- Effort: **M**
  - **Files:** `apps/web/src/components/terminal/TerminalDrawer.tsx`
  - **Fix:** When drawer opens, move focus into it. Provide visible "Close" button. When closed, return focus to the element that opened it.
  - **Refs:** FE-A-05

---

## Phase 4: Low Priority (Backlog)

Nice-to-have improvements for future maintenance cycles.

### API

- [ ] **[LOW] Handle `stdin.write()` backpressure in pod-terminal** -- Effort: **S**
  - **Files:** `apps/api/src/routes/pod-terminal.ts` lines 61-64
  - **Fix:** Add `stdin.on('error', ...)` handler at minimum.
  - **Refs:** API-ISSUE-07

- [ ] **[LOW] Call `cleanup()` after MAX_LOG_LINES in log-stream** -- Effort: **S**
  - **Files:** `apps/api/src/routes/log-stream.ts` lines 134-140
  - **Fix:** Call `cleanup()` directly after `logStream.destroy()`.
  - **Refs:** API-ISSUE-12

- [ ] **[LOW] Fix cluster-client-pool eviction to true LRU** -- Effort: **S**
  - **Files:** `apps/api/src/lib/cluster-client-pool.ts` lines 64-75
  - **Fix:** Track `lastAccessedAt` and evict by that field.
  - **Refs:** API-ISSUE-24

- [ ] **[LOW] Add hard cap to presenceStore** -- Effort: **S**
  - **Files:** `apps/api/src/lib/presence.ts` line 37
  - **Fix:** Reject heartbeats when Map exceeds 1000 users.
  - **Refs:** API-ISSUE-25

- [ ] **[LOW] Make replay buffer per-cluster (shared)** -- Effort: **M**
  - **Files:** `apps/api/src/routes/resource-stream.ts` lines 95-96
  - **Fix:** Move replay buffer to a per-cluster shared Map so reconnecting clients benefit from events buffered during absence.
  - **Refs:** API-ISSUE-26

### Frontend

- [ ] **[LOW] Fix PodLogStream mock timer** -- Effort: **S**
  - **Files:** `apps/web/src/components/PodLogStream.tsx` lines 63-65
  - **Refs:** FE-P-06

- [ ] **[LOW] Remove 1s settings page sync timer** -- Effort: **S**
  - **Files:** `apps/web/src/app/settings/page.tsx` line 231
  - **Refs:** FE-P-09

- [ ] **[LOW] Cancel rAF on CrosshairProvider unmount** -- Effort: **S**
  - **Files:** `apps/web/src/components/metrics/CrosshairProvider.tsx` line 29
  - **Refs:** FE-M-04

- [ ] **[LOW] Add max messages to AI assistant store** -- Effort: **S**
  - **Files:** `apps/web/src/stores/ai-assistant.ts`
  - **Fix:** Cap at 100 messages per cluster, trim old messages during `appendMessage`.
  - **Refs:** FE-M-03

- [ ] **[LOW] Add jitter to SSE reconnection backoff** -- Effort: **S**
  - **Files:** `apps/web/src/hooks/useResourceSSE.ts` lines 84-90, `apps/web/src/hooks/useMetricsSSE.ts` lines 103-108
  - **Fix:** Add `const jitter = Math.random() * 1000` to reconnect delay.
  - **Refs:** FE-K-02

- [ ] **[LOW] Add aria-hidden to ConstellationLoader canvas** -- Effort: **S**
  - **Files:** `apps/web/src/components/animations/ConstellationLoader.tsx`
  - **Refs:** FE-A-02

- [ ] **[LOW] Add aria-live region to DataTable** -- Effort: **S**
  - **Files:** `apps/web/src/components/DataTable.tsx`
  - **Refs:** FE-A-04

- [ ] **[LOW] Standardize error UI across cluster tab pages** -- Effort: **M**
  - **Files:** ~15 cluster tab pages
  - **Fix:** Use `QueryError` component or `ResourcePageScaffold` consistently.
  - **Refs:** FE-E-05

### Infrastructure

- [ ] **[LOW] Pin TimescaleDB image version** -- Effort: **S**
  - **Files:** `docker-compose.yml`
  - **Fix:** Change `timescale/timescaledb:latest-pg17` to `timescale/timescaledb:2.17.0-pg17`.
  - **Refs:** INFRA-29

- [ ] **[LOW] Pin corepack pnpm version in Dockerfile.web** -- Effort: **S**
  - **Files:** `docker/Dockerfile.web`
  - **Fix:** Change `pnpm@latest` to `pnpm@10.6.2`.
  - **Refs:** INFRA-26

- [ ] **[LOW] Remove drizzle files from runner stage** -- Effort: **S**
  - **Files:** `docker/Dockerfile.api`
  - **Refs:** INFRA-23

- [ ] **[LOW] Enable reactStrictMode** -- Effort: **S**
  - **Files:** `apps/web/next.config.ts`
  - **Fix:** Set `reactStrictMode: true`. Fix any issues this reveals.
  - **Refs:** INFRA-12

- [ ] **[LOW] Remove stale type packages** -- Effort: **S**
  - **Files:** `apps/web/package.json`
  - **Fix:** Remove `@types/js-yaml` and `@types/dagre` from devDependencies.
  - **Refs:** INFRA-9, INFRA-10

- [ ] **[LOW] Consolidate E2E auth fixtures** -- Effort: **S**
  - **Files:** `tests/e2e/auth.setup.ts`, `tests/e2e/fixtures/auth.ts`
  - **Fix:** Use one auth strategy with consistent selectors.
  - **Refs:** INFRA-19

- [ ] **[LOW] Add redis authentication** -- Effort: **S**
  - **Files:** `charts/voyager/templates/deployment-redis.yaml`, `charts/voyager/templates/secret.yaml`
  - **Fix:** Add `--requirepass` to Redis command, store password in secret.
  - **Refs:** INFRA-45

- [ ] **[LOW] Add resource limits to postgres deployment** -- Effort: **S**
  - **Files:** `charts/voyager/templates/deployment-db.yaml`
  - **Refs:** INFRA-46

- [ ] **[LOW] Rename misleading ClusterRole** -- Effort: **S**
  - **Files:** `charts/voyager/templates/rbac.yaml`
  - **Fix:** Rename `voyager-api-reader` to `voyager-api` since it has write permissions.
  - **Refs:** INFRA-41

### Database

- [ ] **[LOW] Add partial index for enabled alerts** -- Effort: **S**
  - **Files:** `charts/voyager/sql/init.sql`
  - **Fix:** `CREATE INDEX IF NOT EXISTS "idx_alerts_enabled" ON "alerts" ("enabled") WHERE "enabled" = true;`
  - **Refs:** DB-6.4

- [ ] **[LOW] Add encryption key version prefix** -- Effort: **M**
  - **Files:** `apps/api/src/lib/credential-crypto.ts`
  - **Fix:** Prefix ciphertext with `v1:` for future key rotation support.
  - **Refs:** DB-5.3

- [ ] **[LOW] Make audit_log.user_email NOT NULL** -- Effort: **S**
  - **Files:** `charts/voyager/sql/init.sql` line 412
  - **Refs:** DB-1.4

---

## Parallel Execution Strategy

### Agent Team 1: Backend (API + Database)

**Owner:** API server, tRPC routers, background jobs, database layer

| Phase | Items | Dependencies |
|-------|-------|-------------|
| Phase 1 | Cache TTL fixes (5 items), `seenGenerations` TTL, PG pool config, batch upserts, encryption key check | Batch upserts depend on UNIQUE constraint (init.sql, can self-serve) |
| Phase 2 | Shutdown timeout, AI stream fixes, maxListeners, gunzipSync, presence sweep, PG/Redis shutdown, stampede protection, Redis error handling, data retention, webhooks N+1, health bucketing, UNIQUE constraint | PG/Redis shutdown depends on pool config from P1 |
| Phase 3 | Error handling (MCP, deployments, logs, pod-terminal), watch-db-writer cleanup, parallelize currentStats, column-specific selects, cache keys, FK indexes, rate limiting, OTel conditional, Sentry types | None |

### Agent Team 2: Frontend (Performance + Error Boundaries)

**Owner:** Next.js app, React components, hooks, stores

| Phase | Items | Dependencies |
|-------|-------|-------------|
| Phase 1 | None (all critical items are backend) | -- |
| Phase 2 | useClusterResources timer fix, ResizeObserver leak, ErrorBoundary (layout), LogViewer cap, lazy-load diff viewer, topology polling | None -- all independent |
| Phase 3 | ErrorBoundary (widgets, graphs), FilterBar cleanup, barrel file split, AnimatePresence mode, presence heartbeat pause, accessibility items | None |
| Phase 4 | Mock timer, settings timer, rAF cleanup, AI store cap, SSE jitter, a11y aria, error UI standardization | None |

### Agent Team 3: Infrastructure (Docker + Helm + Security)

**Owner:** Dockerfiles, Helm chart, docker-compose, CI/CD, security

| Phase | Items | Dependencies |
|-------|-------|-------------|
| Phase 1 | Helm DB image fix, encryption key .env.example | TimescaleDB hypertables (coordinate with Team 1 for init.sql) |
| Phase 2 | Insecure defaults check, root deps cleanup, Helm values passwords, docker-compose trust, values dedup | None |
| Phase 3 | .gitignore, Dockerfiles (HEALTHCHECK, corepack), security headers, Helm (securityContext, startupProbe, NetworkPolicy, PDB, RBAC rules), secret key standardization, tsconfig, feature flags | None |
| Phase 4 | Image pinning, drizzle cleanup, reactStrictMode, type cleanup, auth fixtures, redis auth, DB limits, ClusterRole rename | None |

### Agent Team 4: Testing

**Owner:** Unit tests, integration tests, E2E improvements

| Phase | Items | Dependencies |
|-------|-------|-------------|
| Phase 3 | tRPC router tests, watch-manager tests, credential-crypto tests, web vitest config, frontend pure function tests | May need Team 1's batch upsert changes before testing watch-db-writer |
| Phase 4 | E2E auth fixture consolidation | None |

### Cross-Team Dependencies

```
Phase 1 (critical):
  init.sql changes (Team 1 + Team 3) -- coordinate TimescaleDB image + hypertable creation
  UNIQUE constraint on nodes -- must land before batch upsert code change

Phase 2:
  PG pool config (Team 1, Phase 1) --> PG pool shutdown (Team 1, Phase 2)
  Redis error fix (Team 1, Phase 2) --> Redis shutdown (Team 1, Phase 2)
  
Phase 3:
  Team 4 testing depends on code from Teams 1-3 being stable
  init.sql index changes (Team 1) should bundle with UNIQUE constraint if not yet merged
```

---

## Verification Checklist

### After Phase 1

- [ ] `pnpm typecheck` -- 0 errors
- [ ] `pnpm build` -- all packages compile
- [ ] `pnpm test` -- all existing tests pass
- [ ] `redis-cli TTL k8s:helm:*` returns ~30 (not ~30000) for any cached Helm key
- [ ] `SELECT * FROM timescaledb_information.hypertables;` returns 3 rows
- [ ] API process memory stable after 30 minutes (no `seenGenerations` leak)
- [ ] Helm deploy succeeds: `kubectl get pods -l app=voyager-api` shows Running
- [ ] `.env.example` no longer contains valid encryption key
- [ ] DB pool connections capped at 20: `SELECT count(*) FROM pg_stat_activity WHERE usename = 'voyager';`
- [ ] watch-db-writer generates 1-2 queries per sync (not 200+): check Postgres query logs

### After Phase 2

- [ ] `pnpm typecheck` -- 0 errors
- [ ] `pnpm build` -- all packages compile
- [ ] API stays alive for 30+ minutes under load (no shutdown hangs, no connection leaks)
- [ ] Browser console: 0 `[ERROR]` entries on any page
- [ ] React DevTools Profiler: cluster detail page renders <10 times per 5 seconds (not 46+)
- [ ] `next build` output: `react-diff-viewer-continued` in separate chunk (not in shared bundle)
- [ ] Rolling deploy: clients reconnect cleanly, no stale connection counters
- [ ] Redis client survives transient disconnect without connection churn
- [ ] No MaxListenersExceededWarning in server logs

### After Phase 3

- [ ] `pnpm typecheck` -- 0 errors
- [ ] `pnpm build` -- all packages compile
- [ ] `pnpm test` -- 20+ new test files pass
- [ ] tRPC router test coverage > 50% for critical routers (clusters, helm, pods, metrics)
- [ ] credential-crypto tests: encrypt/decrypt round-trip, invalid key, tampered data
- [ ] `pnpm test:e2e` -- all E2E tests pass with 0 failures
- [ ] `docker build -f docker/Dockerfile.api .` -- HEALTHCHECK present in image
- [ ] `helm template charts/voyager` -- includes NetworkPolicy, PDB, securityContext
- [ ] `curl -I http://localhost:4000/health` -- returns security headers (X-Content-Type-Options, etc.)
- [ ] Memory usage stable over 24 hours (no FilterBar, ResizeObserver, or AI store leaks)

### After Phase 4

- [ ] All checkboxes in this document checked
- [ ] `pnpm typecheck && pnpm build && pnpm test && pnpm test:e2e` -- clean
- [ ] Bundle size reduced by ~150KB+ (lazy-loaded diff-viewer, yaml, dagre)
- [ ] Lighthouse accessibility score > 90 on dashboard and cluster detail pages
- [ ] No known memory leaks remaining
