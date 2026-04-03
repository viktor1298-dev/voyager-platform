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
│   ├── config/                 # Shared config (SSE, AI, routes, cache TTLs, validation limits, provider detection)
│   ├── types/                  # Shared TypeScript types (SSE events, AI key contracts, Karpenter)
│   └── ui/                     # Shared UI components (shadcn/ui)
├── charts/voyager/             # Helm chart — see charts/voyager/CLAUDE.md
├── docker/                     # Dockerfile.api, Dockerfile.web
├── docs/                       # DESIGN.md (animation/interaction), superpowers/specs/ (design specs)
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   └── visual/                 # Visual regression tests
└── scripts/                    # health-check.ts, e2e-preflight-lint.sh, screenshot.mjs
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
                            # predev script auto-kills zombie tsx/next processes first
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
- **Exception:** `@/` path alias imports in `apps/web/` do NOT use `.js` extensions. Next.js webpack doesn't resolve `.js` → `.ts` for path aliases. Only `@voyager/*` workspace imports use `.js`.
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

9. **NEVER commit code changes directly to main** — All code changes MUST happen in a git worktree branch. Read-only operations (exploration, research, reading files) can happen on main. See "Git Worktree Workflow" section below.

## Architecture

### Data Flow

```
Browser → Next.js (SSR/CSR) → tRPC Client (rewritten to API)
                                    ↓
                              tRPC Server (Fastify)
                              ↙        ↘
                     PostgreSQL      Kubernetes API
                     (Drizzle)       (@kubernetes/client-node)
                         ↑                    ↑
                      Redis (cache)     K8s Watch API (informers)
                                              ↓
                                     ResourceWatchManager (17 types)
                                              ↓
                                     SSE /api/resources/stream
                                              ↓
                              Browser EventSource (direct to API via NEXT_PUBLIC_API_URL)
                                              ↓
                                     useResourceSSE → Zustand store
```

**Live data pipeline (Lens-style):** K8s Watch API → unified WatchManager (informer ObjectCache = in-memory store) → SSE pushes full transformed objects (`event: watch`) → `useResourceSSE` applies directly to Zustand resource store → components re-render. No polling, no refetch round-trips. 17 resource types. Update latency: <2s. Fallback to K8s API via `cached()` when watches not ready. Browser connects SSE **directly to API** (`NEXT_PUBLIC_API_URL`) — no Next.js proxy for SSE.

**Instant load (Rancher-style):** On cluster page mount, `useCachedResources` calls `resources.snapshot` tRPC endpoint to seed Zustand store from WatchManager cache before SSE connects (~50ms). WatchManager keeps informers alive for 60s after last subscriber disconnects (grace period), so browser refresh gets instant cached data instead of cold start.

### Centralized Config

Configuration is split between shared (API + Web) and backend-only:

| File | Exports | Used By |
|------|---------|---------|
| `packages/config/src/routes.ts` | `API_ROUTES`, `AUTH_BYPASS_PATHS`, `RATE_LIMIT_BYPASS_PATHS` | server.ts, auth-guard.ts |
| `packages/config/src/cache.ts` | `CACHE_TTL` (K8S_RESOURCES_SEC, CLUSTER_CLIENT_MS, etc.) | cluster-client-pool, routers |
| `packages/config/src/validation.ts` | `LIMITS` (NAME_MAX, LIST_MAX, etc.) | All tRPC routers with Zod schemas |
| `packages/config/src/sse.ts` | SSE heartbeat/reconnect constants | SSE subscriptions |
| `packages/config/src/ai.ts` | `AI_CONFIG` | AI service |
| `packages/config/src/providers.ts` | `PROVIDER_DETECTION_RULES`, `detectProviderFromKubeconfig()`, `PROVIDER_LABELS` | clusters router, watch-db-writer, AddClusterWizard |
| `apps/api/src/config/jobs.ts` | `JOB_INTERVALS` | All background jobs |
| `apps/api/src/config/k8s.ts` | `K8S_CONFIG` (CLIENT_POOL_MAX, ENCRYPTION_KEY getter) | cluster-client-pool, clusters router |

**Rule:** Do NOT add new hardcoded values to routers or jobs. Add constants to the appropriate config file and import from there.

## Git Worktree Workflow

> **Why worktrees?** Multiple Claude Code sessions may run simultaneously on this project. Without isolation, parallel sessions editing the same files on `main` cause conflicts, lost work, and race conditions. Every code change MUST go through a worktree branch.

### Core Rules

1. **All code changes happen in worktrees, never on main** — `main` is read-only for Claude Code sessions. Only merge commits land on main.
2. **One task = one worktree** — Never mix unrelated changes in a single worktree. Each feature, bugfix, or chore gets its own.
3. **Read-only on main is fine** — File reads, exploration, `git log`, research, and planning do NOT require a worktree. Only editing/writing files does.

