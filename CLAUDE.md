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
│   │       ├── routes/         # Non-tRPC routes (ai-stream, mcp)
│   │       ├── jobs/           # Background jobs (health-sync, alert-evaluator, metrics, node-sync, event-sync, deploy-smoke-test)
│   │       ├── config/         # Backend-only config (job intervals, K8s settings)
│   │       └── lib/            # Auth, K8s watchers, telemetry, sentry, cache, authorization, error-handler, cache-keys, health-checks
│   └── web/                    # Next.js 16 frontend (React 19, Tailwind 4)
│       └── src/
│           ├── app/            # App Router pages (clusters, alerts, settings, ai, etc.)
│           ├── components/     # UI components (Sidebar, AppLayout, DataTable, charts)
│           ├── lib/            # Utilities (trpc client, formatters, animation-constants)
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
- Non-tRPC routes: `ai-stream` (SSE streaming) and `mcp` (MCP protocol)
- tRPC client uses `httpLink` (NOT `httpBatchLink`) — see Gotcha #1
- Background jobs: `health-sync`, `alert-evaluator`, `metrics-history-collector`, `node-sync`, `event-sync`, `deploy-smoke-test`
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
| **Next** | Feature development via PRs to main |

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
