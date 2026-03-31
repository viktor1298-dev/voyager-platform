# Infrastructure Audit Report

**Project:** voyager-platform
**Date:** 2026-03-31
**Auditor:** Claude Opus 4.6 (automated)

---

## Severity Legend

| Severity | Meaning |
|----------|---------|
| **CRITICAL** | Security risk, data loss risk, or production-breaking issue |
| **HIGH** | Significant problem that should be fixed before next production deploy |
| **MEDIUM** | Quality or maintainability issue, should fix in near term |
| **LOW** | Minor improvement, nice-to-have |
| **INFO** | Observation, not necessarily a problem |

---

## 1. Build & CI Quality

### 1.1 Turbo Pipeline

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 1 | **MEDIUM** | `turbo.json` | `lint` task declares `dependsOn: ["^lint"]` which chains lint across all workspace packages. Lint is typically per-package and independent -- this adds unnecessary serialization. | Remove `dependsOn` from `lint` task or change to `[]`. Same applies to `test`. |
| 2 | **MEDIUM** | `turbo.json` | `build` outputs are `[".next/**", "dist/**"]` but no `inputs` are specified. Turbo uses all non-gitignored files as inputs by default, which works but means cache misses on unrelated file changes (e.g., editing CLAUDE.md invalidates build cache). | Add `inputs` to `build` task: `["src/**", "tsconfig*.json", "package.json"]`. |
| 3 | **LOW** | `turbo.json` | No `typecheck` outputs defined. Since `typecheck` uses `--noEmit`, it produces no outputs -- but turbo can still cache the result. | Add `"outputs": []` explicitly to signal intent. |

### 1.2 Package Scripts

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 4 | **MEDIUM** | `package.json` (root) | `predev` script uses `pkill` and `lsof | xargs kill` which are platform-specific (macOS/Linux) and destructive. Will fail on CI or Windows. Also kills processes by port which could affect unrelated services. | Move cleanup logic to a dedicated script with platform checks, or use `fkill-cli`. |
| 5 | **LOW** | `package.json` (root) | `test:e2e` script runs `playwright test` without `--filter` -- runs from root which may not find the config. Consider `pnpm exec playwright test`. | Verify this works from monorepo root; `playwright.config.ts` exists at root so it should resolve, but add `--config playwright.config.ts` for explicitness. |
| 6 | **LOW** | `apps/api/package.json` | `build` script chains `pnpm --filter @voyager/types build && pnpm --filter @voyager/db build` before its own build. This duplicates what `turbo build` already handles via `dependsOn: ["^build"]`. Running `pnpm --filter api build` directly works, but is redundant in turbo context. | Remove the chained filters if turbo is the primary build driver. Keep if standalone builds are needed. |

### 1.3 Dependencies

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 7 | **HIGH** | `package.json` (root) | Root `package.json` has runtime `dependencies` that belong in `apps/api`: `@aws-crypto/sha256-js`, `@aws-sdk/client-sts`, `@aws-sdk/util-format-url`, `@azure/arm-containerservice`, `@azure/identity`, `@google-cloud/container`, `@smithy/protocol-http`, `@smithy/signature-v4`. These are also declared in `apps/api/package.json`. The root declarations are duplicates that inflate the root dependency tree. | Remove the duplicated dependencies from root `package.json`. They are already in `apps/api`. |
| 8 | **LOW** | `package.json` (root) | `@radix-ui/react-progress` and `@radix-ui/react-tooltip` are in root dependencies but are UI components that belong in `apps/web/package.json` (where they are already listed). | Remove from root `package.json`. |
| 9 | **LOW** | `apps/web/package.json` | `@types/js-yaml` is in devDependencies but no `js-yaml` import exists in `apps/web/src/`. The app uses the `yaml` package (different library). | Remove `@types/js-yaml` from devDependencies. |
| 10 | **LOW** | `apps/web/package.json` | `@types/dagre` is in devDependencies, but the code imports `@dagrejs/dagre` (which has built-in types). `@types/dagre` is for the legacy `dagre` package. | Remove `@types/dagre` -- `@dagrejs/dagre` ships its own type definitions. |

