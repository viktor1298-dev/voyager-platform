# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Voyager Platform is a **Kubernetes operations dashboard** — multi-cloud cluster management (AWS EKS, Azure AKS, GCP GKE), monitoring, alerting, and AI-assisted ops. Stack: Next.js 16 + Fastify 5 + tRPC 11 + PostgreSQL + Redis on Kubernetes.

---

## Monorepo Structure

```
voyager-platform/
├── apps/
│   ├── api/                    # Fastify 5 backend — see apps/api/CLAUDE.md
│   └── web/                    # Next.js 16 frontend — see apps/web/CLAUDE.md
├── packages/
│   ├── db/                     # Drizzle ORM schema — see packages/db/CLAUDE.md
│   ├── config/                 # Shared config (SSE, AI, routes, cache TTLs, validation limits)
│   ├── types/                  # Shared TypeScript types (SSE events, AI contracts)
│   └── ui/                     # Shared UI components (shadcn/ui)
├── charts/voyager/             # Helm chart — see charts/voyager/CLAUDE.md
├── docker/                     # Dockerfile.api, Dockerfile.web
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   └── visual/                 # Visual regression tests
└── scripts/                    # Utility scripts (health-check.ts)
```

Each major directory has its own `CLAUDE.md` with domain-specific details — always read it when working in that area.

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Next.js 16, React 19, Tailwind 4, Motion 12, shadcn/ui, TanStack Query, Zustand 5, cmdk, nuqs, React Flow (@xyflow/react), xterm.js |
| **Backend** | Fastify 5, tRPC 11, Drizzle ORM, Better-Auth, @fastify/websocket, Node.js 22 |
| **Database** | PostgreSQL 17 + TimescaleDB |
| **Cache** | Redis 7 |
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

8. **Before any UI/animation change, read `docs/DESIGN.md`** — It is the animation and interaction design source of truth. The design style is "Confident & Expressive" (Raycast/Arc Style B).

## Architecture

### Data Flow

```
Browser → Next.js (SSR/CSR) → tRPC Client
                                    ↓
                              tRPC Server (Fastify)
                              ↙        ↘
                     PostgreSQL      Kubernetes API
                     (Drizzle)       (@kubernetes/client-node)
                         ↑                    ↑
                      Redis (cache)     K8s Watch API (informers)
                                              ↓
                                     ResourceWatchManager (15 types)
                                              ↓
                                     SSE /api/resources/stream
                                              ↓
                                     Next.js Route Handler proxy
                                              ↓
                                     useResourceSSE → TanStack Query refetch
```

**Live data pipeline:** K8s Watch API → informers detect changes → SSE pushes events to browser → `useResourceSSE` triggers immediate refetch → Redis cache invalidated by watch → fresh data from K8s API. All 15 resource types covered. Update latency: ~5-8s.

### Centralized Config

Configuration is split between shared (API + Web) and backend-only:

| File | Exports | Used By |
|------|---------|---------|
| `packages/config/src/routes.ts` | `API_ROUTES`, `AUTH_BYPASS_PATHS`, `RATE_LIMIT_BYPASS_PATHS` | server.ts, auth-guard.ts |
| `packages/config/src/cache.ts` | `CACHE_TTL` (K8S_RESOURCES_SEC, CLUSTER_CLIENT_MS, etc.) | cluster-client-pool, routers |
| `packages/config/src/validation.ts` | `LIMITS` (NAME_MAX, LIST_MAX, etc.) | All tRPC routers with Zod schemas |
| `packages/config/src/sse.ts` | SSE heartbeat/reconnect constants | SSE subscriptions |
| `packages/config/src/ai.ts` | `AI_CONFIG` | AI service |
| `apps/api/src/config/jobs.ts` | `JOB_INTERVALS` | All background jobs |
| `apps/api/src/config/k8s.ts` | `K8S_CONFIG` (CLIENT_POOL_MAX, ENCRYPTION_KEY getter) | cluster-client-pool, clusters router |

**Rule:** Do NOT add new hardcoded values to routers or jobs. Add constants to the appropriate config file and import from there.

## Current State

