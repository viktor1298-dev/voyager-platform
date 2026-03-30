# Codebase Concerns

**Analysis Date:** 2026-03-30

## Dead Code

**`apps/api/src/lib/cluster-watch-manager.ts` (300 lines) -- UNUSED:**
- Issue: Legacy watch manager superseded by unified `watch-manager.ts`. Zero imports from any live code.
- Files: `apps/api/src/lib/cluster-watch-manager.ts`
- Impact: 300 lines of dead code that confuses contributors. Its `emitPodEvent()` and `emitMetrics()` calls emit to channels that are only consumed by the also-dead `subscriptionsRouter`.
- Fix approach: Delete the file.

**`apps/api/src/lib/resource-watch-manager.ts` (309 lines) -- UNUSED:**
- Issue: Legacy resource watch manager superseded by unified `watch-manager.ts`. Zero imports from any live code.
- Files: `apps/api/src/lib/resource-watch-manager.ts`
- Impact: Dead code. Its `emitResourceChange()` is the only caller of `voyagerEmitter.emitResourceChange()`.
- Fix approach: Delete the file.

**`apps/api/src/lib/cluster-connection-state.ts` (63 lines) -- UNUSED:**
- Issue: Only imported by the dead `cluster-watch-manager.ts`.
- Files: `apps/api/src/lib/cluster-connection-state.ts`
- Impact: Dead module.
- Fix approach: Delete the file.

**`apps/api/src/routers/subscriptions.ts` (213 lines) -- UNUSED by frontend:**
- Issue: tRPC subscription router (`podEvents`, `deploymentProgress`, `metrics`, `alerts`, `logs`, `clusterState`) is registered in `routers/index.ts` but no frontend code calls any of these subscriptions. The web app uses direct SSE (`useResourceSSE`, `useMetricsSSE`, `LogViewer`) instead.
- Files: `apps/api/src/routers/subscriptions.ts`
- Impact: Maintains illusion of used code. The legacy `streamLogs()` function it calls is also deprecated. Adds surface area, false sense of coverage.
- Fix approach: Either remove the router entirely (since SSE routes replaced it) or keep as future public API with clear documentation.

**`apps/api/src/lib/k8s-watchers.ts` -- Partially dead:**
- Issue: `stopAllWatchers()` is a no-op (line 179). `streamLogs()` is deprecated (line 124). Only `streamLogsFollow()` and `watchDeploymentProgress()` are actively used (by `subscriptions.ts`, which is itself unused from the frontend).
- Files: `apps/api/src/lib/k8s-watchers.ts`
- Impact: `stopAllWatchers()` is called in server shutdown but does nothing. The deprecated `streamLogs()` uses default kubeconfig (not multi-cluster).
- Fix approach: Remove `stopAllWatchers()` call from `server.ts`. Remove `streamLogs()`. Keep `streamLogsFollow()` and `watchDeploymentProgress()` only if `subscriptions.ts` is retained.

**`VoyagerEventEmitter` dead methods:**
- Issue: `emitPodEvent()`, `emitMetrics()`, and `emitResourceChange()` in `apps/api/src/lib/event-emitter.ts` are only called by the dead legacy watchers. The unified `watch-manager.ts` uses `emitWatchEvent()` and `emitWatchStatus()` instead.
- Files: `apps/api/src/lib/event-emitter.ts` (lines 20-21, 28-29, 48-49)
- Impact: Misleading API surface on the emitter.
- Fix approach: Remove dead methods after removing dead watchers.

## Security Considerations

**`connection_config` encryption incomplete -- Critical:**
- Risk: The Drizzle schema has a TODO(security) comment: "Store connection_config encrypted-at-rest (field-level encryption / KMS) before production." Encryption IS implemented in `clusters.ts` router via `encryptConnectionConfig()`, but only when `CLUSTER_CRED_ENCRYPTION_KEY` is set. If the key is missing/invalid, credentials are stored as plaintext JSONB.
- Files: `packages/db/src/schema/clusters.ts:28`, `apps/api/src/routers/clusters.ts:28-33`
- Current mitigation: `server.ts:42-47` warns on startup if key is invalid but does NOT prevent the server from starting.
- Recommendations: Fail-hard in production if encryption key is missing. Add a startup check that blocks boot when `NODE_ENV=production` and key is invalid.

