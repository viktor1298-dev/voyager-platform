# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Voyager Platform is a **Kubernetes operations dashboard** — multi-cloud cluster management (AWS EKS, Azure AKS, GCP GKE), monitoring, alerting, and AI-assisted ops. Recently stabilized (v1.0): 54-commit branch divergence resolved, main is the single source of truth, build/tests passing, branch protection enabled. Stack: Next.js 16 + Fastify 5 + tRPC 11 + PostgreSQL + Redis on Kubernetes.

---

## Monorepo Structure

```
voyager-platform/
├── apps/
│   ├── api/                    # Fastify 5 backend (tRPC 11, Drizzle ORM, Better-Auth)
│   │   └── src/
│   │       ├── server.ts       # Entry point — DO NOT add migrate() here
│   │       ├── routers/        # tRPC routers (clusters, pods, nodes, alerts, ai, etc.)
│   │       ├── routes/         # Non-tRPC routes (ai-stream, mcp)
│   │       ├── jobs/           # Background jobs (health-sync, alert-evaluator, metrics)
│   │       └── lib/            # Auth, K8s watchers, telemetry, sentry
│   └── web/                    # Next.js 16 frontend (React 19, Tailwind 4)
│       └── src/
│           ├── app/            # App Router pages (clusters, alerts, settings, ai, etc.)
│           ├── components/     # UI components (Sidebar, AppLayout, DataTable, charts)
│           ├── lib/            # Utilities (trpc client, formatters, animation-constants)
│           └── config/         # navigation.ts (6 sidebar items post-redesign)
├── packages/
│   ├── db/                     # Drizzle ORM schema + migrations
│   ├── config/                 # Shared config
│   ├── types/                  # Shared TypeScript types
│   └── ui/                     # Shared UI components
├── charts/voyager/             # Helm chart for K8s deployment
│   ├── sql/init.sql            # 🔴 Schema source of truth
│   └── templates/              # K8s manifests
├── docker/                     # Dockerfile.api, Dockerfile.web
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   └── visual/                 # Visual regression tests
├── scripts/                    # Utility scripts
├── pipeline-evidence/          # Pipeline run artifacts (E2E, QA results)
└── .learnings/                 # Agent learning logs
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Next.js 16, React 19, Tailwind 4, Motion 12, shadcn/ui, TanStack Query, Zustand 5, cmdk, nuqs |
| **Backend** | Fastify 5, tRPC 11, Drizzle ORM, Better-Auth, Node.js |
| **Database** | PostgreSQL 17 + TimescaleDB (in K8s namespace `voyager`) |
| **Cache/Queue** | Redis 7 + BullMQ 5 |
| **Feature Flags** | OpenFeature + flagd (`apps/api/feature-flags.json`) |
| **Observability** | Sentry (both apps), OpenTelemetry (API) |
| **Infra** | Kubernetes (minikube), Helm, Docker |
| **Testing** | Playwright (E2E + visual), Vitest (unit), Biome (lint) |
| **Build** | Turborepo, pnpm 10 |

**App URL:** `http://voyager-platform.voyagerlabs.co`

## Development Commands

