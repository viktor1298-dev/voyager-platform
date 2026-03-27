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
│   │       ├── jobs/           # Background jobs (health-sync, alert-evaluator, metrics, node-sync, event-sync)
│   │       └── lib/            # Auth, K8s watchers, telemetry, sentry, cache, authorization
│   └── web/                    # Next.js 16 frontend (React 19, Tailwind 4)
│       └── src/
│           ├── app/            # App Router pages (clusters, alerts, settings, ai, etc.)
│           ├── components/     # UI components (Sidebar, AppLayout, DataTable, charts)
│           ├── lib/            # Utilities (trpc client, formatters, animation-constants)
│           └── config/         # navigation.ts (6 sidebar items)
├── packages/
│   ├── db/                     # Drizzle ORM schema + migrations
│   ├── config/                 # Shared config (SSE timeouts, AI settings)
│   ├── types/                  # Shared TypeScript types (SSE events, AI contracts)
│   └── ui/                     # Shared UI components (shadcn/ui)
├── charts/voyager/             # Helm chart for K8s deployment
│   ├── sql/init.sql            # 🔴 Schema source of truth
│   └── templates/              # K8s manifests
├── docker/                     # Dockerfile.api, Dockerfile.web
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   └── visual/                 # Visual regression tests
└── scripts/                    # Utility scripts
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

# Local infra (Postgres + Redis) — required before dev
docker compose up -d