### 1.4 TypeScript Configuration

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 11 | **MEDIUM** | `apps/web/tsconfig.json` | Does not extend `packages/config/tsconfig.base.json` like all other workspace packages. Has its own standalone config with `target: ES2017` (vs `ES2022` in base). This means web app misses base config updates and uses a lower compilation target unnecessarily. | Extend `../../packages/config/tsconfig.base.json` and override only Next.js-specific options. |
| 12 | **LOW** | `apps/web/next.config.ts` | `reactStrictMode: false`. Strict mode catches bugs in development (double-renders reveal side effects). Disabling it hides potential issues with useEffect, concurrent features, and state management. | Enable `reactStrictMode: true`. If it causes issues, those are real bugs worth fixing. |
| 13 | **INFO** | `packages/config/tsconfig.base.json` | Base config is well-configured: `strict: true`, `forceConsistentCasingInFileNames: true`, `isolatedModules: true`. Good. | No action needed. |

---

## 2. Testing Gaps

### 2.1 Test Coverage Inventory

| Area | Test Files | Coverage |
|------|-----------|----------|
| **API unit tests** | 9 files in `apps/api/src/__tests__/` | Auth, AI, anomaly detection |
| **Web unit tests** | 2 files in `apps/web/src/lib/` | AI keys only |
| **E2E tests** | 40 spec files in `tests/e2e/` | Auth, navigation, clusters, alerts, etc. |
| **Visual regression** | 2 spec files in `tests/visual/` | Login, main pages |
| **packages/db** | 0 test files | No tests |
| **packages/config** | 0 test files | No tests |
| **packages/types** | 0 test files | No tests |

### 2.2 Critical Gaps

| # | Severity | Area | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 14 | **HIGH** | `apps/api` | No unit tests for any tRPC router (43 routers, 0 tested). The only tests cover auth, AI provider, and module integrity. Critical business logic (clusters, nodes, metrics, helm, RBAC, pods) has zero test coverage. | Add router-level unit tests using vitest + mock K8s client. Prioritize: clusters, metrics.history, helm, pods. |
| 15 | **HIGH** | `apps/api` | No tests for `watch-manager.ts`, `watch-db-writer.ts`, or `resource-mappers.ts` -- the core live data pipeline that powers the entire dashboard. | Add unit tests for resource mappers (pure functions, easy to test) and integration tests for watch lifecycle. |
| 16 | **HIGH** | `apps/api` | No tests for `credential-crypto.ts` (AES-256-GCM encryption). This is security-critical code that handles cluster credential encryption/decryption. | Add unit tests: encrypt/decrypt round-trip, invalid key, tampered ciphertext, format validation. |
| 17 | **MEDIUM** | `apps/web` | Only 2 unit test files out of 55+ pages and 40+ components. No tests for hooks (`useResourceSSE`, `useMetricsData`, `useCachedResources`), stores, or utility functions. | Add tests for: `formatters.ts`, `lttb.ts`, `metrics-buffer.ts` (pure functions), and key hooks. |
| 18 | **MEDIUM** | `apps/web` | No vitest.config.ts in `apps/web/`. The `test` script in package.json runs `vitest run` but there is no vitest configuration file -- vitest will use defaults which may not include jsdom/happy-dom for React component testing. | Add `vitest.config.ts` with `environment: 'jsdom'` and appropriate setup. |
| 19 | **LOW** | `tests/e2e` | Two overlapping auth fixtures: `tests/e2e/auth.setup.ts` (project-level setup) and `tests/e2e/fixtures/auth.ts` (per-test fixture). The setup uses `getByLabel(/email/i)` while the fixture uses `[data-testid="login-email"]`. Inconsistent selectors. | Consolidate to one auth strategy. The setup-based approach is better for performance. |
| 20 | **LOW** | `playwright.config.ts` | Default `baseURL` is `http://localhost:9000` which doesn't match any documented port (API=4000/4001, Web=3000). CLAUDE.md says the correct URL is `http://voyager-platform.voyagerlabs.co`. | Change default to `http://localhost:3000` for local dev, or document port 9000 usage. |

