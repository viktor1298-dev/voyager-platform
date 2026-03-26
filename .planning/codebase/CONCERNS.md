# Codebase Concerns

**Analysis Date:** 2026-03-26

## Tech Debt

**KubeConfig initialization gap in error handling:**
- Issue: `getKubeConfig()` in `apps/api/src/lib/k8s.ts` sets a `_k8sDisabled` flag on load failure, but this relies on manual flag-checking in API client methods (`getCoreV1Api()`, `getAppsV1Api()`, etc.). The flag is not guaranteed to be checked everywhere before `makeApiClient()` is called.
- Files: `apps/api/src/lib/k8s.ts`
- Impact: Silent failures or cryptic runtime errors if K8s is misconfigured. Flag-checking is defensive but fragile if new client methods are added without the check.
- Fix approach: This was partially addressed in the codebase (flag exists, `ensureK8sEnabled()` guards all public API methods), but the pattern is still fragile. Consider wrapping `makeApiClient()` itself to throw if disabled, rather than relying on caller discipline.

**Sequential K8s API calls in metrics/live endpoints:**
- Issue: `apps/api/src/routers/metrics.ts:552` and cluster live endpoints make multiple independent K8s API calls sequentially (nodes, pods, namespaces, deployments, events) instead of in parallel.
- Files: `apps/api/src/routers/metrics.ts`, `apps/api/src/routers/clusters.ts`
- Impact: Endpoint latency multiplied by call count. At 30s polling from multiple browser tabs, this stresses the K8s API server unnecessarily.
- Fix approach: Use `Promise.all()` for independent calls. This could cut response time 4-6x. Add caching layer (Redis is deployed but unused) with 10-30s TTL to further reduce K8s API load.

**Cross-app import for AppRouter type:**
- Issue: `apps/web/src/lib/trpc.ts:9` imports `AppRouter` type from `@voyager/api/types` (via workspace path), but the actual type export should live in a shared package or be exported via package.json exports field.
- Files: `apps/web/src/lib/trpc.ts`, `apps/api/src/routers/index.ts`
- Impact: If API directory structure changes or monorepo layout is refactored, type imports break. Docker builds may not resolve workspace paths correctly.
- Fix approach: Ensure `@voyager/api` exports types via `package.json` exports field: `"./types": "./src/routers/index.ts"`. Then import as `import type { AppRouter } from '@voyager/api/types'`. Already partially done (import shows `@voyager/api/types`).

**Unencrypted cluster credentials at rest:**
- Issue: `packages/db/src/schema/clusters.ts:28` has a TODO comment: cluster connection configs (containing AWS keys, Azure credentials, kubeconfigs) are stored in JSONB without encryption.
- Files: `packages/db/src/schema/clusters.ts`, `apps/api/src/routers/clusters.ts:27-31` (has encryption wrapper, but DB field is not encrypted)
- Impact: If database is breached or backups leaked, all cluster credentials are exposed in plaintext. This is a critical security gap for production.
- Fix approach: Implement field-level encryption for `connection_config` JSONB column. Options: (1) Transparent Drizzle column middleware to encrypt/decrypt, (2) KMS key per cluster, (3) External secrets store (Vault). At minimum, validate that CLUSTER_CRED_ENCRYPTION_KEY env var is set at startup.

**Missing unit/integration tests for critical paths:**
- Issue: K8s client initialization, tRPC error handling, authorization checks, and authentication have minimal test coverage.
- Files: `apps/api/src/__tests__/` directory has tests, but not for core K8s/auth paths.
- Impact: Regressions in K8s connectivity, auth bypass, or error propagation may go undetected until production.
- Fix approach: Add integration tests for: (1) K8s client lazy init + disabled flag, (2) protectedProcedure/adminProcedure/authorizedProcedure checks, (3) tRPC error formatting, (4) auth middleware behavior.

**Database schema coupling between SQL init and Drizzle ORM:**
- Issue: `charts/voyager/sql/init.sql` is the source of truth for schema, but `packages/db/src/schema/` defines the same schema in Drizzle. These can drift.
- Files: `charts/voyager/sql/init.sql`, `packages/db/src/schema/`, `apps/api/src/server.ts` (explicitly avoids running migrations)
- Impact: If SQL schema changes, Drizzle types may become stale. New fields added to SQL init won't be visible to the ORM until manually synced.
- Fix approach: Use Drizzle migrations as the single source of truth, and generate SQL schema from migrations. Or, validate that init.sql matches Drizzle schema at build time.