# From monorepo root
pnpm dev                    # Start all (turbo)
pnpm build                  # Build all
pnpm --filter api dev       # Backend only (tsx watch, port 4000)
pnpm --filter web dev       # Frontend only (next dev, port 3000)

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
pnpm db:seed                # Seed data
pnpm --filter api seed:admin  # Seed admin user only
```

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
- Background jobs: `health-sync`, `alert-evaluator`, `metrics-history-collector`, `node-sync`, `event-sync`

### Key Abstractions

| Abstraction | Location | Pattern |
|-------------|----------|---------|
| **Cluster Client Pool** | `api/src/lib/cluster-client-pool.ts` | Lazy-loaded per-cluster K8s clients; caches KubeConfig, handles credential decryption for AWS/Azure/GKE |
| **Cluster Watch Manager** | `api/src/lib/cluster-watch-manager.ts` | K8s informers per cluster → emits to `voyagerEmitter`; no polling |
| **Event Emitter** | `api/src/lib/event-emitter.ts` | Decouples K8s watchers from SSE subscriptions (one watch, many consumers) |
| **Auth** | `api/src/lib/auth.ts` | Better-Auth handler for `/api/auth/*`; session in PostgreSQL, token in cookie |
| **Authorization** | `api/src/lib/authorization.ts` | `createAuthorizationService(db).check(subject, relation, object)` — DB-backed RBAC |

### State Management

- **Server state (DB):** Clusters, nodes, alerts, users, webhooks — PostgreSQL
- **Real-time state (SSE):** Pod updates, deployment progress, metrics — EventEmitter → SSE to clients
- **Client state:** UI filters, sidebar collapse, dashboard layout — Zustand stores
- **Session:** Better-Auth cookie session (secure, httpOnly, sameSite=strict) — no JWT
- **Cache:** tRPC useQuery with `staleTime` and `refetchInterval` per endpoint

### Error Handling

- tRPC errors: `TRPCError { code, message }` — codes: `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_SERVER_ERROR`
- Client-caused errors (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`) → no Sentry; server errors → Sentry
- Frontend: `handleTRPCError()` in `web/src/lib/trpc.ts` redirects to `/login` on UNAUTHORIZED
- Redis failures are non-fatal: catch and fall back to direct function call
- Audit logging errors must never break the main operation: `try { logAudit(...) } catch { console.error(...) }`
- K8s connection errors: logged, don't crash API; health check returns degraded

### Cross-Cutting

- Rate limiting: 200 req/min per IP via `@fastify/rate-limit`; whitelist: `/api/auth/`, `/health`, `/trpc`
- OpenAPI: auto-generated via `trpc-to-openapi` + `@fastify/swagger`
- Health: `/health` (always up), `/health/metrics-collector` (collector status)

## Current State

| Item | Details |
|------|---------|
| **Milestone** | v1.0 Reset & Stabilization — complete (tagged `v1.0`) |
| **Main branch** | Single source of truth — PRs required, force push blocked |
| **Build status** | `pnpm build` ✓, `pnpm typecheck` ✓, `pnpm test` ✓ (144/144 tests) |
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
| `apps/web/src/components/providers.tsx` | All providers (tRPC, theme, MotionConfig) |
| `apps/web/src/config/navigation.ts` | Sidebar navigation config |
| `apps/web/src/lib/trpc.ts` | tRPC client setup + `handleTRPCError` |
| `apps/web/src/lib/animation-constants.ts` | Motion v12 timing/easing constants |
| `charts/voyager/sql/init.sql` | DB schema (source of truth) |

## URL Structure

```
/                               → Dashboard
/clusters                       → Clusters list
/clusters/[id]                  → Cluster Overview (default tab)
/clusters/[id]/nodes            → Nodes tab
/clusters/[id]/pods             → Pods tab (?ns=kube-system for filter)
/clusters/[id]/deployments      → Deployments tab
/clusters/[id]/services         → Services tab
/clusters/[id]/namespaces       → Namespaces tab
/clusters/[id]/events           → Events tab
/clusters/[id]/logs             → Logs tab
/clusters/[id]/metrics          → Metrics tab
/clusters/[id]/autoscaling      → Autoscaling tab
/alerts                         → Global alerts + anomalies
/ai                             → AI Assistant
/dashboards                     → Shared Dashboards
/settings                       → Settings hub (General, Users, Teams, Permissions, Webhooks, Features, Audit)
```

## Known Gotchas

### 1. tRPC Batch URL Breaks Navigation
Adding `useQuery` to frequently-rendered components can cause tRPC's `httpBatchLink` to create oversized URLs. Nginx returns 404, ALL queries in the batch fail, retry loops saturate React scheduler, and `startTransition` navigation never completes. **Always test navigation after adding queries to shared components.**

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

## Agent Team

| Agent | Role | Model | Focus |
|-------|------|-------|-------|
| **Ron** 👷 | Frontend dev | Codex | React components, pages, animations |
| **Shiri** 👷 | Frontend-2 | Codex | Settings, secondary frontend |
| **Dima** 💻 | Backend dev | Opus | tRPC routers, DB, API |
| **Lior** 🔍 | Code review | Opus | 10/10 gate, quality enforcement |
| **Uri** 🔧 | DevOps | Sonnet | Docker, Helm, K8s deploy |
| **Gil** 🔄 | Git manager | Sonnet | Merge, tag, push |
| **Yuval** 🧬 | E2E testing | Sonnet | Playwright specs, 0-failure gate |
| **Mai** 🧪 | QA | Sonnet | Desktop QA, 8.5/10 gate |
| **Foreman** 🏗️ | Pipeline orchestrator | Opus | Spawns/coordinates all agents |
| **Guardian** 🛡️ | Pipeline monitor | Sonnet | Gate verification, health checks |

## Pipeline Flow

```
Dev (Ron/Dima) → Review (Lior 10/10) → Merge (Gil) → Deploy (Uri) → E2E (Yuval 0 fail) → QA (Mai 8.5+) → Loop until clean
```

Pipeline never declares `complete` — only `deployed-awaiting-review`. Vik decides when done.

## Environment Variables

Key env vars for `apps/api/.env`:
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CLUSTER_CRED_ENCRYPTION_KEY` (64-char hex, required)
- `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT` (optional observability)
- `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` (optional Entra ID SSO)
- `FEATURE_FLAGS_FILE` (default: `feature-flags.json`) or `FEATURE_FLAG_*` env vars
- `RATE_LIMIT_MAX` (default: 200), `RATE_LIMIT_TIME_WINDOW` (default: `1 minute`)

Key env vars for `apps/web/.env.local`:
- `NEXT_PUBLIC_API_URL` (default: `http://localhost:4000`)

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