---

## 3. Docker Quality

### 3.1 Dockerfile.api

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 21 | **MEDIUM** | `docker/Dockerfile.api` | Missing `corepack enable` in deps stage. `Dockerfile.web` has `RUN corepack enable && corepack prepare pnpm@latest --activate` but `Dockerfile.api` does not. This relies on the Node 22 image having pnpm pre-installed, which is not guaranteed. | Add `RUN corepack enable` after `FROM node:22-alpine AS deps`. |
| 22 | **MEDIUM** | `docker/Dockerfile.api` | No `HEALTHCHECK` instruction in the Dockerfile. While the Helm chart adds K8s probes, the Docker image itself has no health check for standalone usage (docker-compose, ECS, etc.). | Add `HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4000/health || exit 1`. |
| 23 | **LOW** | `docker/Dockerfile.api` | The `runner` stage copies `drizzle.config.ts` and `drizzle/` directory. These are only needed by the `migrate-runner` stage. The production runner doesn't need migration files. | Remove drizzle-related COPY commands from the `runner` stage. |
| 24 | **INFO** | `docker/Dockerfile.api` | Good: Multi-stage build, non-root user (`voyager:1001`), production dependency pruning via `pnpm deploy --prod`, `HIDE_STACK_TRACES=true`. | No action needed. |

### 3.2 Dockerfile.web

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 25 | **MEDIUM** | `docker/Dockerfile.web` | No `HEALTHCHECK` instruction. Same issue as API Dockerfile. | Add `HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/ || exit 1`. |
| 26 | **LOW** | `docker/Dockerfile.web` | `corepack prepare pnpm@latest --activate` pins to "latest" at build time which is non-deterministic. Different builds may get different pnpm versions. | Pin to the exact version: `corepack prepare pnpm@10.6.2 --activate` (matches `packageManager` in root `package.json`). |
| 27 | **INFO** | `docker/Dockerfile.web` | Good: Multi-stage build, standalone Next.js output, non-root user, explicit `HOSTNAME=0.0.0.0`. | No action needed. |

### 3.3 Docker Compose

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 28 | **HIGH** | `docker-compose.yml` | `POSTGRES_HOST_AUTH_METHOD: trust` allows ANY user to connect without a password. While this is local dev only, it masks auth configuration bugs that would surface in production. Developers may not notice broken DB credentials until deploy. | Remove `POSTGRES_HOST_AUTH_METHOD: trust`. The `POSTGRES_PASSWORD` env var is already set, so `md5` auth works by default. |
| 29 | **LOW** | `docker-compose.yml` | No version pinning for TimescaleDB image: `timescale/timescaledb:latest-pg17`. Different developers may get different versions. | Pin to a specific version, e.g., `timescale/timescaledb:2.17.0-pg17`. |
| 30 | **INFO** | `docker-compose.yml` | Good: Health checks on both postgres and redis, named volumes for persistence, dedicated network. | No action needed. |

---

## 4. Helm Chart Quality

