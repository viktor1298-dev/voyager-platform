# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Voyager Platform is a **Kubernetes operations dashboard** — multi-cloud cluster management (AWS EKS, Azure AKS, GCP GKE), monitoring, alerting, and AI-assisted ops. Stack: Next.js 16 + Fastify 5 + tRPC 11 + PostgreSQL + Redis on Kubernetes.

---

## Monorepo Structure

```
voyager-platform/
├── apps/
│   ├── api/                    # Fastify 5 backend (tRPC 11, Drizzle ORM, Better-Auth)
│   │   └── src/
│   │       ├── server.ts       # Entry point — DO NOT add migrate() here
│   │       ├── routers/        # tRPC routers (28 routes: clusters, pods, nodes, alerts, ai, etc.)
│   │       ├── routes/         # Non-tRPC routes (ai-stream, mcp, metrics-stream)
│   │       ├── jobs/           # Background jobs (health-sync, alert-evaluator, metrics, node-sync, event-sync, deploy-smoke-test, metrics-stream-job)
│   │       ├── config/         # Backend-only config (job intervals, K8s settings)
│   │       └── lib/            # Auth, K8s watchers, telemetry, sentry, cache, authorization, error-handler, cache-keys, health-checks
│   └── web/                    # Next.js 16 frontend (React 19, Tailwind 4)
│       └── src/
│           ├── app/            # App Router pages (clusters, alerts, settings, ai, etc.)
│           ├── components/     # UI components (Sidebar, AppLayout, DataTable, charts)
│           ├── hooks/          # Custom hooks (useMetricsData, useMetricsSSE)
│           ├── lib/            # Utilities (trpc client, formatters, animation-constants, metrics-buffer, lttb)
│           └── config/         # navigation.ts (6 sidebar items)
├── packages/
│   ├── db/                     # Drizzle ORM schema + migrations
│   ├── config/                 # Shared config (SSE, AI, routes, cache TTLs, validation limits)
│   ├── types/                  # Shared TypeScript types (SSE events, AI contracts)
│   └── ui/                     # Shared UI components (shadcn/ui)
├── charts/voyager/             # Helm chart for K8s deployment
│   ├── sql/init.sql            # 🔴 Schema source of truth
│   └── templates/              # K8s manifests
├── docker/                     # Dockerfile.api, Dockerfile.web
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   └── visual/                 # Visual regression tests
└── scripts/                    # Utility scripts (health-check.ts)
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Next.js 16, React 19, Tailwind 4, Motion 12, shadcn/ui, TanStack Query, Zustand 5, cmdk, nuqs |
| **Backend** | Fastify 5, tRPC 11, Drizzle ORM, Better-Auth, Node.js 22 |
| **Database** | PostgreSQL 17 + TimescaleDB |
| **Cache/Queue** | Redis 7 + BullMQ 5 |
| **Feature Flags** | OpenFeature + flagd (`apps/api/feature-flags.json`) |
| **Observability** | Sentry (both apps), OpenTelemetry (API) |
| **Infra** | Kubernetes (minikube for local), Helm, Docker |
| **Testing** | Playwright (E2E + visual), Vitest (unit), Biome (lint) |
| **Build** | Turborepo, pnpm 10 |

**App URL:** `http://voyager-platform.voyagerlabs.co`

## Development Commands

```bash
# First time setup
pnpm install
cp .env.example .env            # Copy env vars (edit K8S_ENABLED, PORT as needed)

# Local infra (Postgres + Redis) — required before dev
# docker compose auto-initializes DB schema via init.sql on first start
docker compose up -d

# From monorepo root
pnpm dev                    # Start all (turbo) — API loads .env via --env-file
pnpm build                  # Build all
pnpm --filter api dev       # Backend only (tsx watch, port from .env)
pnpm --filter web dev       # Frontend only (next dev, port 3000)

# Health verification
pnpm health:check           # Post-start health check (local dev)
pnpm health:check --no-docker  # Skip Docker checks

# Testing
pnpm test                   # Vitest unit tests (all packages)
pnpm --filter api test -- src/__tests__/auth.test.ts   # Single test file
pnpm test:e2e               # Playwright E2E tests
pnpm test:visual            # Playwright visual regression tests
pnpm test:visual:update     # Update visual snapshots

# Quality
pnpm lint                   # Biome lint
pnpm typecheck              # TypeScript check

# Database
pnpm db:generate            # Generate Drizzle migrations
pnpm db:push                # Push schema to DB
pnpm db:migrate             # Run migrations
pnpm db:seed                # Seed data (5 clusters, 37 nodes, 30 events)
pnpm --filter api seed:admin  # Seed admin user only
```

### Local Dev Without K8s

The app runs locally without a K8s cluster. Set `K8S_ENABLED=false` in `.env` to skip watchers and background jobs:

```bash
docker compose up -d          # Postgres + Redis + auto-init schema
pnpm dev                      # API (port from .env) + Web (port 3000)
pnpm db:seed                  # Optional: seed mock clusters/nodes/events
# Login: admin@voyager.local / admin123
```

**Note:** Port 4000 may conflict with NoMachine (nxd). Set `PORT=4001` in `.env` and `NEXT_PUBLIC_API_URL=http://localhost:4001` in `apps/web/.env.local`.

## Code Style (Biome)

- 2-space indent, 100-char line width, single quotes, semicolons as-needed
- All packages are ESM (`"type": "module"`) — use `.js` extensions in imports even for `.ts` files
- Workspace packages use `@voyager/` prefix: `@voyager/db`, `@voyager/types`, `@voyager/config`
- Zod v4 (^4.3.6): `z.record()` requires TWO arguments — `z.record(z.string(), z.unknown())`, not `z.record(z.unknown())`

## 🚨 IRON RULES — Read These First

1. **NEVER add `migrate()` or schema init to `server.ts`** — Schema is managed exclusively via `charts/voyager/sql/init.sql`. The server.ts comment says this explicitly.

2. **NEVER hardcode `localhost` in E2E tests** — Always use `BASE_URL` env var: `process.env.BASE_URL || 'http://voyager-platform.voyagerlabs.co'`

3. **Deploy = `helm uninstall` + `helm install`** — NEVER `helm upgrade`. Fresh install every time. Bundle verify after every deploy before running E2E.

4. **ALL Discord messages use Components v2** — Never send plain text to Discord channels.

5. **E2E gate: 0 failures** — Zero tolerance. No skips, no partial passes.

6. **Code review gate: 10/10** — No merge without Lior's 10/10 approval.

7. **QA gate: 8.5+/10** — Desktop QA (1920×1080) must pass before declaring phase complete.