---

## Known Bugs

**tRPC Batch URL length causes navigation to break:**
- Symptoms: Adding `useQuery` to frequently-rendered components (e.g., `InlineAiTrigger`) can cause tRPC's `httpBatchLink` to create oversized URLs. Nginx returns 404, ALL queries in the batch fail, retry loops saturate React scheduler, and `startTransition` navigation never completes.
- Files: `apps/web/src/lib/trpc.ts:40-48` (uses `httpLink` instead of `httpBatchLink` to mitigate), `apps/web/src/components/ai/InlineAiTrigger.tsx` (previously had query that was removed per BUG-192-001-v3)
- Trigger: Add a tRPC `useQuery` to any frequently-rendered component shared across many pages.
- Workaround: Use `httpLink` instead of `httpBatchLink`, or lazy-load queries in shared components. Currently mitigated via `httpLink` in trpc client setup.

**E2E test URL assumptions break on redirects:**
- Symptoms: E2E tests may call `goto('/')` expecting dashboard, but the app may redirect to `/login` or `/clusters`, causing "element not found" failures on selectors that assume the wrong page.
- Files: `tests/e2e/*.spec.ts`
- Trigger: When app routing changes (e.g., new auth flow, dashboard redirect), tests that don't verify URL before asserting on page content will fail.
- Workaround: Always call `waitForURL()` after navigation to verify the landing page before querying selectors. This is documented in CLAUDE.md Known Gotcha #2.

**Router.push() navigation doesn't create `<a>` tags for E2E selector matching:**
- Symptoms: E2E tests looking for `a[href*="/clusters/"]` fail because cluster navigation uses `router.push()` instead of `<a>` links.
- Files: `apps/web/src/app/clusters/page.tsx`, `tests/e2e/clusters.spec.ts`
- Trigger: Writing E2E tests that query for `<a>` tags when the actual navigation is via `router.push()`.
- Workaround: Use `page.click()` on the element itself or `waitForURL()` to verify navigation completed.

**Fresh database after Helm install requires manual seeding:**
- Symptoms: After `helm install` (revision=1), database is empty. `SELECT count(*) FROM users` returns 0. No users exist, login fails.
- Files: `charts/voyager/sql/init.sql` creates schema but does not run app-level seed (e.g., admin user creation, demo data).
- Trigger: Running E2E or QA tests immediately after deployment without running `pnpm db:seed`.
- Workaround: After `helm install`, run `pnpm db:seed` from the app container or as a Helm hook.

**Anomalies component uses mock fallback indefinitely:**
- Symptoms: `apps/web/src/components/dashboard/AnomalyTimeline.tsx` has a TODO: "Replace mock fallback once backend anomalies.listAll is deployed." Mock data is returned even if backend route exists.
- Files: `apps/web/src/components/dashboard/AnomalyTimeline.tsx`
- Trigger: Dashboard loads anomalies from mock data instead of real anomalies from the backend.
- Workaround: Wire component to actual `trpc.anomalies.listAll()` once backend route is confirmed.

---

## Security Considerations

**Plaintext cluster credentials stored in PostgreSQL:**
- Risk: K8s credentials (AWS IAM keys, Azure MSI tokens, raw kubeconfigs, GCP service accounts) stored in `clusters.connection_config` JSONB without encryption. Database backups or accidental exposure = full K8s cluster compromise.
- Files: `packages/db/src/schema/clusters.ts:30` (connectionConfig field), `apps/api/src/routers/clusters.ts:27-31` (encryption wrapper exists but DB field not encrypted)
- Current mitigation: Code wraps config in encryption before storage, but the encryption is not transparent at the DB layer. If attacker gains DB access, they can read plaintext credentials.
- Recommendations: (1) Enable Drizzle column middleware for transparent encryption/decryption. (2) Use KMS key rotation. (3) Add database-level encryption (PostgreSQL pgcrypto at rest). (4) Audit logs for credential access. (5) Rotate cluster credentials regularly.