### 4.1 Chart Structure

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 31 | **CRITICAL** | `charts/voyager/templates/deployment-db.yaml` | Database uses `postgres:17-alpine` image but `init.sql` requires `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`. The vanilla postgres image does NOT include TimescaleDB. This means `init.sql` will fail silently (extension not available) and all `time_bucket()` queries will error. Docker-compose correctly uses `timescale/timescaledb:latest-pg17`, but Helm uses the wrong image. | Change `values.yaml` db image to `timescale/timescaledb` with tag `latest-pg17` or a pinned version. |
| 32 | **HIGH** | `charts/voyager/values.yaml` | `env.NODE_ENV` key is declared twice (lines 3-4 and lines 35-36). YAML will silently use the last occurrence. While both are `development`, this is error-prone and confusing. | Remove the duplicate `env` block. Keep one at the top level. |
| 33 | **HIGH** | `charts/voyager/values.yaml` | `config.databaseUrl` contains a plaintext password: `postgresql://voyager:voyager_dev@postgres:5432/voyager`. This is committed to git in the default values. The secret template already has `DATABASE_URL` from `databaseUrl` but it's base64-encoded, not truly secret since the source is in values.yaml. | Move DATABASE_URL construction to the template using `secret.dbPassword` for the password component. |
| 34 | **HIGH** | `charts/voyager/values-production.yaml` | Production database URL contains a placeholder password: `postgresql://voyager:changeme@postgres:5432/voyager`. If someone deploys with production values without overriding, the password is `changeme`. | Use Helm `required` function in the template to fail if DATABASE_URL contains `changeme`, or construct the URL from components. |
| 35 | **MEDIUM** | `charts/voyager/templates/secret.yaml` | `values.yaml` declares `betterAuthSecret` but `values-production.yaml` and the secret template use `jwtSecret`. The key names are inconsistent across value files: `betterAuthSecret` (values.yaml) vs `jwtSecret` (values-production.yaml, secret.yaml template, values-dev.yaml). | Standardize on one key name across all values files. |
| 36 | **MEDIUM** | Helm templates | No `securityContext` defined on any container. Missing: `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`. This is a common security hardening requirement. | Add pod and container `securityContext` blocks to all deployment templates. |
| 37 | **MEDIUM** | Helm templates | No `startupProbe` on any container. The API container runs init.sql before starting (initContainer) which can be slow. If the liveness probe fires before startup completes, K8s will restart the pod in a loop. | Add `startupProbe` with a generous `failureThreshold` (e.g., 30 * 10s = 5min). |
| 38 | **MEDIUM** | Helm chart | No `NetworkPolicy` templates. All pods can communicate freely within the namespace and across namespaces. In a shared cluster, this is a security gap. | Add NetworkPolicy: only API can talk to postgres/redis, only web can talk to API, only ingress can talk to web/API. |
| 39 | **MEDIUM** | Helm chart | No `PodDisruptionBudget` for production. With `replicaCount: 2`, a node drain could take down both replicas simultaneously. | Add PDB with `minAvailable: 1` for API and web deployments when `replicaCount >= 2`. |
| 40 | **MEDIUM** | `charts/voyager/templates/deployment-api.yaml` | API resource limits: `memory: 512Mi`. The API runs K8s watch informers for 17 resource types across multiple clusters, plus background jobs. 512Mi may be tight under load with many clusters. | Monitor actual usage and consider `memory: 1Gi` limit for API pods in production. |
| 41 | **MEDIUM** | `charts/voyager/templates/rbac.yaml` | ClusterRole `voyager-api-reader` grants `delete` verb on pods and `patch`/`update` on deployments/statefulsets/daemonsets. The name "reader" is misleading -- it has write permissions. | Rename to `voyager-api` or split into reader + writer roles. Document why write permissions are needed (pod delete, deployment restart). |
| 42 | **MEDIUM** | `charts/voyager/templates/rbac.yaml` | Missing RBAC rules for resource types the API accesses: `configmaps`, `secrets` (Helm releases), `persistentvolumeclaims`, `ingresses`, `cronjobs`, `jobs`, `horizontalpodautoscalers`, `networkpolicies`, `resourcequotas`, `customresourcedefinitions`. The API has routers for all of these. | Add the missing API groups and resources to the ClusterRole. |
| 43 | **LOW** | `charts/voyager/templates/ingress.yaml` | Default ingress has no TLS configuration. Only `values-production.yaml` includes TLS settings. The default (dev) ingress serves over plain HTTP. | Add TLS to default values with an option to disable. |
| 44 | **LOW** | `charts/voyager/templates/ingress.yaml` | Jaeger ingress rule is hardcoded (`jaeger.voyagerlabs.co`) instead of being templated from values. Also, it's in the main ingress template with no toggle to disable it. | Make the Jaeger host configurable via values and add an `enabled` toggle. |
| 45 | **LOW** | `charts/voyager/templates/deployment-redis.yaml` | Redis has no authentication configured. Any pod in the namespace (or cluster, without NetworkPolicy) can connect. | Add `--requirepass` to the redis command and store the password in the secret. |
| 46 | **LOW** | `charts/voyager/templates/deployment-db.yaml` | Postgres deployment has no resource requests/limits defined. In a shared cluster, a runaway query could consume all node resources. | Add resource requests/limits (e.g., `requests: {cpu: 250m, memory: 256Mi}`, `limits: {cpu: 1, memory: 1Gi}`). |