**Default admin password in `init.sql` -- High:**
- Risk: `charts/voyager/sql/init.sql:69` seeds admin user with `crypt('admin123', gen_salt('bf', 10))`. This runs on every fresh database init.
- Files: `charts/voyager/sql/init.sql:57-73`, `apps/api/src/lib/ensure-admin-user.ts:4`
- Current mitigation: `ensureAdminUser()` at runtime overrides with env vars (`ADMIN_EMAIL`, `ADMIN_PASSWORD`). Production requires these env vars or throws. But the init.sql seed still creates the bcrypt-hashed row with `admin123`.
- Recommendations: Remove the hardcoded password from `init.sql`. Let `ensureAdminUser()` be the sole bootstrap path.

**`ignoreBuildErrors: true` in Next.js config -- High:**
- Risk: `apps/web/next.config.ts:9` sets `typescript.ignoreBuildErrors: true`. This means TypeScript errors do NOT prevent builds. Type mismatches between API and frontend can ship to production undetected.
- Files: `apps/web/next.config.ts:9`
- Current mitigation: `pnpm typecheck` runs separately, but it is not enforced as a CI gate (no CI pipeline detected).
- Recommendations: Remove `ignoreBuildErrors: true` and fix any build-breaking type errors. This is a ticking time bomb.

**AI stream SSE missing CORS headers -- Medium:**
- Risk: `apps/api/src/routes/ai-stream.ts:85-89` writes SSE headers via `reply.raw.writeHead()` but does NOT include `access-control-allow-origin` or `access-control-allow-credentials` headers, unlike the other SSE routes (`resource-stream.ts`, `metrics-stream.ts`, `log-stream.ts`) which all add them manually.
- Files: `apps/api/src/routes/ai-stream.ts:85-89`
- Current mitigation: May work in production behind a reverse proxy that adds CORS. Fails in local dev with cross-origin requests.
- Recommendations: Add the same CORS header pattern used by `resource-stream.ts:96-104`.

**`reactStrictMode: false` -- Low:**
- Risk: `apps/web/next.config.ts:7` disables React strict mode. This hides double-render bugs and missing cleanup in effects.
- Files: `apps/web/next.config.ts:7`
- Impact: Potential memory leaks in hooks go undetected during development.
- Recommendations: Re-enable once SSE hooks are verified stable.

## Tech Debt

**Duplicated SSE connection-limit boilerplate -- High:**
- Issue: The connection counting pattern (`incrementConnections`, `decrementConnections`, `MAX_CONNECTIONS_PER_CLUSTER = 10`, `MAX_CONNECTIONS_GLOBAL = 50`) is copy-pasted identically across three files.
- Files: `apps/api/src/routes/resource-stream.ts:31-49`, `apps/api/src/routes/metrics-stream.ts:17-36`, `apps/api/src/routes/log-stream.ts:19-42`
- Impact: Bug fix in one file won't propagate. Constants are hardcoded instead of using `@voyager/config`. `resource-stream.ts` uses different constant names from config (`MAX_RESOURCE_CONNECTIONS_GLOBAL`) but the other two files hardcode `50`.
- Fix approach: Extract shared `createConnectionLimiter(perCluster, global)` helper into `lib/`. Import limits from `@voyager/config/sse`.

**Duplicated SSE CORS header block:**
- Issue: Manual CORS headers for `reply.raw.writeHead()` are copy-pasted across `resource-stream.ts`, `metrics-stream.ts`, `log-stream.ts`. Same 5-line pattern.
- Files: `apps/api/src/routes/resource-stream.ts:95-106`, `apps/api/src/routes/metrics-stream.ts:79-90`, `apps/api/src/routes/log-stream.ts:95-106`
- Fix approach: Extract `buildSseCorsHeaders(request)` helper.

**Duplicated SSE auth block:**
- Issue: Session validation via `auth.api.getSession({ headers }).catch(() => null)` is repeated in 7 places with identical code.
- Files: `apps/api/src/routes/resource-stream.ts:65-72`, `apps/api/src/routes/metrics-stream.ts:50-58`, `apps/api/src/routes/log-stream.ts:56-64`, `apps/api/src/routes/ai-stream.ts:31-41`, `apps/api/src/routes/ai-stream.ts:74-82`, `apps/api/src/routes/pod-terminal.ts:20-27`, `apps/api/src/server.ts:91-100`
- Fix approach: Extract `authenticateRequest(request): Promise<Session | null>` helper.