| Item | Details |
|------|---------|
| **Milestone** | v1.0 Reset & Stabilization — complete (tagged `v1.0`) |
| **Main branch** | Single source of truth — PRs required, force push blocked |
| **Build status** | `pnpm build` ✓, `pnpm typecheck` ✓, `pnpm test` ✓ (all passing) |
| **Metrics Graph Redesign** | Grafana-quality metrics viz — complete (2026-03-28). TimescaleDB, SSE real-time, synchronized crosshair, LTTB downsampling |
| **K8s Resource Explorer** | 8 waves complete (2026-03-28). GroupedTabBar, 19 resource types, 10 new tRPC routers |
| **Lens-Inspired Power Features** | 10 plans, 4 waves complete (2026-03-28). Pod exec, log streaming, YAML/diff, Helm, CRDs, RBAC, topology, network policies, resource quotas, events timeline |
| **Live Data Pipeline** | K8s Watch → SSE → UI refetch. 15 resource types. ~5-8s update latency (2026-03-29) |
| **Next** | Push resource data through SSE (Lens-instant updates), then v2.0 milestone |

## Known Gotchas (Cross-Cutting)

> **Domain-specific gotchas live in sub-file CLAUDE.md files:** `apps/api/`, `apps/web/`, `packages/db/`, `charts/voyager/`

### `pnpm install` Fails in Worktrees
Run `pnpm install --frozen-lockfile` from repo root, not from a git worktree. Node modules may be empty after merge otherwise.

### Metrics Time Ranges — Grafana Standard Only
Exactly 10 ranges: `5m`, `15m`, `30m`, `1h`, `3h`, `6h`, `12h`, `24h`, `2d`, `7d`. Sub-minute ranges were removed (60s collector interval makes them empty). `custom` range falls back to `24h`. **Never re-add sub-minute ranges.**

### E2E: BASE_URL
Correct value: `http://voyager-platform.voyagerlabs.co`. Wrong BASE_URL is the #1 cause of E2E login failures.

### E2E: Check URL Before Fixing Selectors
When E2E tests fail on "element not found" — first verify the test navigates to the correct URL. Fix the URL before touching selectors or timeouts.

## 🚨 QA Gate Rules — MANDATORY

QA validation after code changes **MUST** follow these rules. Violations = QA FAIL regardless of visual appearance.

### Hard Gates (any failure = BLOCK)
1. **Console errors = FAIL** — After every page navigation, check browser console. Any `[ERROR]` entry is an automatic QA failure.
2. **Login page MUST be tested unauthenticated** — Clear all cookies/storage BEFORE testing login.
3. **Every page must render content** — Blank screen, error overlay, or only spinner = FAIL.
4. **Both themes must be tested** — Login + dashboard + one data-heavy page in dark + light.

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

## Agent Pipeline (GSD)

Dev (Ron/Shiri/Dima) → Review (Lior 10/10) → Merge (Gil) → Deploy (Uri) → E2E (Yuval 0-fail) → QA (Mai 8.5+/10) → Loop until clean. Pipeline never declares `complete` — only `deployed-awaiting-review`. Vik decides when done.

## Environment Variables

Key env vars for root `.env` (loaded by API via `--env-file`):
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CLUSTER_CRED_ENCRYPTION_KEY` (64-char hex, required)
- `K8S_ENABLED` (default: `true`) — set to `false` for local dev without K8s cluster (disables watchers only, sync jobs still run)
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

**Lens-Inspired Power Features**

Transform Voyager Platform from a read-only K8s dashboard into a full Lens-alternative with interactive operational capabilities. Phase 9 added: pod exec terminal (xterm.js + WebSocket), live log streaming (SSE follow), universal YAML viewer + resource diff, workload management (restart/scale/delete), Helm releases viewer, CRD browser, RBAC permission matrix, network policy visualization (React Flow), resource quotas dashboard, events timeline swim lanes, and resource topology map.

**Core Value:** Every K8s resource in the dashboard is now actionable — operators can exec into pods, view YAML, compare diffs, restart workloads, browse Helm releases, inspect RBAC, and visualize network policies and resource topology — all without leaving the browser.

### Constraints

- **Design system**: Must follow `docs/DESIGN.md` B-style animation standards
- **Graph library**: React Flow (@xyflow/react) for topology and network policy graphs — dagre for layout
- **Terminal**: xterm.js for pod exec, WebSocket bridge to K8s API (first WS in codebase, everything else is SSE)
- **Helm**: Read-only in Phase 9 (list, view values, revision history). Upgrade/rollback mutations deferred.
- **Port forwarding**: Copy kubectl command only — no actual proxy from web app
<!-- GSD:project-end -->

<!-- GSD auto-generated sections (Technology Stack, Conventions, Architecture) removed 2026-03-28.
     Reason: duplicated hand-written content above with stale pinned versions.
     The hand-written sections are authoritative. Re-run GSD codebase mapper if needed. -->