### Worktree Lifecycle

#### Step 1: Create Worktree
```bash
# Branch name follows conventional commits: feat/, fix/, chore/, refactor/
git worktree add .worktrees/<short-name> -b <type>/<short-description>
# Example:
git worktree add .worktrees/add-rbac-page -b feat/add-rbac-page
```

#### Step 2: Set Up Environment
```bash
cd .worktrees/<short-name>
cp ../../.env .env                    # Copy env vars from main worktree
pnpm install --frozen-lockfile        # Install dependencies (NOT shared between worktrees)
```

#### Step 3: Work & Commit
- All edits happen inside `.worktrees/<short-name>/`
- Commit frequently with conventional commit messages
- Do NOT touch files in the main worktree while a worktree is active

#### Step 4: Validate Before Merge
```bash
cd .worktrees/<short-name>
pnpm typecheck                        # Must pass
pnpm lint                             # Must pass
pnpm build                            # Must pass (optional for small fixes)
```

#### Step 5: Merge to Main
```bash
cd /path/to/main/worktree             # Back to main checkout
git merge <type>/<short-description>  # Fast-forward or merge commit
```

#### Step 6: Cleanup (MANDATORY)
```bash
git worktree remove .worktrees/<short-name> --force
git branch -d <type>/<short-description>    # Delete local branch
git worktree prune                           # Clean stale metadata
```

### Branch Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<short-name>` | `feat/add-rbac-page` |
| Bug fix | `fix/<short-name>` | `fix/sse-reconnect` |
| Chore | `chore/<short-name>` | `chore/update-deps` |
| Refactor | `refactor/<short-name>` | `refactor/cluster-store` |

### Multi-Session Safety

- Each session creates its own worktree with a unique branch name
- Parallel sessions work on different branches — no conflicts
- Only one session should merge to main at a time (coordinate via branch name visibility)
- If main has advanced since branching: `git rebase main` in the worktree before merging

### Session Startup Hygiene

At the start of each session, clean up any orphaned worktrees:
```bash
git worktree prune
```

### Worktree Gotchas

- **`node_modules/` is NOT shared** — every worktree needs its own `pnpm install --frozen-lockfile`
- **`.env` is NOT shared** — copy from main worktree root: `cp ../../.env .env`
- **`pnpm install` from worktrees** — use `--frozen-lockfile` flag, never plain `pnpm install`
- **Docker services are shared** — Postgres/Redis run on host, all worktrees share them
- **`.planning/` merge conflicts** — use `git checkout --theirs .planning/` when merging GSD state files

## Known Gotchas (Cross-Cutting)

> **Domain-specific gotchas live in sub-file CLAUDE.md files:** `apps/api/`, `apps/web/`, `packages/db/`, `charts/voyager/`

### Metrics Time Ranges — Grafana Standard Only
Exactly 10 ranges: `5m`, `15m`, `30m`, `1h`, `3h`, `6h`, `12h`, `24h`, `2d`, `7d`. Sub-minute ranges were removed (60s collector interval makes them empty). `custom` range falls back to `24h`. **Never re-add sub-minute ranges.**

### E2E: BASE_URL
Correct value: `http://voyager-platform.voyagerlabs.co`. Wrong BASE_URL is the #1 cause of E2E login failures.

### Docker DB User is `voyager`, Not `postgres`
The docker-compose uses `POSTGRES_USER=voyager`. Any `psql`, `pg_isready`, or `pg_dump` command must use `-U voyager -d voyager_dev`. The default `postgres` user does not exist in the container.

### Health-Check Before Testing
Before running curl or browser tests, verify services are running:
- API: `curl -sf http://localhost:4001/health` (check exit code)
- Web: `curl -sf -o /dev/null http://localhost:3000`
Never assume services are running from a previous session. Docker containers and dev servers may have stopped.

### `killall node` Kills Docker + MCP Servers
Never use `killall node` to clean up dev servers — it also kills Docker port forwarding (Postgres/Redis become unreachable) and MCP servers (Playwright, context7). Use `pnpm dev:restart` to safely restart dev servers.

### Never Kill MCP Server Processes
**Never use `pkill`, `kill`, or any process termination command targeting MCP server processes** (Playwright, context7, Docker MCP, etc.). MCP servers are managed by Claude Code via stdio pipes — killing the process severs the connection permanently for the session. Claude Code cannot re-establish the pipe from within the conversation; it requires `/mcp` restart or a session restart. If an MCP tool errors (e.g., "Browser is already in use"), troubleshoot the specific issue (delete lock files, close stale browsers) instead of killing the MCP process itself.