**`watch-db-writer.ts` monkeypatches emitter -- Medium:**
- Issue: Lines 254-258 replace `voyagerEmitter.emitWatchEvent` with a wrapper at runtime. This is fragile -- any code that caches the original method reference will bypass the dirty tracking. Also, `stopWatchDbWriter()` (line 271-280) does NOT restore the original method.
- Files: `apps/api/src/lib/watch-db-writer.ts:254-258`
- Impact: If `stopWatchDbWriter()` is called and `startWatchDbWriter()` called again, the method is double-wrapped. The `generalListener` stored in the `listeners` map is never actually used.
- Fix approach: Use `voyagerEmitter.on('watch-event:*')` pattern or add a proper hook mechanism to the emitter instead of monkeypatching.

**N+1 query pattern in `watch-db-writer.ts` syncNodes -- Medium:**
- Issue: `syncNodes()` (lines 54-111) performs individual `SELECT` + `UPDATE` or `INSERT` for each node in a loop. For a cluster with 50 nodes, that is 100 DB round-trips per sync.
- Files: `apps/api/src/lib/watch-db-writer.ts:54-111`
- Impact: Slow sync under clusters with many nodes.
- Fix approach: Use Drizzle `onConflictDoUpdate()` for bulk upsert.

**N+1 query pattern in `watch-db-writer.ts` syncEvents -- Medium:**
- Issue: `syncEvents()` (lines 122-161) performs individual `SELECT` + `INSERT` for each K8s event. With hundreds of events per sync cycle, this is expensive.
- Files: `apps/api/src/lib/watch-db-writer.ts:122-161`
- Fix approach: Batch insert with `ON CONFLICT DO NOTHING`.

**Mock data in production frontend -- Medium:**
- Issue: `MOCK_ANOMALIES` (176-line mock dataset) is imported and rendered on the live alerts page, anomaly timeline, and anomaly widget. Not behind a feature flag.
- Files: `apps/web/src/lib/anomalies.ts`, `apps/web/src/app/alerts/page.tsx:43,541`, `apps/web/src/components/dashboard/AnomalyTimeline.tsx:141`, `apps/web/src/components/anomalies/AnomalyWidget.tsx:8`, `apps/web/src/hooks/useAnomalyCount.ts:11`
- Impact: Users see fake anomaly data. Dashboard badge shows mock anomaly counts.
- Fix approach: Wire to backend `anomalies.listAll` tRPC endpoint or hide behind feature flag.

**Mock admin API for features and webhooks pages -- Medium:**
- Issue: Settings pages for Feature Flags and Webhooks use a client-side mock API (`mockAdminApi`) instead of tRPC endpoints.
- Files: `apps/web/src/lib/mock-admin-api.ts`, `apps/web/src/app/settings/features/page.tsx:7`, `apps/web/src/app/settings/webhooks/page.tsx:10`
- Impact: Changes are lost on refresh. Data is fake.
- Fix approach: Connect to existing tRPC routers (`features`, `webhooks`) or remove pages.

**`as unknown as` type casts in resource-mappers -- Low:**
- Issue: 15+ `as unknown as string` casts for K8s date fields throughout `resource-mappers.ts`.
- Files: `apps/api/src/lib/resource-mappers.ts` (lines 73, 186, 229, 463, 510, 629, 632, 635, 636, 647, 650)
- Impact: Masks potential runtime errors if K8s API changes field types.
- Fix approach: Use proper K8s type-aware date extraction helper.

## Performance Bottlenecks

**Missing database indexes on heavily-queried tables -- Critical:**
- Problem: Several tables used in frequent queries have no indexes beyond their primary key.
- Files: `charts/voyager/sql/init.sql`
- Tables missing indexes:
  - `events` -- no index on `cluster_id` or `timestamp` (events table uses composite PK `(id, timestamp)` but no index for lookups by `cluster_id`). `watch-db-writer.ts:135` queries by `id` + `timestamp` on every sync.
  - `nodes` -- no index on `cluster_id` or `name`. `watch-db-writer.ts:77-80` queries by `cluster_id` + `name` on every sync cycle.
  - `audit_log` -- no indexes at all. `audit.ts` queries by `action`, `resource`, `userId`, `timestamp` with ORDER BY `timestamp DESC`.
  - `alert_history` -- no index on `alert_id` or `triggered_at`.
  - `health_history` -- no index on `cluster_id` or `checked_at`.
