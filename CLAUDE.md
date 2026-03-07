# Voyager Platform — CLAUDE.md

Voyager Platform is a **Kubernetes operations dashboard** — multi-cloud cluster management, monitoring, alerting, and AI-assisted ops. Currently in a **major UI redesign** (v194): collapsing a 20-item sidebar to 6, building a 10-tab cluster command center, and activating Motion v12 animations. Stack: Next.js 16 + Fastify 5 + tRPC 11 + PostgreSQL on Kubernetes.

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
| **Database** | PostgreSQL (in K8s namespace `voyager`) |
| **Infra** | Kubernetes (minikube), Helm, Docker |
| **Testing** | Playwright (E2E + visual), Vitest (unit), Biome (lint) |
| **Build** | Turborepo, pnpm 10 |

**App URL:** `http://voyager-platform.voyagerlabs.co`

## Development Commands

```bash
# From monorepo root
pnpm dev                    # Start all (turbo)
pnpm build                  # Build all
pnpm --filter web dev       # Frontend only
pnpm --filter api dev       # Backend only
pnpm test:e2e               # Run E2E tests
pnpm lint                   # Biome lint
pnpm typecheck              # TypeScript check
```

## 🚨 IRON RULES — Read These First

1. **NEVER add `migrate()` or schema init to `server.ts`** — Schema is managed exclusively via `charts/voyager/sql/init.sql`. The server.ts comment says this explicitly.

2. **NEVER hardcode `localhost` in E2E tests** — Always use `BASE_URL` env var: `process.env.BASE_URL || 'http://voyager-platform.voyagerlabs.co'`

3. **Deploy = `helm uninstall` + `helm install`** — NEVER `helm upgrade`. Fresh install every time. Bundle verify after every deploy before running E2E.

4. **ALL Discord messages use Components v2** — Never send plain text to Discord channels.

5. **E2E gate: 0 failures** — Zero tolerance. No skips, no partial passes.

6. **Code review gate: 10/10** — No merge without Lior's 10/10 approval.

7. **QA gate: 8.5+/10** — Desktop QA (1920×1080) must pass before declaring phase complete.

## Current Work

| Item | Details |
|------|---------|
| **Active spec** | `REDESIGN-PLAN.md` — UI redesign v194 |
| **Active board** | `BOARD.md` — scan for `[ ]` items |
| **Pipeline** | v194 — UI Redesign |
| **Mission** | Sidebar 20→6 items, cluster detail 10 tabs, Motion v12 activation |
| **Phase 1** | ✅ Mostly complete (navigation, routing, settings consolidation) |
| **Phase 2** | 🔵 Next — backend tRPC routes + frontend wiring for all cluster tabs |
| **Phase 3** | ⬜ Animation polish with Motion v12 |

## Database

- **Engine:** PostgreSQL in Kubernetes namespace `voyager`
- **Schema source of truth:** `charts/voyager/sql/init.sql`
- **Access:**
  ```bash
  kubectl exec -n voyager deploy/postgres -- psql -U voyager -d voyager -c "SELECT ..."
  ```
- **ORM:** Drizzle (schema in `packages/db/src/`)
- **Seed after fresh install:** Required — `SELECT count(*) FROM users` = 0 means empty DB

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