### Dev Server Restart — `predev` Handles Zombie Cleanup
`pnpm dev` runs a `predev` lifecycle script that kills zombie `tsx watch`, `turbo dev`, and `next dev` processes by name + port before starting. If you still hit `EADDRINUSE`, run `lsof -ti:4001 | xargs kill; lsof -ti:3000 | xargs kill` then `pnpm dev`.

### E2E: Check URL Before Fixing Selectors
When E2E tests fail on "element not found" — first verify the test navigates to the correct URL. Fix the URL before touching selectors or timeouts.

### NamespaceGroup `forceOpen` — Command, Not Lock
`NamespaceGroup` uses `forceOpen` to fold/unfold all namespaces. It syncs to internal state via `useEffect` — individual clicks always work. **Never** make `forceOpen` block `onOpenChange` (the old bug made namespaces unclickable after Fold NS).

### GroupedTabBar — Dropdown Uses `position: fixed`
Tab group dropdowns render with `position: fixed` + `getBoundingClientRect()`. The tab bar always uses `overflow-x: auto`. **Never** toggle overflow to `overflow-visible` for dropdowns — it resets `scrollLeft` to 0, snapping tabs back to the left on narrow screens.

### Helm `useHelmReleases` — Hybrid SSE + tRPC
SSE provides live presence (status, revision), tRPC `helm.list` provides decoded metadata (chartVersion, updatedAt). Merged by `namespace/name` key. **Never** remove the tRPC query — SSE can't decode Helm's base64+gzip binary.

### SSE Routes Require `reply.hijack()` in Fastify 5
All SSE endpoints (resource-stream, metrics-stream, log-stream, ai-stream, mcp) must call `reply.hijack()` before `reply.raw.writeHead()`. Without it, Fastify tries to send its own response after the handler completes, causing "invalid payload type" errors that kill the SSE connection. The `ConnectionLimiter` class in `connection-tracker.ts` handles per-cluster connection limits with auto-purging of destroyed sockets.

### Live Age Labels — `<LiveTimeAgo>`, Not Inline `timeAgo()`
Relative time labels ("3s ago") in SSE-driven pages must use `<LiveTimeAgo date={...} />` (self-updates every 1s). Inline `timeAgo()` freezes between K8s events because Zustand correctly skips re-renders when data hasn't changed. **Never** revert to inline calls, global tick hacks, or `subscribeWithSelector` middleware. This bug regressed twice — see `apps/web/CLAUDE.md` for full details.

### AnimatePresence Exit + Flex Layout = Ghost Space
When an element with `ml-auto` or `min-width` exits via `AnimatePresence`, it stays in the DOM during the exit animation and **still takes flex layout space** even at `scale: 0` / `opacity: 0`. In collapsed containers (e.g., `w-10 justify-center`), this pushes siblings off-center. Fix: wrap `<AnimatePresence>` inside the visibility conditional so the entire block unmounts instantly — no exit animation, no layout ghost. See sidebar badge pattern in `apps/web/CLAUDE.md`.

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

**Rancher/Lens-Inspired Power Features**

Transform Voyager Platform from a read-only K8s dashboard into a full Rancher/Lens-alternative with interactive operational capabilities. Phase 9 added: pod exec terminal (xterm.js + WebSocket), live log streaming (SSE follow), universal YAML viewer + resource diff, workload management (restart/scale/delete), Helm releases viewer, CRD browser, RBAC permission matrix, network policy visualization (React Flow), resource quotas dashboard, events timeline swim lanes, and resource topology map.

**Core Value:** Every K8s resource in the dashboard is now actionable — operators can exec into pods, view YAML, compare diffs, restart workloads, browse Helm releases, inspect RBAC, and visualize network policies and resource topology — all without leaving the browser.

### Constraints

- **Design system**: Must follow `docs/DESIGN.md` B-style animation standards
- **Graph library**: React Flow (@xyflow/react) for topology and network policy graphs — dagre for layout
- **Terminal**: xterm.js for pod exec, WebSocket bridge to K8s API (first WS in codebase, everything else is SSE)
- **Helm**: Read-only (list with chart version/timestamps, per-revision values, revision diff). `useHelmReleases` uses hybrid SSE + tRPC merge (SSE for live status, tRPC `helm.list` for decoded metadata). Upgrade/rollback mutations deferred.
- **Port forwarding**: Copy kubectl command only — no actual proxy from web app
<!-- GSD:project-end -->

<!-- GSD auto-generated sections (Technology Stack, Conventions, Architecture) removed 2026-03-28.
     Reason: duplicated hand-written content above with stale pinned versions.
     The hand-written sections are authoritative. Re-run GSD codebase mapper if needed. -->