- Cause: Tables were added via "missing table" comments in init.sql without index definitions.
- Improvement path: Add composite indexes: `events(cluster_id, timestamp)`, `nodes(cluster_id, name)`, `audit_log(timestamp DESC)`, `audit_log(user_id, timestamp DESC)`, `alert_history(alert_id, triggered_at DESC)`.

**TimescaleDB extension loaded but no hypertables -- Medium:**
- Problem: `init.sql:3` loads the `timescaledb` extension but no table is converted to a hypertable. `metrics_history` and `node_metrics_history` are ideal candidates for time-series partitioning.
- Files: `charts/voyager/sql/init.sql:3`, lines 416-430 (metrics_history), lines 601-613 (node_metrics_history)
- Cause: Hypertable conversion was never added.
- Improvement path: Add `SELECT create_hypertable('metrics_history', 'timestamp', if_not_exists => TRUE);` and similarly for `node_metrics_history`.

**EventEmitter maxListeners (100) could be exceeded -- Medium:**
- Problem: `voyagerEmitter.setMaxListeners(100)` at `event-emitter.ts:65`. With per-cluster event channels (`watch-event:<clusterId>`, `watch-status:<clusterId>`, `metrics-stream:<clusterId>`), if 30+ clusters are active with 3+ SSE subscribers each, the 100 limit could be hit.
- Files: `apps/api/src/lib/event-emitter.ts:62-65`
- Impact: Node.js emits MaxListenersExceeded warning (not a crash, but signals a potential leak).
- Fix approach: Increase or set to `Infinity` with the understanding that cleanup is handled by `request.raw.on('close')`.

## Fragile Areas

**SSE `reply.raw.write()` with empty catch blocks:**
- Files: `apps/api/src/routes/resource-stream.ts:119-124,135-138`, `apps/api/src/routes/metrics-stream.ts:97`
- Why fragile: Swallowing write errors with `catch { /* connection closed */ }` means the handler continues running after client disconnect until the `close` event fires. Between disconnect and `close`, all writes silently fail.
- Safe modification: The pattern is intentional (SSE connections can close at any time). But adding a `closed` flag would prevent wasted work.
- Test coverage: `resource-stream.test.ts` exists with good coverage.

**`watch-db-writer.ts` method monkeypatch:**
- Files: `apps/api/src/lib/watch-db-writer.ts:254-258`
- Why fragile: Runtime patching of `voyagerEmitter.emitWatchEvent` is not type-safe and can break if the emitter is replaced or the method is called via a different reference.
- Safe modification: Replace with an explicit event listener.

## Scaling Limits

**In-memory informer cache (WatchManager):**
- Current capacity: All 15 resource types per active cluster, held in Node.js heap.
- Limit: With 10+ large clusters (1000+ pods each), heap pressure becomes significant. Each cluster could hold 5000+ objects in informer cache.
- Scaling path: Limit informer scope to specific namespaces or resource types per cluster. Or move cache to Redis.

**Single-process architecture:**
- Current capacity: One Node.js process handles all SSE connections, K8s informers, DB writes, and API requests.
- Limit: SSE connections are long-lived. With 50+ concurrent users viewing cluster details, the process holds 50+ open TCP connections + 50+ event listeners per cluster.
- Scaling path: The stateless SSE design (no session affinity required) supports horizontal scaling behind a load balancer, but the in-memory WatchManager would need to be shared (Redis pub/sub) or duplicated per instance.

## Test Coverage Gaps

**SSE routes -- partial coverage:**
- What's not tested: `metrics-stream.ts` and `log-stream.ts` test files exist but focus on happy path. Connection limit exhaustion, CORS validation, and cleanup-on-disconnect are not tested.
- Files: `apps/api/src/routes/metrics-stream.ts`, `apps/api/src/routes/log-stream.ts`
- Risk: Connection leak if cleanup handler fails.
- Priority: Medium

**No E2E or integration tests for AI chat stream:**
- What's not tested: `apps/api/src/routes/ai-stream.ts` -- no test file found.
- Risk: AI streaming regressions undetected.
- Priority: Low (feature is optional)

**Frontend pages with mock data have no meaningful test:**
- What's not tested: Alerts page, anomaly timeline, feature flags page, webhooks page -- all render mock data.
- Files: `apps/web/src/app/alerts/page.tsx`, `apps/web/src/app/settings/features/page.tsx`, `apps/web/src/app/settings/webhooks/page.tsx`
- Risk: If backend integration is wired up, these pages will break with no test safety net.
- Priority: Medium

---

*Concerns audit: 2026-03-30*