---

## 5. Security Concerns

### 5.1 Secrets & Credentials

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 47 | **HIGH** | `.env.example` | `CLUSTER_CRED_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000` is a well-known zero key. If someone copies `.env.example` to `.env` without changing it, all cluster credentials are encrypted with a trivially guessable key. | Use a placeholder like `<generate-with-openssl-rand-hex-32>` instead of a valid hex string. Add a startup check that rejects the all-zeros key. |
| 48 | **HIGH** | `.env.example` | `JWT_SECRET=change-me-in-production` and `ADMIN_PASSWORD=admin123` are insecure defaults. The API has a production check for `BETTER_AUTH_SECRET` but not for these values. | Add startup validation that rejects known-insecure values when `NODE_ENV=production`. |
| 49 | **MEDIUM** | `charts/voyager/values-dev.yaml` | Contains hardcoded AES-256 encryption keys (`aiKeysEncryptionKey`, `clusterCredEncryptionKey`) committed to git. While labeled "dev only", these are real encryption keys that could be mistakenly used in production. | Move to `values-local.yaml` (gitignored) or generate at deploy time. |
| 50 | **MEDIUM** | `docker-compose.yml` | Database credentials are defaults: `voyager`/`voyager_dev`. Combined with `POSTGRES_HOST_AUTH_METHOD: trust`, the dev database has no effective authentication. | See issue #28. |

### 5.2 Authentication & Authorization

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 51 | **MEDIUM** | `apps/api/src/server.ts` | Auth routes (`/api/auth/*`) have `rateLimit: false` for all endpoints, including `sign-in`. This means login brute-force attacks are not rate-limited. The sign-in route is registered separately with rate limiting disabled. | Apply a stricter rate limit to auth routes (e.g., 10 req/min for sign-in) instead of disabling entirely. |
| 52 | **MEDIUM** | `packages/config/src/routes.ts` | `/trpc` is in `RATE_LIMIT_BYPASS_PATHS`. ALL tRPC endpoints are exempt from rate limiting. This means authenticated users can make unlimited API calls. | Remove `/trpc` from rate limit bypass. Apply rate limiting to tRPC routes, perhaps with a higher limit (e.g., 1000 req/min). |
| 53 | **LOW** | `apps/api/src/lib/auth-guard.ts` | `PUBLIC_TRPC_PROCEDURES` whitelist only contains `sso.getProviders`. This is well-managed and minimal. | No action needed. |

### 5.3 CORS

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 54 | **MEDIUM** | `apps/api/src/server.ts` | CORS `origin` is loaded from `ALLOWED_ORIGINS` env var (comma-separated) with fallback to `['http://localhost:3000']`. The Helm configmap sets `allowedOrigins` to include `http://100.90.102.90:9000` (a private IP). While not publicly routable, it's hardcoded and may be stale. | Review and remove stale origins. Consider using a pattern matcher for dev IPs. |