8. **Before any UI/animation change, read `docs/DESIGN.md`** — It is the animation and interaction design source of truth. All hover states, card effects, button feedback, chart animations, and status indicators MUST follow the standards defined there. The design style is "Confident & Expressive" (Raycast/Arc Style B).

## Architecture

### Data Flow

```
Browser → Next.js (SSR/CSR) → tRPC Client
                                    ↓
                              tRPC Server (Fastify)
                              ↙        ↘
                     PostgreSQL      Kubernetes API
                     (Drizzle)       (@kubernetes/client-node)
                         ↑
                      Redis (cache)
```

### Backend Layers

- **routers/** → **services** → **lib/** (dependency direction; routers can skip services to call lib directly)
- **lib/** has no dependencies on routers or services
- tRPC procedures use `publicProcedure`, `protectedProcedure`, `adminProcedure`, or `authorizedProcedure` middleware
- Non-tRPC routes: `ai-stream` (SSE streaming), `mcp` (MCP protocol), `metrics-stream` (SSE live metrics)
- tRPC client uses `httpLink` (NOT `httpBatchLink`) — see Gotcha #1
- Background jobs: `health-sync`, `alert-evaluator`, `metrics-history-collector`, `node-sync`, `event-sync`, `deploy-smoke-test`, `metrics-stream-job`
- **All sync jobs run regardless of `K8S_ENABLED`** — only K8s watchers and deploy-smoke-test are gated (see Gotcha #14)

### Key Abstractions

| Abstraction | Location | Pattern |
|-------------|----------|---------|
| **Cluster Client Pool** | `api/src/lib/cluster-client-pool.ts` | Lazy-loaded per-cluster K8s clients; caches KubeConfig, handles credential decryption for AWS/Azure/GKE |
| **Cluster Watch Manager** | `api/src/lib/cluster-watch-manager.ts` | K8s informers per cluster → emits to `voyagerEmitter`; no polling |
| **Event Emitter** | `api/src/lib/event-emitter.ts` | Decouples K8s watchers from SSE subscriptions (one watch, many consumers) |
| **Auth** | `api/src/lib/auth.ts` | Better-Auth handler for `/api/auth/*`; session in PostgreSQL, token in cookie |
| **Authorization** | `api/src/lib/authorization.ts` | `createAuthorizationService(db).check(subject, relation, object)` — DB-backed RBAC |
| **Health Checks** | `api/src/lib/health-checks.ts` | Pure-function log scanner, startup probe, page smoke, result assessment — shared by CLI and K8s job |
| **Metrics Stream Job** | `api/src/jobs/metrics-stream-job.ts` | Reference-counted K8s metrics polling — starts on first SSE subscriber, stops on last disconnect |
| **Metrics SSE Route** | `api/src/routes/metrics-stream.ts` | `/api/metrics/stream?clusterId=<uuid>` — authenticated SSE endpoint streaming live K8s metrics at 10-15s resolution |
| **Crosshair Provider** | `web/src/components/metrics/CrosshairProvider.tsx` | RAF-throttled shared crosshair state for synchronized hover across 4 metric panels |
| **Metrics Buffer** | `web/src/lib/metrics-buffer.ts` | Circular buffer (65 points max) for SSE live data with time-based eviction |
| **LTTB Downsampling** | `web/src/lib/lttb.ts` | Largest-Triangle-Three-Buckets algorithm (~50 LOC) — downsamples 500+ points to ~200 for chart perf |
| **useMetricsData** | `web/src/hooks/useMetricsData.ts` | Unified data hook — SSE for ≤15m ranges, tRPC for ≥30m — seamless switching |

### State Management

- **Server state (DB):** Clusters, nodes, alerts, users, webhooks — PostgreSQL
- **Real-time state (SSE):** Pod updates, deployment progress, metrics — EventEmitter → SSE to clients
- **Client state:** UI filters, sidebar collapse, dashboard layout — Zustand stores
- **Session:** Better-Auth cookie session (secure, httpOnly, sameSite=strict) — no JWT
- **Cache:** tRPC useQuery with `staleTime` and `refetchInterval` per endpoint

### Centralized Config

Configuration is split between shared (API + Web) and backend-only:

| File | Exports | Used By |
|------|---------|---------|
| `packages/config/src/routes.ts` | `API_ROUTES`, `AUTH_BYPASS_PATHS`, `RATE_LIMIT_BYPASS_PATHS` | server.ts, auth-guard.ts |
| `packages/config/src/cache.ts` | `CACHE_TTL` (K8S_RESOURCES_SEC, CLUSTER_CLIENT_MS, etc.) | cluster-client-pool, routers, karpenter, sso, presence |
| `packages/config/src/validation.ts` | `LIMITS` (NAME_MAX, LIST_MAX, etc.) | All tRPC routers with Zod schemas |
| `packages/config/src/sse.ts` | SSE heartbeat/reconnect constants | SSE subscriptions |
| `packages/config/src/ai.ts` | `AI_CONFIG` | AI service |
| `apps/api/src/config/jobs.ts` | `JOB_INTERVALS` | All background jobs |
| `apps/api/src/config/k8s.ts` | `K8S_CONFIG` (CLIENT_POOL_MAX, ENCRYPTION_KEY getter) | cluster-client-pool, clusters router |

**Rule:** Do NOT add new hardcoded values to routers or jobs. Add constants to the appropriate config file and import from there.

### Error Handling

- **K8s router errors:** Use `handleK8sError(error, operation)` from `api/src/lib/error-handler.ts` — standardized pattern across all K8s routers
- tRPC errors: `TRPCError { code, message }` — codes: `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_SERVER_ERROR`
- Client-caused errors (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`) → no Sentry; server errors → Sentry
- Frontend: `handleTRPCError()` in `web/src/lib/trpc.ts` redirects to `/login` on UNAUTHORIZED
- Redis failures are non-fatal: catch and fall back to direct function call
- Audit logging errors must never break the main operation: `try { logAudit(...) } catch { console.error(...) }`
- K8s connection errors: logged, don't crash API; health check returns degraded

### Cache Keys

All Redis cache keys are centralized in `apps/api/src/lib/cache-keys.ts`. **Never construct cache key strings inline** — use `CACHE_KEYS.k8sServices(clusterId, ns)` etc. This prevents key format drift and makes invalidation patterns reliable.

### Cross-Cutting

- Rate limiting: 200 req/min per IP via `@fastify/rate-limit`; whitelist: `/api/auth/`, `/health`, `/trpc`
- OpenAPI: auto-generated via `trpc-to-openapi` + `@fastify/swagger`
- Health: `/health` (always up), `/health/metrics-collector` (collector status)
- View Transitions: enabled via `next.config.ts` experimental flag + CSS `@view-transition` in globals.css
- Package optimization: `optimizePackageImports` for lucide-react, recharts, @iconify/react in next.config.ts
- QueryClient: global `staleTime: 30s` to prevent unnecessary refetches
- Chart colors: all charts use CSS custom properties (`--chart-1..5`, `--color-chart-*`, `--color-threshold-*`) from globals.css — never hardcode colors
- Container queries: `WidgetWrapper.tsx` uses `@container` for responsive dashboard widgets
- CommandPalette: dynamically imported via `next/dynamic` in providers.tsx (~20KB savings)
- Animation components: `FadeIn`, `SlideIn`, `AnimatedList`, `PageTransition`, `SuccessCheck` in `components/animations/` — reusable Motion wrappers with reduced-motion support
- Animation style: "Confident & Expressive" (B-style) — springs stiffness 350/damping 24, card hover lift y:-4, badge bounce pop, chart entry stagger, alert severity glow. See `docs/DESIGN.md`

## Current State

| Item | Details |
|------|---------|
| **Milestone** | v1.0 Reset & Stabilization — complete (tagged `v1.0`) |
| **Main branch** | Single source of truth — PRs required, force push blocked |
| **Build status** | `pnpm build` ✓, `pnpm typecheck` ✓, `pnpm test` ✓ (all passing) |
| **UI/UX audit** | 219 findings across 6 dimensions — all fixed (2026-03-27). Reports in `docs/ui-audit/` |
| **Animation enhancement** | B-style (Confident & Expressive) — 35 files, 4 waves complete (2026-03-27). Spec in `docs/superpowers/specs/`, standards in `docs/DESIGN.md` |
| **Post-start health verification** | Local CLI (`pnpm health:check`) + K8s deploy smoke test job (2026-03-27). Spec in `docs/superpowers/specs/`, plan in `docs/superpowers/plans/` |
| **Metrics Graph Redesign** | Grafana-quality metrics viz — 7 phases complete (2026-03-28). TimescaleDB time_bucket(), SSE real-time, synchronized crosshair, dark panels, LTTB downsampling. Planning in `.planning/` |
| **Next** | Visual QA of metrics page, then feature development via PRs to main |

## Database

- **Schema source of truth:** `charts/voyager/sql/init.sql` (NOT the Drizzle schema files)
- **Local dev:** `docker compose up -d` runs Postgres (timescale/timescaledb:latest-pg17) + Redis 7
- **ORM:** Drizzle (schema in `packages/db/src/schema/`)
- **Access (K8s):**
  ```bash
  kubectl exec -n voyager deploy/postgres -- psql -U voyager -d voyager -c "SELECT ..."
  ```
- **Seed after fresh install:** Required — `SELECT count(*) FROM users` = 0 means empty DB
- **Helm secrets:** `cp charts/voyager/values-local.example.yaml charts/voyager/values-local.yaml` (gitignored)

## Key Files

| Path | What |
|------|------|
| `apps/api/src/server.ts` | Fastify entry point (🔴 no migrate!) |
| `apps/api/src/routers/index.ts` | tRPC router registry (28 routes) |
| `apps/api/src/trpc.ts` | tRPC context creation, procedure definitions |
| `apps/web/src/app/clusters/[id]/layout.tsx` | Cluster detail layout with 10-tab bar |
| `apps/web/src/components/Sidebar.tsx` | Main sidebar (6 items) |
| `apps/web/src/components/AppLayout.tsx` | App shell with auto-collapse logic |
| `apps/web/src/components/providers.tsx` | All providers (tRPC, theme, LazyMotion — no `strict` flag, CommandPalette dynamically imported) |
| `apps/web/src/components/charts/chart-theme.ts` | Shared chart colors, tooltip style, threshold helpers — references `--chart-*` CSS vars |
| `apps/web/src/config/navigation.ts` | Sidebar navigation config |
| `apps/web/src/lib/trpc.ts` | tRPC client setup + `handleTRPCError` |
| `apps/web/src/lib/animation-constants.ts` | Motion v12 timing/easing/variant constants (B-style: springs, card hover, badge pop, error shake, chart anim, glow) |
| `charts/voyager/sql/init.sql` | DB schema (source of truth) |
| `apps/api/src/lib/error-handler.ts` | Shared `handleK8sError()` for all K8s routers |
| `apps/api/src/lib/cache-keys.ts` | Centralized Redis cache key builders |
| `apps/api/src/config/jobs.ts` | Background job interval constants |
| `apps/api/src/config/k8s.ts` | K8s client pool config (getter for ENCRYPTION_KEY) |
| `apps/api/src/lib/health-checks.ts` | Shared health check logic: log scanner, startup probe, page smoke, result assessment |
| `apps/api/src/jobs/deploy-smoke-test.ts` | K8s deploy smoke test — listens for deployment rollouts, runs checks, creates alerts |
| `apps/api/src/lib/k8s-client-factory.ts` | KubeConfig factory for all providers (kubeconfig, AWS, Azure, GKE, minikube) |
| `scripts/health-check.ts` | `pnpm health:check` CLI — local dev post-start health verification |
| `apps/api/src/routes/metrics-stream.ts` | SSE endpoint for live K8s metrics streaming (authenticated, per-cluster) |
| `apps/api/src/jobs/metrics-stream-job.ts` | Reference-counted MetricsStreamJob — polls K8s only for clusters with SSE subscribers |
| `apps/web/src/hooks/useMetricsData.ts` | Unified metrics hook — SSE for ≤15m, tRPC for ≥30m, auto-switches |
| `apps/web/src/hooks/useMetricsSSE.ts` | SSE connection hook with exponential backoff + visibility-aware lifecycle |
| `apps/web/src/lib/metrics-buffer.ts` | Circular buffer for SSE live data (65 points, time-based eviction) |
| `apps/web/src/lib/lttb.ts` | LTTB downsampling (~50 LOC, zero deps) — 500+ points → ~200 |
| `apps/web/src/components/metrics/CrosshairProvider.tsx` | RAF-throttled synchronized crosshair state across all metric panels |
| `apps/web/src/components/metrics/DataFreshnessBadge.tsx` | Live/age/Stale freshness indicator with color coding |
| `apps/web/src/components/metrics/MetricsPanelSkeleton.tsx` | Chart-shaped skeleton shimmer for per-panel loading |
| `apps/web/src/components/metrics/DebouncedResponsiveContainer.tsx` | ResizeObserver-based container with 150ms debounce |
| `docs/DESIGN.md` | 🔴 Animation & interaction design source of truth — read before ANY UI change |

## URL Structure

**Sidebar navigation (6 items):** `/` Dashboard, `/clusters`, `/alerts`, `/events`, `/logs`, `/settings`

```
# Sidebar routes
/                               → Dashboard
/clusters                       → Clusters list
/alerts                         → Global alerts
/events                         → Global events
/logs                           → Global logs
/settings                       → Settings hub

# Cluster detail (10 tabs)
/clusters/[id]                  → Overview (default tab)
/clusters/[id]/nodes|pods|deployments|services|namespaces|events|logs|metrics|autoscaling

# Not in sidebar (accessible via direct URL or in-app links)
/ai                             → AI Assistant
/dashboards                     → Shared Dashboards
/anomalies                      → Anomaly detection
/karpenter                      → Karpenter autoscaler
/system-health                  → System health overview
/health                         → Health checks
/login                          → Login page

# Settings sub-pages (also accessible as top-level routes)
/users, /teams, /permissions, /webhooks, /features, /feature-flags, /audit
/deployments, /namespaces, /services  → Global views (not cluster-scoped)
```

## Known Gotchas

### 1. tRPC Link — Do NOT Revert to httpBatchLink
We switched from `httpBatchLink` to `httpLink` (`web/src/lib/trpc.ts`) because batched URLs exceeded nginx limits, causing 404s that broke ALL queries in the batch, saturated the React scheduler, and froze navigation. **Never revert to `httpBatchLink`.**

### 2. E2E: Check URL Before Fixing Selectors
When E2E tests fail on "element not found" — first verify the test navigates to the correct URL. `goto('/')` may redirect away from the expected page. Fix the URL before touching selectors or timeouts.

### 3. Router.push vs `<a>` Links
Clusters page uses `router.push()`, not `<a href>` links. Tests that look for `a[href*="/clusters/"]` will always fail. Use `page.click()` on the element or `waitForURL()` instead.

### 4. Fresh Cluster = Empty DB
After `helm install` with revision=1, the database is empty. Seed is required after fresh install. Detection: `SELECT count(*) FROM users` returns 0.

### 5. `pnpm install` Fails in Worktrees
Run `pnpm install --frozen-lockfile` from repo root, not from a git worktree. Node modules may be empty after merge otherwise.

### 6. `@tanstack/react-form` — Not Dead Weight (Yet)
Despite appearing unused at first glance, it IS used in login/users/teams pages. Don't remove without checking.

### 7. BASE_URL for E2E
The correct value is `http://voyager-platform.voyagerlabs.co`. Wrong BASE_URL is the #1 cause of E2E login failures ("logout button not found").

### 8. Zod v4 `z.record` Requires Two Arguments
`z.record(z.unknown())` fails — must be `z.record(z.string(), z.unknown())`. Always pass both key and value schemas.

### 9. tRPC v11 — Never Use `getUntypedClient()` for Subscriptions or Mutations
`getUntypedClient()` does not expose `.subscription()` or `.mutation()` methods in tRPC v11. Always use tRPC React hooks: `trpc.router.procedure.useSubscription()`, `trpc.router.procedure.useMutation()`. The `usePresence` hook was refactored to fix this (commit `19dcb21`).

### 10. LazyMotion — Do NOT Add `strict` Flag
`<LazyMotion strict>` crashes any component that uses `motion.div` instead of `m.div`. Since many components use `motion.*`, the `strict` flag was removed from `providers.tsx`. Do not re-add it without converting all `motion.*` imports to `m.*` first.

### 11. `useMutation` in useEffect Dependencies
tRPC's `useMutation()` returns a new object reference every render. Putting it in a `useEffect` dependency array causes infinite re-renders. Use a ref pattern instead: `const mutRef = useRef(mutation); mutRef.current = mutation;` then call `mutRef.current.mutate()` inside the effect.

### 12. Docker Compose Auto-Initializes DB Schema
`docker compose up -d` auto-runs `charts/voyager/sql/init.sql` on first start (mounted into `/docker-entrypoint-initdb.d/`). No manual `db:push` needed for local dev. The init.sql is fully idempotent (CREATE IF NOT EXISTS, ON CONFLICT DO NOTHING).

### 14. K8S_ENABLED=false Does NOT Disable Sync Jobs
`K8S_ENABLED=false` only disables K8s watchers (informers) and deploy-smoke-test. All sync jobs (health-sync, node-sync, event-sync, metrics-collector, alert-evaluator) **always run** regardless of this flag. They handle per-cluster errors gracefully and are required for remotely-added clusters (kubeconfig, AWS, etc.) that have their own embedded credentials.

### 15. Kubeconfig Provider — Context Fallback
When loading a kubeconfig via `loadFromString()`, if no explicit `context` param is provided, the factory falls back to `current-context` from the YAML, then to the first context in the list. Without this fallback, the KubeConfig object may have no context selected, causing all API calls to fail silently.

### 16. Cluster List Node Count Comes from `nodes` Table
The cluster list page gets `nodeCount` by counting rows in the `nodes` table (populated by node-sync), NOT from `clusters.nodesCount`. If node-sync isn't running, cluster cards show 0 nodes even if health-sync updated `clusters.nodesCount` correctly.

### 13. SSR Hydration — Never Branch on `typeof window/document` in Render
Checking `typeof window !== 'undefined'` or `typeof document !== 'undefined'` inside a component's render path creates a server/client branch that causes React hydration errors. The server renders one path, the client renders another. **Always use `useState(false)` + `useEffect(() => set(true))` to detect client-only features post-mount.** This has broken the login page multiple times via `PageTransition.tsx`.

### 17. Metrics Time Ranges — Grafana Standard Only
The metrics router accepts exactly 10 Grafana-standard ranges: `5m`, `15m`, `30m`, `1h`, `3h`, `6h`, `12h`, `24h`, `2d`, `7d`. Old ranges (`30s`, `1m`, `30d`) were removed because the 60s collector interval made sub-minute buckets always empty. The `TimeRangeSelector` also offers `custom` for absolute date/time — this falls back to `24h` for the DB query. **Never re-add sub-minute ranges.**

### 18. Metrics Dual Data Source — SSE vs tRPC
Short ranges (≤15m: `5m`, `15m`) use SSE streaming from K8s metrics-server via `/api/metrics/stream`. Historical ranges (≥30m) use `tRPC metrics.history` with TimescaleDB `time_bucket()` SQL. The `useMetricsData` hook handles switching automatically. **Never bypass this hook with direct tRPC calls for metrics.**

### 19. Metrics Response Shape — Wrapped Object
`metrics.history` returns `{ data: MetricsDataPoint[], serverTime: string, intervalMs: number }`, NOT a flat array. All consumers must access `.data` property. The old `historyQuery.data` → new `historyQuery.data?.data`.

### 20. TimescaleDB Extension Required
`charts/voyager/sql/init.sql` must include `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;` — the `time_bucket()` function used by the metrics router depends on it. If missing, all metrics queries fail silently with empty results.

## 🚨 QA Gate Rules — MANDATORY

QA validation after code changes **MUST** follow these rules. Violations = QA FAIL regardless of visual appearance.

### Hard Gates (any failure = BLOCK)
1. **Console errors = FAIL** — After every page navigation, check browser console. Any `[ERROR]` entry (hydration, runtime, uncaught) is an automatic QA failure. Warnings are noted but don't block.
2. **Login page MUST be tested unauthenticated** — Clear all cookies/storage BEFORE testing login. Use `browser_evaluate` to clear cookies, or open an incognito context. If the page auto-redirects, QA has NOT tested login.
3. **Every page must render content** — A page that loads but shows a blank screen, error overlay, or only a spinner is a FAIL. Verify actual content elements exist in the DOM snapshot.
4. **Both themes must be tested** — Test at minimum: login (dark + light), dashboard (dark + light), one data-heavy page (dark + light). Theme switching must not produce console errors.

### QA Checklist (execute in order)
```
1. pnpm typecheck           → 0 errors
2. pnpm build               → all pages compile
3. Start dev servers         → API + Web healthy
4. CLEAR ALL COOKIES         → ensure unauthenticated state
5. Test login page           → renders form, 0 console errors, both themes
6. Log in                    → redirects to dashboard
7. Test each key page        → screenshot + console check + DOM snapshot
8. Switch to light mode      → re-test key pages
9. Check for regressions     → compare against known-good screenshots if available
```

### What "Tested" Means
- **Screenshot taken** (visual proof)
- **DOM snapshot checked** (expected elements present: h1, nav, data)
- **Console checked** (0 errors after page load settles)
- **Both themes verified** (at least login + dashboard + one data page)

## Agent Pipeline (GSD)

Dev (Ron/Shiri/Dima) → Review (Lior 10/10) → Merge (Gil) → Deploy (Uri) → E2E (Yuval 0-fail) → QA (Mai 8.5+/10) → Loop until clean. Pipeline never declares `complete` — only `deployed-awaiting-review`. Vik decides when done. Agents are spawned via GSD workflow commands, not direct git commits.

## Environment Variables

Key env vars for root `.env` (loaded by API via `--env-file`):
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CLUSTER_CRED_ENCRYPTION_KEY` (64-char hex, required)
- `K8S_ENABLED` (default: `true`) — set to `false` for local dev without K8s cluster (disables watchers only, sync jobs still run — see Gotcha #14)
- `PORT` (default: `4000`) — API port (use `4001` if NoMachine occupies 4000)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — required for runtime admin bootstrap
- `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT` (optional observability)
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (optional Entra ID SSO)
- `FEATURE_FLAGS_FILE` (default: `feature-flags.json`) or `FEATURE_FLAG_*` env vars
- `RATE_LIMIT_MAX` (default: 200), `RATE_LIMIT_TIME_WINDOW` (default: `1 minute`)

Key env vars for `apps/web/.env.local`:
- `NEXT_PUBLIC_API_URL` (default: `http://voyager-api:4000`) — set to `http://localhost:4001` for local dev

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Metrics Graph Redesign**

A full-stack redesign of the voyager-platform metrics visualization system — replacing broken time range logic and basic Recharts panels with Grafana-quality, real-time metrics graphs. The metrics tab (`/clusters/[id]/metrics`) is the primary monitoring surface for K8s ops teams managing multi-cloud clusters.

**Core Value:** Every time range the user selects must show correct, populated data with Grafana-grade visualization quality — short ranges show real-time K8s metrics via SSE, historical ranges show properly bucketed DB data.

### Constraints

- **Tech stack**: Must use existing Recharts (already installed) — no switching to D3/Visx/ECharts
- **Design system**: Must follow `docs/DESIGN.md` B-style animation standards
- **SSE infra**: Must integrate with existing `voyagerEmitter` pattern, not add WebSocket
- **DB schema**: metrics_history and node_metrics_history tables stay as-is — no schema migration
- **Collector interval**: 60s collection frequency stays — SSE bridges the gap for short ranges
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7 - All application code (frontend, backend, shared packages)
- JavaScript/Node.js - Runtime execution and build tooling
- SQL - PostgreSQL schema and migrations via Drizzle ORM
- YAML - Kubernetes manifests and Helm templates
## Runtime
- Node.js 22 (Alpine Linux containerized)
- pnpm 10.6.2
- Lockfile: `pnpm-lock.yaml` (present)
## Frameworks
- Next.js 16.1.6 - Frontend framework with App Router
- React 19.2.4 - UI library
- Fastify 5.2.0 - Backend HTTP server
- tRPC 11.10.0 - Type-safe API layer (server 11.0.0, client/react-query 11.10.0)
- Tailwind CSS 4 - Utility-first CSS
- Radix UI 1.4.3 - Headless UI components
- Motion 12.34.0 - Animation library (Framer Motion v12 ecosystem)
- shadcn/ui - Component library (via Radix)
- Zustand 5.0.11 - Lightweight state store
- TanStack Query 5.90.21 - Server state/async data management
- TanStack Table 8.21.3 - Data table library
- Drizzle ORM 0.45.1 - TypeScript ORM for PostgreSQL
- Zod 4.3.6 - Runtime schema validation
- Better-Auth 1.4.18 - Authentication framework
- Vitest 4.0.18 - Unit test runner
- Playwright 1.58.2 - E2E and visual regression testing (separate configs)
- Turborepo 2.8.8 - Monorepo task orchestration
- TypeScript 5.7.0 - Type checking
- Biome 2.3.15 - Linting and formatting
- esbuild 0.27.3 - JS bundler (dependencies)
- tsx 4.19.0 - TypeScript execution for scripts
- @tanstack/react-form 1.28.4 - Form state management
- nuqs 2.8.9 - URL search params management
- cmdk 1.1.1 - Command/palette UI
- Lucide React 0.564.0 - Icon library
- Iconify React 6.0.2 - Additional icon sets
- sonner 2.0.7 - Toast notifications
- vaul 1.1.2 - Drawer components
- react-grid-layout 2.2.2 - Grid layout system
- react-resizable-panels 4.7.1 - Resizable panel system
- recharts 3.7.0 - Charting library
- next-themes 0.4.6 - Theme management
## Key Dependencies
- `drizzle-orm` 0.45.1 - Database ORM, essential for data access
- `@trpc/server` 11.0.0 - Type-safe API routing and contracts
- `fastify` 5.2.0 - High-performance backend server
- `better-auth` 1.4.18 - Authentication system for user management and SSO
- `@kubernetes/client-node` 1.4.0 - K8s API client for cluster operations
- `@aws-sdk/client-sts` 3.996.0 - AWS STS for cluster credential handling
- `@azure/arm-containerservice` 24.1.0 - Azure AKS cluster operations
- `@azure/identity` 4.13.0 - Azure authentication
- `@google-cloud/container` 6.7.0 - Google Cloud GKE operations
- `redis` 5.10.0 - Redis client for caching/queues
- `pg` 8.13.0 - PostgreSQL native driver
- `@sentry/nextjs` 10.38.0 - Frontend error tracking
- `@sentry/node` 10.38.0 - Backend error tracking
- `@sentry/profiling-node` 10.38.0 - Runtime profiling (optional)
- `@opentelemetry/sdk-node` 0.212.0 - Distributed tracing
- `@opentelemetry/exporter-trace-otlp-http` 0.212.0 - OTLP trace export
- `@opentelemetry/auto-instrumentations-node` 0.69.0 - Auto instrumentation
- `@openfeature/server-sdk` 1.20.1 - Feature flag framework
- `@openfeature/flagd-provider` 0.13.4 - flagd feature flag provider
- `zod-openapi` 5.4.6 - OpenAPI schema generation
- `trpc-to-openapi` 3.1.0 - tRPC to OpenAPI conversion
- `@fastify/compress` 8.3.1 - Gzip compression
- `@fastify/cors` 11.2.0 - CORS handling
- `@fastify/rate-limit` 10.3.0 - Rate limiting
- `@fastify/swagger` 9.7.0 - OpenAPI spec generation
- `@fastify/swagger-ui` 5.2.5 - Swagger UI interface
- `@aws-crypto/sha256-js` 5.2.0 - AWS Signature V4 signing
- `@smithy/protocol-http` 5.3.2 - HTTP protocol utilities
- `@smithy/signature-v4` 5.3.2 - AWS Signature V4 implementation
## Configuration
- Environment variables via `.env` file (development) and Kubernetes secrets/ConfigMaps (production)
- Key env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CLUSTER_CRED_ENCRYPTION_KEY`, `NODE_ENV`, `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- Entra ID integration vars: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (optional)
- Feature flags: `FEATURE_FLAGS_FILE` (default: `feature-flags.json`) or via `FEATURE_FLAG_*` env vars
- `biome.json` - Code formatting and linting (2-space indent, 100-char line width, single quotes, no semicolons)
- `turbo.json` - Task dependencies and caching configuration
- `tsconfig.json` (root and per-package) - TypeScript compilation settings
- `next.config.ts` - Next.js build and runtime config (with conditional Sentry integration)
- `playwright.config.ts` - E2E test configuration
- `playwright.visual.config.ts` - Visual regression test config
- `drizzle.config.ts` - Database migration configuration (in packages/db)
## Platform Requirements
- Node.js 22 (specified in Dockerfile)
- pnpm 10.6.2 (specified in package.json packageManager field)
- Docker & Docker Compose (for local Postgres 17 + TimescaleDB + Redis 7)
- PostgreSQL 17 with TimescaleDB extension
- Redis 7 (Alpine)
- Kubernetes 1.24+ (implied by K8s API client version)
- PostgreSQL 17 + TimescaleDB (in Kubernetes namespace `voyager`)
- Redis 7 (in Kubernetes)
- Optional: Jaeger (for distributed tracing via OTEL_EXPORTER_OTLP_ENDPOINT)
- Optional: Sentry (for error tracking when SENTRY_DSN set)
- Container registry (for pushing Docker images)
## Deployment
- API: `docker/Dockerfile.api` - Multi-stage build producing `node:22-alpine` runtime
- Web: `docker/Dockerfile.web` - Next.js standalone output on `node:22-alpine`
- Base image: `node:22-alpine`
- Kubernetes (EKS, AKS, GKE supported via SDK clients)
- Helm 3.x for deployment templating (`charts/voyager/`)
- Docker Compose for local development
- PostgreSQL 17 (container: `timescale/timescaledb:latest-pg17`)
- TimescaleDB extension enabled
- Schema source of truth: `charts/voyager/sql/init.sql`
- Migrations: Drizzle Kit via `drizzle.config.ts`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Source files use kebab-case: `ai-service.ts`, `cache.test.ts`, `auth-guard.ts`
- Components use PascalCase: `Sidebar.tsx`, `AppLayout.tsx`, `DataTable.tsx`
- Test files use `.test.ts` or `.spec.ts` suffix: `auth.test.ts`, `auth.spec.ts`
- Pages use kebab-case: `[id]/layout.tsx`, `clusters/page.tsx`
- Index files export modules or components: `src/components/index.ts`, `src/lib/index.ts`
- Async functions follow camelCase: `getRedisClient()`, `validateClusterConnection()`, `createMockDb()`
- React hooks follow `use` prefix convention: `useAnomalyCount()`, `useRefreshInterval()`, `usePermission()`
- Factory functions use `create` prefix: `createTestCaller()`, `createAuthorizationService()`, `createMockDb()`
- Utility/helper functions use action verbs: `cached()`, `encryptCredential()`, `normalizeProvider()`
- Router functions use domain prefix: `authRouter`, `clusterRouter`, `aiRouter` (defined in `src/routers/`)
- Use camelCase: `clusterId`, `isEncryptionEnabled`, `mockSetEx`
- Constants use SCREAMING_SNAKE_CASE: `REDIS_URL`, `K8S_CACHE_TTL`, `SESSION_EXPIRY_SECONDS`, `ENCRYPTION_KEY`
- Configuration objects use camelCase keys with readonly values: `const DURATION = { instant: 0.08, fast: 0.15 }`
- Mock functions use `mock` prefix: `mockGet`, `mockSetEx`, `mockDel`
- Interfaces and types use PascalCase: `Context`, `PresenceUser`, `BackendPresenceUser`
- Union types use PascalCase: `RefreshIntervalMs`, `ObjectType`, `Relation`
- Schema objects use `*Schema` suffix: `contextChatInputSchema`, `clusterSchema`, `aiKeySettingsInputSchema`
- Generic type parameters use single uppercase letters: `<T>`, `<TData>`, `<TVariables>`
## Code Style
- Tool: Biome 2.3.15
- Indentation: 2 spaces
- Line width: 100 characters
- Line endings: LF
- Tool: Biome 2.3.15
- Rules: `recommended` (all Biome recommended rules enabled)
- Command: `pnpm lint` (runs `biome check src/`)
- Target: ES2022
- Module system: ESNext
- Strict mode: enabled
- Declaration maps: enabled
- Source maps: enabled
- Module resolution: bundler
- ESM modules with `.js` extensions required in import statements (even for `.ts` files)
## Import Organization
- None explicitly configured; relative imports use `../` with `.js` extensions
- Workspace packages imported with `@voyager/` prefix: `@voyager/db`, `@voyager/api/types`, `@voyager/types`
- All packages are configured with `"type": "module"` in `package.json`
- Import statements MUST include `.js` extensions even when importing from `.ts` files
- Example: `import { auth } from '../lib/auth.js'` (not `../lib/auth`)
## Error Handling
- Use `TRPCError` from `@trpc/server` for all router errors
- Always include `code` (tRPC error code) and `message`
- Example:
- `'BAD_REQUEST'` — validation failure, malformed input
- `'NOT_FOUND'` — resource doesn't exist
- `'UNAUTHORIZED'` — authentication required
- `'FORBIDDEN'` — authorization failed
- `'CONFLICT'` — resource already exists
- `'INTERNAL_SERVER_ERROR'` — unexpected server error
- Redis failures are non-fatal: `try { ... } catch { }` — silently fall back to direct function call
- Example in `apps/api/src/lib/cache.ts`:
- AI router (`apps/api/src/routers/ai.ts`) uses `isTransientAiError()` to distinguish retryable errors from logical ones
- Transient patterns: timeout, connection reset, ECONNRESET, ECONNREFUSED
- Logical errors (NOT transient): `NOT_FOUND`, `BAD_REQUEST`
- tRPC error shape: `{ data: { code: 'UNAUTHORIZED' } }`
- Global handler `handleTRPCError()` in `apps/web/src/lib/trpc.ts` checks both tRPC-formatted and raw HTTP 401
- On UNAUTHORIZED: redirect to `/login`
- Errors in audit logging should never break the main operation
- Pattern: `try { logAudit(...) } catch (err) { console.error('[audit]', err) }`
## Logging
- Warnings: `console.warn('Redis error:', err)`
- Errors: `console.error('[audit] Failed to log login event:', err)`
- Errors with context prefix: `[audit]`, `[k8s]`, etc.
## Comments
- Complex algorithms or non-obvious logic
- Deprecated functions: use `@deprecated` JSDoc tag
- Important notes about gotchas or constraints
- Reference to issue numbers/phases: `// IP3-006: Proactive token refresh`, `// M-P3-003: Inline AI context`
- Used sparingly, primarily for function signatures in libraries
- Example from `apps/api/src/lib/cluster-client-pool.ts`:
## Function Design
- Use object destructuring for multiple related parameters
- Example: `function createMockDb(params?: { clusterExists?: boolean; recentEvents?: Array<...> })`
- Optional parameters use `?` in type definition
- Async functions return `Promise<T>`
- Helper functions return `T | null` rather than throwing when resource missing (sometimes)
- Utility functions like `cached()` always return the result type directly
- Router procedures wrap errors in `TRPCError` for API boundary
- Services can throw raw errors; routers catch and transform
- Example in `apps/api/src/routers/pods.ts`:
## Module Design
- Modules export primary function/class: `export const auth = ...`
- Router modules export as default or named: `export const aiRouter = router(...)`
- Service modules export classes: `export class AIService { }`
- Index files aggregate related exports: `src/components/index.ts` re-exports all components
- Used for namespace organization but not overused
- routers → services → lib
- routers → lib (can skip services)
- services → lib
- lib has no dependencies on routers/services
## Constants
- Environment variables read at module load: `const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'`
- Defaults provided inline, no separate config file for env vars
- Feature flags stored in `apps/api/feature-flags.json` (OpenFeature)
- Centralized in `apps/web/src/lib/animation-constants.ts`
- Exported as readonly objects with const assertion
- Structure: `DURATION`, `EASING`, `STAGGER`, plus variant objects (`fadeVariants`, `slideUpVariants`, etc.)
## Zod Schemas
- Define input schemas before procedures/services
- Use discriminated unions for multi-type inputs
- Example:
- `z.record()` requires TWO arguments: `z.record(z.string(), z.unknown())` (not just `z.record(z.unknown())`)
- Project uses Zod ^4.3.6
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- **Monorepo (Turborepo)** with shared packages (`@voyager/db`, `@voyager/types`, `@voyager/config`, `@voyager/ui`)
- **Type-safe RPC** — tRPC 11 + OpenAPI spec generation for full API transparency
- **Fastify 5 backend** with 28 tRPC routers + 2 non-tRPC routes (ai-stream, mcp)
- **Next.js 16 App Router frontend** (10 cluster tabs, 6-item sidebar, Motion v12 animations)
- **PostgreSQL + Redis** — persistent cluster metadata, events, metrics; real-time pub/sub via SSE
- **Multi-cluster orchestration** — connect AWS EKS, Azure AKS, GCP GKE, kubeconfig-based clusters via `@kubernetes/client-node`
- **SSE (Server-Sent Events) subscriptions** for live pod/deployment updates, no polling for UI state
- **Better-Auth** session management (user, session, account, verification tables)
## Layers
- Purpose: Next.js 16 App Router pages, React 19 components with Motion v12 animations
- Location: `apps/web/src/`
- Contains: Page routes (`/clusters/[id]/*`), UI components (DataTable, Sidebar, AppLayout), hooks, stores (Zustand)
- Depends on: tRPC client (`@/lib/trpc`), Next.js Router, @voyager packages (types, config)
- Used by: Browser clients
- **Entry point:** `apps/web/src/app/layout.tsx` (root layout with Providers)
- **Key files:** `apps/web/src/app/page.tsx` (dashboard), `apps/web/src/app/clusters/[id]/layout.tsx` (cluster detail shell with 10-tab bar)
- Purpose: Fastify 5 server exposing 28 tRPC routers + OpenAPI, auth flows, K8s event streaming
- Location: `apps/api/src/`
- Contains: tRPC routers, non-tRPC routes (ai-stream, mcp), background jobs, K8s watchers
- Depends on: Drizzle ORM, Better-Auth, Kubernetes client, database
- Used by: Frontend tRPC client, OpenAPI consumers
- **Entry point:** `apps/api/src/server.ts` (Fastify initialization, router registration, job startup)
- Purpose: PostgreSQL schema, ORM models, seed data
- Location: `packages/db/src/`
- Contains: Drizzle ORM schema (20 tables), migrations, seed script
- Depends on: Drizzle ORM, pg driver
- Used by: API, database initialization
- **Key files:** `packages/db/src/schema/index.ts` (all schema exports), `charts/voyager/sql/init.sql` (source of truth for schema)
- Purpose: TypeScript interfaces, Zod schemas used across packages
- Location: `packages/types/src/`
- Contains: SSE event types, AI contract types, Karpenter types
- Used by: API routers, frontend components
- Purpose: Environment-based constants (SSE timeouts, AI settings)
- Location: `packages/config/src/`
- Contains: SSE config, AI model settings
- Used by: API and frontend
- Purpose: shadcn/ui component library
- Location: `packages/ui/src/`
- Contains: Button, Card, Dialog, Tabs (imported into frontend components)
- Used by: Frontend pages and components
## Data Flow
- **Server state (DB):** Clusters, nodes, alerts, users, webhooks — persisted in PostgreSQL
- **Real-time state (SSE):** Pod updates, deployment progress, metrics — streamed to clients via EventEmitter
- **Client state (Frontend):** UI filters, sidebar collapse, dashboard layout — Zustand stores
- **Session state (Cookies):** Better-Auth manages session tokens (no JWT needed, cookie-based)
- **Cache (React Query):** tRPC useQuery with `staleTime` and `refetchInterval` settings per endpoint
## Key Abstractions
- Purpose: Unified API interface with automatic TypeScript inference
- Examples: `apps/api/src/routers/clusters.ts`, `apps/api/src/routers/pods.ts`, `apps/api/src/routers/alerts.ts`
- Pattern: Each router exports procedures (queries, mutations, subscriptions) with input/output Zod schemas
- Procedures use `publicProcedure`, `protectedProcedure`, `adminProcedure`, or `authorizedProcedure` middleware
- Frontend calls via `trpc.routers.procedure({ input })` with full type safety
- Purpose: Lazy-loaded per-cluster Kubernetes client connections
- Location: `apps/api/src/lib/cluster-client-pool.ts`
- Pattern: `clusterClientPool.getClient(clusterId)` returns a cached KubeConfig instance
- Handles credential decryption, kubeconfig parsing, AWS/Azure/GKE auth flows
- Prevents credential re-parsing on every API call
- Purpose: Manages Kubernetes informers per cluster, emits events to frontend
- Location: `apps/api/src/lib/cluster-watch-manager.ts`
- Pattern: `clusterWatchManager.startCluster(clusterId)` creates informers for pods, deployments, events
- Emits changes to `voyagerEmitter` (EventEmitter) — no polling
- Automatic cleanup on cluster disconnect
- Purpose: Decouples Kubernetes watchers from SSE subscriptions
- Location: `apps/api/src/lib/event-emitter.ts`
- Pattern: `voyagerEmitter.on('pod', callback)` — watchers emit, SSE routes consume
- Allows multiple SSE clients to subscribe to same informer (one watch, many consumers)
- Purpose: Type-safe SQL queries with automatic migrations
- Location: `packages/db/src/schema/`
- Tables: clusters, nodes, events, alerts, users, sessions, anomalies, ai_conversations, webhooks, dashboard_layouts, etc.
- Pattern: Each table defined in Drizzle, exported from `packages/db/src/schema/index.ts`
- Migrations: Auto-generated via `pnpm db:generate`, applied via `pnpm db:migrate`
- Purpose: Handles user signup, login, session validation, OAuth flows
- Location: `apps/api/src/lib/auth.ts`
- Pattern: Unified handler for `/api/auth/*` routes — delegates to Better-Auth library
- Session stored in PostgreSQL `session` table; token in cookie
- On login: creates user + account + session records; on logout: deletes session
- Purpose: Checks if user can perform action on resource
- Location: `apps/api/src/lib/authorization.ts`
- Pattern: `createAuthorizationService(db).check(subject, relation, object)`
- Objects: user, cluster, dashboard, webhook
- Relations: owner, editor, viewer
- DB-backed via `authorization_relations` table
## Entry Points
- Location: `apps/api/src/server.ts`
- Triggers: Container startup, `pnpm --filter api dev` for local dev
- Responsibilities:
- Location: `apps/web/src/app/layout.tsx` (root) → `apps/web/src/app/page.tsx` (dashboard)
- Triggers: `next dev` for local, `next start` for production
- Responsibilities:
- Location: `apps/web/src/app/clusters/[id]/layout.tsx`
- Triggers: User navigates to `/clusters/[id]` or `/clusters/[id]/[tab]`
- Responsibilities:
## Error Handling
- **tRPC errors:** Thrown as `TRPCError { code, message }` in procedures; auto-serialized to client with code + message + stack (if not hidden)
- **Client error codes (no Sentry):** UNAUTHORIZED, NOT_FOUND, BAD_REQUEST — client caused, don't report
- **Server error codes (Sentry):** All others (INTERNAL_SERVER_ERROR, CONFLICT) — report to Sentry + respond to client
- **Auth errors:** Caught by `handleTRPCError` on frontend; redirect to `/login` on UNAUTHORIZED
- **Non-tRPC endpoint errors:** Caught by Fastify error handler; respond with `{ error, statusCode }`
- **Database errors:** Drizzle ORM throws on constraint violations; caught by tRPC error formatter
- **K8s connection errors:** Logged to stdout, don't crash API; health check returns degraded status
## Cross-Cutting Concerns
- Backend: Fastify built-in logger (async, log levels)
- Frontend: Console logs (removed in production via build)
- SSE debug: Logged to stdout on informer events
- Backend: Zod schemas on all tRPC inputs + Better-Auth form validation
- Frontend: React Hook Form + Zod for UI forms; tRPC validates before sending
- Database: PostgreSQL constraints (NOT NULL, UNIQUE, FOREIGN KEY)
- Better-Auth cookie session (secure, httpOnly, sameSite=strict)
- tRPC protectedProcedure checks `ctx.session` and `ctx.user`
- Non-tRPC routes checked via `app.addHook('onRequest')` auth guard
- Admin role required for sensitive operations (user management, feature flags)
- Global: 200 req/min per IP (configurable via env)
- Whitelist: `/api/auth/`, `/health`, `/trpc` (SSE subscriptions need unlimited)
- Applied via `@fastify/rate-limit` plugin
- **Errors:** Sentry integration — all non-client errors reported with context
- **Traces:** OpenTelemetry auto-instrumentation (if enabled via env)
- **Logs:** Fastify logger, K8s watcher debug logs
- **Health:** `/health` endpoint (always up), `/health/metrics-collector` (collector status)
<!-- GSD:architecture-end -->