```bash
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

- 2-space indent, 100-char line width
- Single quotes, no semicolons
- All packages are ESM (`"type": "module"`) — use `.js` extensions in imports even for `.ts` files

## 🚨 IRON RULES — Read These First

1. **NEVER add `migrate()` or schema init to `server.ts`** — Schema is managed exclusively via `charts/voyager/sql/init.sql`. The server.ts comment says this explicitly.

2. **NEVER hardcode `localhost` in E2E tests** — Always use `BASE_URL` env var: `process.env.BASE_URL || 'http://voyager-platform.voyagerlabs.co'`

3. **Deploy = `helm uninstall` + `helm install`** — NEVER `helm upgrade`. Fresh install every time. Bundle verify after every deploy before running E2E.

4. **ALL Discord messages use Components v2** — Never send plain text to Discord channels.

5. **E2E gate: 0 failures** — Zero tolerance. No skips, no partial passes.

6. **Code review gate: 10/10** — No merge without Lior's 10/10 approval.

7. **QA gate: 8.5+/10** — Desktop QA (1920×1080) must pass before declaring phase complete.

## Current State

| Item | Details |
|------|---------|
| **Milestone** | v1.0 Reset & Stabilization — complete (tagged `v1.0`) |
| **Main branch** | Single source of truth — 54 commits from feat/init-monorepo merged |
| **Build status** | `pnpm build` ✓, `pnpm typecheck` ✓, `pnpm test` ✓ (144/144 tests) |
| **Branches** | Only `main` — 26 stale branches deleted, branch protection enabled |
| **Repo visibility** | Public (changed from private to enable branch protection on GitHub Free) |
| **Next** | Feature development via PRs to main |

## Database

- **Engine:** PostgreSQL 17 + TimescaleDB in Kubernetes namespace `voyager`
- **Schema source of truth:** `charts/voyager/sql/init.sql`
- **Local dev:** `docker compose up -d` runs Postgres + Redis (see `docker-compose.yml`)
- **Access (K8s):**
  ```bash
  kubectl exec -n voyager deploy/postgres -- psql -U voyager -d voyager -c "SELECT ..."
  ```
- **ORM:** Drizzle (schema in `packages/db/src/`)
- **Seed after fresh install:** Required — `SELECT count(*) FROM users` = 0 means empty DB
- **Helm secrets:** `cp charts/voyager/values-local.example.yaml charts/voyager/values-local.yaml` (gitignored)

## Key Files

| Path | What |
|------|------|
| `apps/web/src/app/` | Next.js App Router pages |
| `apps/web/src/app/clusters/[id]/layout.tsx` | Cluster detail layout with 10-tab bar |
| `apps/web/src/components/Sidebar.tsx` | Main sidebar (6 items post-redesign) |
| `apps/web/src/components/AppLayout.tsx` | App shell with auto-collapse logic |
| `apps/web/src/components/providers.tsx` | All providers (tRPC, theme, MotionConfig) |
| `apps/web/src/config/navigation.ts` | Sidebar navigation config |
| `apps/web/src/lib/animation-constants.ts` | Motion v12 timing/easing constants |
| `apps/web/src/lib/trpc.ts` | tRPC client setup |
| `apps/api/src/routers/index.ts` | tRPC router registry |
| `apps/api/src/server.ts` | Fastify entry point (🔴 no migrate!) |
| `charts/voyager/sql/init.sql` | DB schema (source of truth) |
| `charts/voyager/` | Helm chart + K8s templates |
| `docker/Dockerfile.api` | API Docker image |
| `docker/Dockerfile.web` | Web Docker image |
| `tests/e2e/` | Playwright E2E specs |

## Known Gotchas

### 1. tRPC Batch URL Breaks Navigation
Adding `useQuery` to frequently-rendered components (e.g., `InlineAiTrigger`) can cause tRPC's `httpBatchLink` to create oversized URLs. Nginx returns 404, ALL queries in the batch fail, retry loops saturate React scheduler, and `startTransition` navigation never completes. **Always test navigation after adding queries to shared components.**

### 2. E2E: Check URL Before Fixing Selectors
When E2E tests fail on "element not found" — first verify the test navigates to the correct URL. `goto('/')` may redirect away from the expected page. Fix the URL before touching selectors or timeouts. (v188 wasted 3 fix iterations on this.)

### 3. Router.push vs `<a>` Links
Clusters page uses `router.push()`, not `<a href>` links. Tests that look for `a[href*="/clusters/"]` will always fail. Use `page.click()` on the element or `waitForURL()` instead.

### 4. Fresh Cluster = Empty DB
After `helm install` with revision=1, the database is empty. **Uri must run seed after fresh install.** Detection: `SELECT count(*) FROM users` returns 0.

### 5. `pnpm install` Fails in Worktrees
Run `pnpm install --frozen-lockfile` from repo root, not from a git worktree. Node modules may be empty after merge otherwise.

### 6. `@tanstack/react-form` — Not Dead Weight (Yet)
Despite appearing unused at first glance, it IS used in login/users/teams pages. Don't remove without checking. (`P1-017` is blocked on this.)

### 7. Foreman Spawn-and-Exit
Foreman dies after 1-2 min if it writes "Waiting for X results" without keeping alive. Always use `exec("sleep 300", { yieldMs: 360000 })` after spawn to stay alive.

### 8. BASE_URL for E2E
The correct value is `http://voyager-platform.voyagerlabs.co`. Wrong BASE_URL is the #1 cause of E2E login failures ("logout button not found").

### 9. Zod v4 `z.record` Requires Two Arguments
This project uses Zod v4 (^4.3.6). `z.record(z.unknown())` fails — must be `z.record(z.string(), z.unknown())`. Always pass both key and value schemas.

## URL Structure (Post-Redesign)

```
/                               → Dashboard (Health merged in)
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
/settings                       → Settings hub (tabs: General, Users, Teams, Permissions, Webhooks, Features, Audit)
```

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

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Voyager Platform — Stabilized (v1.0)**

Voyager Platform is a Kubernetes operations dashboard (multi-cloud cluster management, monitoring, alerting, AI-assisted ops) built as a monorepo: Next.js 16 frontend + Fastify 5 backend + tRPC 11 + PostgreSQL + Redis. The project was stabilized in v1.0: 54-commit divergence from `feat/init-monorepo` merged into `main`, 26 stale branches cleaned up, all tests passing, branch protection enabled.

**Core Value:** **Main branch is the single source of truth** — all work goes through PRs, force push is blocked, merged branches are auto-deleted.

### Constraints

- **Git safety**: No force-pushing to main. PRs required (branch protection enforced).
- **Test baseline**: "Stable" = `pnpm build` + `pnpm typecheck` + `pnpm test` all pass (144 tests).
- **Local dev infra**: `docker compose up -d` needed for Postgres + Redis before testing.
- **Branch hygiene**: Merged branches auto-deleted by GitHub. No long-lived integration branches.
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