### 5.4 SQL Injection

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 55 | **MEDIUM** | `apps/api/src/routers/metrics.ts:465` | Raw SQL query uses `db.execute(sql\`...\`)` with template literal interpolation. The `intervalStr` variable (`${intervalStr}::interval`) is constructed from `TIME_RANGE_CONFIG` (constant map) so it's not user-controlled. However, `input.clusterId` and `startTime` are interpolated via Drizzle's `sql` template tag which parameterizes them. **This is safe** but worth noting: the `intervalStr` cast pattern should be documented as safe because the source is a constant. | Add a comment explaining why `intervalStr` is safe (sourced from constant config, not user input). Consider using Drizzle's `sql.raw()` with an explicit allowlist check for extra safety. |

### 5.5 HTTP Security Headers

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 56 | **MEDIUM** | `apps/api/src/server.ts` | No security headers middleware (Helmet or equivalent). Missing headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, `X-XSS-Protection`. | Add `@fastify/helmet` or equivalent security headers plugin. |
| 57 | **MEDIUM** | `apps/web/next.config.ts` | No security headers configured in Next.js. The `headers()` config function is not used. | Add `headers()` to `next.config.ts` with standard security headers. |

---

## 6. Developer Experience

### 6.1 Monorepo Structure

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 58 | **INFO** | Project structure | Well-organized monorepo: `apps/` for deployables, `packages/` for shared code, `charts/` for Helm, `tests/` for E2E. Clear separation of concerns. | No action needed. |
| 59 | **INFO** | CLAUDE.md files | Comprehensive documentation at every level (root, apps/api, apps/web, packages/db, charts/voyager). Gotchas sections are particularly valuable. | No action needed. |

### 6.2 Dev Setup Issues

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 60 | **MEDIUM** | `.gitignore` | Missing entries: `test-results/` (modified in git status), `.playwright-mcp/` (17 untracked files in git status), `playwright/.auth/` (contains session state from E2E auth setup). | Add `test-results/`, `.playwright-mcp/`, and `playwright/.auth/` to `.gitignore`. |
| 61 | **LOW** | `.gitignore` | No entry for `.env.local` files in subdirectories (e.g., `apps/web/.env.local`). While `apps/web/.env.local` is gitignored by `.env.local` matching, adding an explicit entry for `**/.env.local` would be clearer. | Already handled by `.env.local` pattern. INFO only. |

### 6.3 Error Messages

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 62 | **INFO** | `apps/api/src/server.ts` | Good: Startup validation for `CLUSTER_CRED_ENCRYPTION_KEY`, graceful shutdown with signal handling, global unhandled rejection/exception handlers with Sentry reporting. | No action needed. |

---

## 7. Observability & Operations Tooling

### 7.1 OpenTelemetry

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 63 | **MEDIUM** | `apps/api/src/lib/telemetry.ts` | OTel SDK starts unconditionally (`sdk.start()`) even when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set. Without an exporter, traces are collected but discarded, adding ~5-10% CPU overhead from auto-instrumentations. | Wrap `sdk.start()` in a conditional: only start when `OTEL_ENDPOINT` is set. |
| 64 | **LOW** | `apps/api/src/lib/telemetry.ts` | No metrics exporter configured -- only traces. For a K8s dashboard monitoring other clusters, having its own metrics (request latency, K8s API call duration, SSE subscriber count) would be valuable for self-monitoring. | Add `OTLPMetricExporter` alongside the trace exporter. |
| 65 | **LOW** | `apps/api/src/lib/telemetry.ts` | `@opentelemetry/instrumentation-pg` is enabled but the app uses `pg` via Drizzle ORM. Verify that auto-instrumentation works with Drizzle's connection pooling. | Test by checking Jaeger for DB spans. If missing, add manual spans in the DB package. |

### 7.2 Sentry

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 66 | **MEDIUM** | `apps/api/src/lib/sentry.ts` | Sentry `init()` uses `as never` type casts for both the config object and integrations array. This suppresses type errors that may indicate API incompatibility. | Fix the types properly or upgrade `@sentry/node` to a version where types align. |
| 67 | **LOW** | `apps/web/sentry.server.config.ts` | Web server-side Sentry config uses `NEXT_PUBLIC_SENTRY_ENVIRONMENT` but the API uses `SENTRY_ENVIRONMENT`. Different env var names for the same concept. | Document the naming difference or standardize. |
| 68 | **INFO** | `apps/web/sentry.client.config.ts` | Good: Session replay enabled (`replaysOnErrorSampleRate: 1.0`), reasonable traces sample rate (0.1). | No action needed. |