**Minimal authentication enforcement on critical endpoints:**
- Risk: Only 2 routes use `publicProcedure`: `sso.getProviders` (benign) and auth routes. All other endpoints (clusters.create/update/delete, user management, webhooks, feature flags) are protected. However, authorization model is still being evolved (see Known Gotchas #6).
- Files: `apps/api/src/routers/sso.ts:18` (only public endpoint), `apps/api/src/trpc.ts:95-100` (authorizedProcedure checks)
- Current mitigation: `protectedProcedure` enforces session existence, `adminProcedure` checks role === 'admin', `authorizedProcedure` validates object-level access.
- Recommendations: (1) Audit all `adminProcedure` routes to ensure they're truly admin-only. (2) Add rate limiting to sensitive endpoints (e.g., cluster delete, credential updates). (3) Log all mutations with user context (audit logs partially implemented). (4) Consider RBAC beyond binary admin/viewer split.

**Environment variable validation gaps:**
- Risk: `CLUSTER_CRED_ENCRYPTION_KEY` validated at startup with a warn log, but if invalid, encryption silently fails and credentials are stored plaintext. No hard failure.
- Files: `apps/api/src/server.ts:30-36`
- Current mitigation: Warn log if key is missing or invalid. Encryption wrapper in `clusters.ts` returns plaintext if key is invalid.
- Recommendations: (1) Make invalid key a hard startup error (`throw new Error(...)` instead of warn). (2) Validate other critical env vars the same way: `API_URL`, `ALLOWED_ORIGINS`, database password strength.

**CORS origin configuration too permissive in dev:**
- Risk: `ALLOWED_ORIGINS` defaults to `['http://localhost:3000']` for development, but if this default leaks into production, any frontend on localhost can make API requests.
- Files: `apps/api/src/server.ts:59-62`
- Current mitigation: Env var `ALLOWED_ORIGINS` can override default. Helm values should set production origins.
- Recommendations: (1) Remove default — require explicit env var. (2) Validate origins are HTTPS in production. (3) Add Origin validation to specific endpoints (e.g., webhook mutations).

**Rate limit whitelist includes `/trpc` which batches many queries:**
- Risk: `/trpc` and `/api/auth/` are whitelisted from rate limiting (line 53). A single tRPC batch request can execute 10+ queries. Combined with whitelist, this enables API abuse.
- Files: `apps/api/src/server.ts:47-54`
- Current mitigation: `/trpc` is whitelisted to avoid breaking legitimate batch requests. Rate limit is per-IP (keyGenerator: req.ip), so distributed attacks bypass it.
- Recommendations: (1) Apply per-user rate limiting (use session ID or API token) instead of per-IP. (2) Add query-level rate limiting inside tRPC procedures. (3) Reduce `DEFAULT_RATE_LIMIT_MAX` (currently 200/min) for non-whitelisted paths.

---

## Performance Bottlenecks

**Sequential K8s API calls in metrics endpoint:**
- Problem: `apps/api/src/routers/metrics.ts` makes 10+ sequential API calls (nodes, pods, namespaces, deployments, events, metrics) for a single cluster.
- Files: `apps/api/src/routers/metrics.ts:552+`
- Cause: No parallelization, no caching. Each call waits for the previous to complete.
- Improvement path: (1) Use `Promise.all()` for independent K8s API calls. (2) Add Redis caching with 10-30s TTL. (3) Implement incremental updates (watch events, cache deltas) instead of full refetch.

**Large component files with complex rendering logic:**
- Problem: Multiple component files >600 LOC with inline logic that could be extracted.
- Files: `apps/api/src/routers/ai.ts` (808 LOC), `apps/web/src/components/ai/AiChat.tsx` (666 LOC), `apps/web/src/app/page.tsx` (654 LOC), `apps/web/src/app/settings/page.tsx` (603 LOC)
- Cause: Lack of component decomposition. Too much logic in a single file.
- Improvement path: Extract sub-components (especially for AI chat and settings pages). Measure rendering performance via React DevTools Profiler. Consider memoization for expensive derived state (useMemo/useCallback).

**No caching layer between app and K8s API:**
- Problem: Redis is deployed but completely unused. Every request to `clusters.live`, `metrics.*`, `pods.*`, etc. hits K8s API directly.
- Files: `docker-compose.yml`, `charts/voyager/templates/redis.yaml` (infrastructure exists), but no app code uses it.
- Cause: Caching layer not yet implemented. Would require refactoring K8s client wrapper to use Redis.
- Improvement path: (1) Implement `cached()` helper (partially exists in `apps/api/src/lib/cache.js` but not wired to K8s calls). (2) Cache responses with 10-30s TTL based on data volatility. (3) Invalidate cache on cluster reconnection.

**Metrics chart rendering with many data points:**
- Problem: `apps/web/src/components/metrics/MetricsAreaChart.tsx` renders Recharts with 100+ data points, which can cause jank on low-end devices.
- Files: `apps/web/src/components/metrics/MetricsAreaChart.tsx`
- Cause: No data downsampling or virtualization. Full dataset rendered every time.
- Improvement path: (1) Downsample data to 50-100 points (time-bucketing). (2) Use Recharts `syncId` to share zoom state across charts. (3) Lazy-load historical metrics (only show last 1h by default).

---

## Fragile Areas

**K8s watcher initialization and lifecycle:**
- Files: `apps/api/src/lib/k8s-watchers.ts`, `apps/api/src/jobs/`
- Why fragile: K8s watchers (pod watcher, metrics poller, event sync, node sync) start at server startup but have no heartbeat or reconnection logic. If the K8s API goes down mid-request, watchers may silently hang or crash.
- Safe modification: Add reconnect loops to all watchers. Log watch events (start/error/stop). Add health checks to verify watchers are active.
- Test coverage: No dedicated tests for watcher lifecycle. Add integration tests that simulate K8s API disconnection.

**Authorization model with object-level access:**
- Files: `apps/api/src/lib/authorization.ts`, `apps/api/src/trpc.ts:95-100`
- Why fragile: `authorizedProcedure` checks object-level access by querying the authorization table. If a new object type is added (e.g., Dashboard), routes using the old auth model won't enforce new permissions.
- Safe modification: Audit every tRPC mutation for proper authorization. Don't trust `admin` role bypass without explicit review. Add authorization tests for each object type.
- Test coverage: `apps/api/src/__tests__/authorization.test.ts` exists but may not cover all mutations.

**E2E test selectors assume static DOM structure:**
- Files: `tests/e2e/*.spec.ts`
- Why fragile: Tests query by class names, data attributes, text content. Renaming CSS classes or changing button labels breaks 10+ tests at once.
- Safe modification: Use `data-testid` attributes on all interactive elements. Avoid brittle text queries. Use page objects pattern to centralize selectors.
- Test coverage: No page object layer. Each test duplicates selectors.

**tRPC error handler depends on error code string matching:**
- Files: `apps/web/src/lib/trpc.ts:55-78`
- Why fragile: Checks for error code 'UNAUTHORIZED' in multiple places (data.code, shape.data.code, message string). If error structure changes, some redirects may not trigger.
- Safe modification: Ensure all auth errors throw `TRPCError({ code: 'UNAUTHORIZED' })`. Add type guards instead of string matching.
- Test coverage: `apps/api/src/__tests__/auth.test.ts` covers auth, but not the frontend error handler.

---

## Scaling Limits

**K8s API polling from multiple browser tabs:**
- Current capacity: ~5 concurrent polling connections before K8s API starts throttling requests.
- Limit: If 50 users have the dashboard open, that's 250+ concurrent requests every 30s. K8s API will start returning 429 (rate limited) or timing out.
- Scaling path: (1) Add server-side polling with cache shared across clients (WebSocket or Server-Sent Events). (2) Increase polling interval (60-90s instead of 30s) for non-critical data. (3) Implement selective polling (only fetch what the user is viewing).

**Database connection pool size:**
- Current capacity: Drizzle ORM with default connection pool (likely 10-20 connections).
- Limit: At 100+ concurrent users, connection pool can be exhausted, causing "too many connections" errors.
- Scaling path: (1) Increase pool size in Drizzle config (`max` in `drizzle.config.ts`). (2) Add connection pooling layer (PgBouncer). (3) Move long-running queries to background jobs.

**Metrics data retention:**
- Current capacity: Metrics collected indefinitely (no retention policy visible).
- Limit: After 1-2 months of metrics collection, PostgreSQL table size grows to GB+, query performance degrades.
- Scaling path: (1) Add TimescaleDB hypertable compression for metrics. (2) Implement data retention policy (keep 30d raw, 1y compressed). (3) Archive old metrics to S3.

---

## Dependencies at Risk

**`@tanstack/react-form` appears unused but is actually required:**
- Risk: Package listed as "possibly dead weight" in CLAUDE.md Known Gotcha #6. Removing it would break login/users/teams pages.
- Impact: If someone removes it during cleanup (it has 0 visible imports in most files), login breaks.
- Migration plan: (1) Audit all form usage across the app. (2) If still needed, add explicit documentation of where it's used. (3) If moving to server-side validation, gradually migrate away. For now, keep the dependency and add test coverage for login form.

**Recharts metrics charts with data-heavy rendering:**
- Risk: Recharts is heavy (~40kb gzipped) and may not scale to 1000+ data points without performance issues.
- Impact: Metrics page may become slow or unresponsive with large time ranges.
- Migration plan: Consider alternative charting library (e.g., Lightweight Charts, Chart.js with downsampling) if metrics scaling becomes critical. For now, implement data downsampling in the component.

**Motion v12 animation library size:**
- Risk: Motion is ~12kb gzipped; if animations degrade performance, removing it could save that size.
- Impact: Not a current issue (animations working well), but a future consideration if perf becomes critical.
- Migration plan: Motion is well-integrated. No plan to migrate, but if needed, could fall back to Framer Motion or CSS animations.

---

## Missing Critical Features

**Cluster credential rotation / expiration:**
- Problem: No mechanism to rotate K8s cluster credentials (AWS IAM keys expire, Azure tokens refresh, kubeconfigs rotate). Stale credentials = cluster becomes unreachable silently.
- Blocks: (1) Security compliance (credentials should rotate quarterly). (2) Long-term cluster health (old credentials fail over time).
- Recommendation: Add credential rotation workflow. When a credential is rotated in the cluster's auth system, the dashboard should prompt the user to update the stored credential.

**Multi-cluster authorization / RBAC:**
- Problem: Authorization model allows admin to do anything, but doesn't support "cluster admin" role (can manage cluster A but not B) or "namespace viewer" (can view namespace foo but not bar).
- Blocks: (1) Multi-tenant scenarios where teams manage separate clusters. (2) Fine-grained access control for large organizations.
- Recommendation: Extend authorization model to support cluster-level and namespace-level roles.

**Webhook delivery retries and dead-letter queue:**
- Problem: Webhooks are sent once; if delivery fails, there's no retry mechanism. Failed events are lost.
- Blocks: (1) Integrations relying on guaranteed webhook delivery (e.g., Slack notifications on cluster failure).
- Recommendation: Add webhook retry logic with exponential backoff. Store failed deliveries in a dead-letter queue for manual replay.

**Database audit log retention and querying:**
- Problem: Audit logs are written but no UI to query them efficiently. No retention policy.
- Blocks: (1) Compliance audits (SOC2, HIPAA) that require audit trail access. (2) Incident investigations.
- Recommendation: Add Audit Log page with filters (user, action, object, timestamp). Implement retention policy (keep 1y).

---

## Test Coverage Gaps

**K8s client initialization and error paths:**
- What's not tested: (1) Lazy initialization of KubeConfig. (2) Error handling when kubeconfig is missing. (3) Recovery when K8s API temporarily unreachable.
- Files: `apps/api/src/lib/k8s.ts`
- Risk: Regressions in K8s connectivity could break the entire app without warning.
- Priority: High

**tRPC authorization model for all mutation endpoints:**
- What's not tested: (1) Each mutation endpoint properly enforces protectedProcedure or adminProcedure. (2) Unauthorized users cannot mutate data. (3) Object-level authorization checks work correctly.
- Files: `apps/api/src/routers/*.ts`
- Risk: Auth bypass vulnerability could go undetected.
- Priority: High

**E2E: Fresh cluster deployment + seeding workflow:**
- What's not tested: (1) Helm install → empty DB → seeding → users can login. (2) Admin user created correctly.
- Files: `tests/e2e/`, `charts/voyager/`
- Risk: Deployment may succeed but app is unusable due to missing seed data.
- Priority: Medium

**Metrics endpoint parallel K8s API calls:**
- What's not tested: (1) All K8s API calls succeed. (2) Partial failures handled gracefully. (3) Response time is reasonable.
- Files: `apps/api/src/routers/metrics.ts`
- Risk: Metrics page may hang or return stale data without visibility.
- Priority: Medium

**Error boundary retry functionality:**
- What's not tested: (1) Error boundary catches unhandled errors. (2) Retry button re-runs failed code correctly. (3) Sentry reporting works.
- Files: `apps/web/src/app/error.tsx`
- Risk: Silent errors may go unreported if error boundary fails.
- Priority: Low

---

*Concerns audit: 2026-03-26*