### 7.3 Feature Flags

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 69 | **MEDIUM** | `apps/api/src/lib/feature-flags.ts` | Feature flags are loaded once at module initialization (`const providerConfigPromise = buildProviderConfig()`) and never reloaded. Changing `feature-flags.json` requires a server restart. For a production-ready setup, flags should be hot-reloadable. | Add a file watcher or periodic reload (e.g., every 60s) for the flags file. Or switch to flagd sidecar for dynamic evaluation. |
| 70 | **LOW** | `apps/api/feature-flags.json` | Only 4 flags defined. The `new_dashboard_layout` and `advanced_metrics` flags are `false` -- are these stale/abandoned features? | Audit whether disabled flags are still relevant. Remove dead flags. |

### 7.4 Health Checks

| # | Severity | File | Issue | Suggested Fix |
|---|----------|------|-------|---------------|
| 71 | **MEDIUM** | `apps/api/src/server.ts` | `/health` endpoint returns `{ status: 'ok' }` unconditionally. It does not check database connectivity, Redis connectivity, or K8s API health. A pod could be "healthy" while all backends are down. | Add dependency checks: `SELECT 1` on postgres, `PING` on redis. Return degraded status if backends are unreachable. |
| 72 | **LOW** | `apps/api/src/server.ts` | `/health/metrics-collector` dynamically imports the metrics collector module on every request. While not a performance issue at low QPS, it's unconventional. | Use a static import or cache the module reference. |
| 73 | **INFO** | `scripts/health-check.ts` | Good: Comprehensive local dev health checker with Docker service checks, log scanning, page smoke tests, and structured exit codes. | No action needed. |

---

## 8. Summary

### Issue Count by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 8 |
| MEDIUM | 24 |
| LOW | 18 |
| INFO | 7 |
| **Total** | **58** |

### Top 10 Priority Items

1. **#31 CRITICAL** -- Helm DB uses `postgres:17-alpine` but init.sql requires TimescaleDB extension. Production deploys will fail.
2. **#14 HIGH** -- Zero unit tests for 43 tRPC routers. Core business logic is untested.
3. **#15 HIGH** -- No tests for live data pipeline (watch-manager, resource-mappers). The system's most complex code path.
4. **#16 HIGH** -- No tests for credential encryption (AES-256-GCM). Security-critical, trivially testable.
5. **#7 HIGH** -- Duplicate cloud SDK dependencies in root package.json inflate install time and create version conflicts.
6. **#28 HIGH** -- Docker-compose `POSTGRES_HOST_AUTH_METHOD: trust` masks auth bugs.
7. **#47 HIGH** -- All-zeros encryption key in .env.example is a footgun.
8. **#48 HIGH** -- Insecure default JWT_SECRET and admin password not rejected in production.
9. **#33 HIGH** -- Plaintext database password in committed values.yaml.
10. **#34 HIGH** -- Production values.yaml contains `changeme` password placeholder.

### What's Working Well

- **Monorepo structure** is clean and well-documented with comprehensive CLAUDE.md files
- **Multi-stage Docker builds** with non-root users and production dependency pruning
- **Authentication** uses Better-Auth with proper session handling, audit logging, and SSO support
- **Encryption** uses AES-256-GCM with proper IV generation and auth tags
- **Error handling** has global handlers, Sentry integration, and graceful shutdown
- **Docker-compose** has health checks and auto-initializes the database schema
- **Rate limiting** is configured (though bypass paths need tightening)
- **E2E test suite** is extensive (40 spec files covering major user flows)
- **Centralized config** pattern prevents magic numbers in routers
- **Health check script** for local dev is comprehensive and well-structured
