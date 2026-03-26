# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
voyager-platform/
├── apps/
│   ├── api/                    # Fastify 5 backend (tRPC, K8s watchers, jobs)
│   │   ├── src/
│   │   │   ├── server.ts       # Entry point — DO NOT add migrate()
│   │   │   ├── trpc.ts         # tRPC context factory, procedure builders
│   │   │   ├── routers/        # 28 tRPC routers (clusters, pods, alerts, etc.)
│   │   │   ├── routes/         # Non-tRPC routes (ai-stream, mcp)
│   │   │   ├── jobs/           # Background jobs (health-sync, alert-evaluator, etc.)
│   │   │   ├── lib/            # Auth, K8s clients, authorization, cache, telemetry
│   │   │   └── __tests__/      # Vitest unit tests
│   │   ├── drizzle/            # Generated migration files
│   │   └── package.json        # Fastify, tRPC, K8s client deps
│   │
│   └── web/                    # Next.js 16 frontend (React 19, Motion v12)
│       ├── src/
│       │   ├── app/            # Next.js App Router pages
│       │   │   ├── layout.tsx   # Root layout with Providers
│       │   │   ├── page.tsx     # Dashboard (/ route)
│       │   │   ├── clusters/
│       │   │   │   ├── page.tsx           # Clusters list
│       │   │   │   └── [id]/
│       │   │   │       ├── layout.tsx     # Cluster detail shell (10-tab bar)
│       │   │   │       ├── page.tsx       # Overview tab (default)
│       │   │   │       ├── nodes/        # Nodes tab
│       │   │   │       ├── pods/         # Pods tab
│       │   │   │       ├── deployments/  # Deployments tab
│       │   │   │       ├── services/     # Services tab
│       │   │   │       ├── namespaces/   # Namespaces tab
│       │   │   │       ├── events/       # Events tab
│       │   │   │       ├── logs/         # Logs tab
│       │   │   │       ├── metrics/      # Metrics tab
│       │   │   │       └── autoscaling/  # Autoscaling tab
│       │   │   ├── alerts/     # Global alerts page
│       │   │   ├── ai/         # AI assistant page
│       │   │   ├── settings/   # Settings hub (tabs: general, users, teams, permissions, webhooks, features, audit)
│       │   │   ├── error.tsx   # Error boundary
│       │   │   └── globals.css # Tailwind + CSS variables
│       │   ├── components/     # 30+ React components
│       │   │   ├── AppLayout.tsx         # App shell (sidebar, topbar, content)
│       │   │   ├── Sidebar.tsx           # 6-item navigation (6 items post-redesign)
│       │   │   ├── TopBar.tsx            # Header with breadcrumbs, search, user menu
│       │   │   ├── DataTable.tsx         # TanStack Table for lists (pods, nodes, etc.)
│       │   │   ├── ClusterHealthIndicator.tsx  # Health + latency chip
│       │   │   ├── PresenceBar.tsx       # Live user presence
│       │   │   ├── CommandPalette.tsx    # Cmd+K search
│       │   │   ├── metrics/              # Recharts visualizations (AreaChart, TimeRange)
│       │   │   ├── dashboard/            # Dashboard widgets + grid layout
│       │   │   ├── ui/                   # shadcn/ui components (Button, Dialog, Tabs, etc.)
│       │   │   └── animations/           # Motion.js transition components
│       │   ├── lib/
│       │   │   ├── trpc.ts               # tRPC client setup (httpLink, httpSubscriptionLink)
│       │   │   ├── animation-constants.ts # Motion v12 timing + easing
│       │   │   ├── cluster-meta.ts        # Environment/provider metadata helpers
│       │   │   ├── status-utils.ts        # Status color/glow functions
│       │   │   ├── cluster-constants.ts   # LIVE_CLUSTER_REFETCH_MS, DB_CLUSTER_REFETCH_MS
│       │   │   └── utils.ts               # cn() for class merging, formatters
│       │   ├── stores/                    # Zustand stores (cluster context, dashboard layout)
│       │   ├── hooks/                     # Custom hooks (useAnomalyCount, useDesktopLayout)
│       │   ├── config/
│       │   │   ├── navigation.ts          # 6 sidebar nav items (post-redesign)
│       │   │   └── constants.ts           # APP_VERSION, env config
│       │   └── app/fonts/                 # Local fonts (Geist)
│       ├── public/                        # Static assets (favicon, logos)
│       └── package.json                   # Next.js, React, Motion, Tailwind, tRPC deps
│
├── packages/
│   ├── db/                     # Drizzle ORM + PostgreSQL schema
│   │   ├── src/
│   │   │   ├── client.ts       # Drizzle client export (pg pool + schema)
│   │   │   ├── index.ts        # Re-exports all schema tables
│   │   │   ├── schema/         # 20 Drizzle table definitions
│   │   │   │   ├── clusters.ts
│   │   │   │   ├── nodes.ts
│   │   │   │   ├── events.ts
│   │   │   │   ├── alerts.ts
│   │   │   │   ├── users.ts (Better-Auth)
│   │   │   │   ├── auth.ts (Better-Auth)
│   │   │   │   ├── ai.ts
│   │   │   │   ├── anomalies.ts
│   │   │   │   ├── metrics-history.ts
│   │   │   │   ├── node-metrics-history.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   └── 10+ more tables
│   │   │   ├── migrations/     # Generated .ts migration files
│   │   │   └── seed.ts         # Seed data script
│   │   ├── drizzle/            # Generated SQL migration files
│   │   └── package.json        # Drizzle, pg driver
│   │
│   ├── types/                  # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── index.ts        # Main export
│   │   │   ├── sse.ts          # SSE event types (PodEvent, DeploymentProgressEvent)
│   │   │   ├── ai-keys-contract.ts  # AI provider integration types
│   │   │   └── karpenter.ts    # Karpenter autoscaling types
│   │   └── package.json
│   │
│   ├── config/                 # Shared environment config
│   │   ├── src/
│   │   │   ├── index.ts        # Main export
│   │   │   ├── sse.ts          # SSE timeouts, log tail settings
│   │   │   └── ai.ts           # AI model names, token limits
│   │   └── package.json
│   │
│   └── ui/                     # shadcn/ui shared components
│       ├── src/
│       │   └── index.ts        # Export all UI components
│       └── package.json
│
├── charts/voyager/             # Helm chart for K8s deployment
│   ├── Chart.yaml
│   ├── values.yaml             # Default Helm values
│   ├── values-local.example.yaml # Local dev overrides (template)
│   ├── templates/              # K8s manifests (rendered by Helm)
│   │   ├── deployment.yaml     # API + Web deployment
│   │   ├── service.yaml        # ClusterIP service
│   │   ├── configmap.yaml      # App config
│   │   └── secret.yaml         # Cluster credentials (encrypted)
│   └── sql/
│       └── init.sql            # 🔴 Schema source of truth (init on postgres startup)
│
├── docker/
│   ├── Dockerfile.api          # Multi-stage: build tsc, run node dist/server.js
│   └── Dockerfile.web          # Multi-stage: build next, run next start
│
├── tests/
│   ├── e2e/                    # Playwright E2E tests (~30 specs)
│   │   ├── auth.spec.ts
│   │   ├── clusters.spec.ts
│   │   ├── navigation.spec.ts
│   │   ├── helpers.ts          # Page object helpers
│   │   └── fixtures/           # Test data
│   │
│   └── visual/                 # Playwright visual regression tests
│       ├── main-pages.visual.spec.ts
│       └── __screenshots__/    # Baseline screenshots
│
├── scripts/                    # Utility scripts (seed, cleanup, etc.)
├── docs/                       # Documentation
├── pipeline-evidence/          # CI/CD artifacts (test results, screenshots)
├── .learnings/                 # Agent learning logs
├── .planning/                  # GSD planning documents
│   └── codebase/               # THIS DIRECTORY
├── biome.json                  # Biome lint/format config
├── package.json                # Monorepo root (Turborepo, pnpm, scripts)
├── turbo.json                  # Turborepo task config
├── CLAUDE.md                   # Agent instructions (entry point for Claude)
└── MASTER-PLAN.md              # Full feature roadmap
```

## Directory Purposes

**apps/api:**
- Purpose: Fastify backend — tRPC routers, Kubernetes watchers, background jobs
- Contains: HTTP handlers (tRPC, auth, ai-stream, mcp), K8s client integration, database access
- Key files: `server.ts` (entry), `trpc.ts` (context + procedure builders), routers/

**apps/web:**
- Purpose: Next.js frontend — pages, components, UI logic
- Contains: App Router pages, React components, Zustand stores, tRPC client setup
- Key files: `app/layout.tsx` (root), `app/page.tsx` (dashboard), `components/AppLayout.tsx` (shell)

**packages/db:**
- Purpose: PostgreSQL schema and ORM layer
- Contains: Drizzle schema definitions, migrations, seed script
- 🔴 **Critical:** `charts/voyager/sql/init.sql` is schema source of truth, not Drizzle migrations
- Never add migrate() to server.ts — schema initialized by Helm on postgres startup

**packages/types:**
- Purpose: Shared TypeScript interfaces (no logic)
- Contains: SSE event types, API contracts, domain types
- Used by: Both API and frontend for compile-time type safety

**packages/config:**
- Purpose: Environment-based constants (not secrets)
- Contains: SSE timeout settings, AI model names, feature defaults
- Used by: API and frontend

**packages/ui:**
- Purpose: Reusable shadcn/ui components
- Contains: Button, Card, Dialog, Tabs (zero app-specific logic)
- Used by: Frontend pages

**charts/voyager:**
- Purpose: Kubernetes Helm chart for production deployment
- Contains: K8s manifests, init SQL, Helm values
- 🔴 **Critical:** `sql/init.sql` defines complete schema — applied on pod startup via initContainer

**docker:**
- Purpose: Container images for API and Web
- Pattern: Multi-stage (build → runtime)
- Build: tsc for API, next build for Web
- Run: node for API, next start for Web

**tests:**
- Purpose: E2E (Playwright) and visual regression tests
- Structure: Each spec file tests one feature (auth.spec.ts, clusters.spec.ts, etc.)
- Run: `pnpm test:e2e`, `pnpm test:visual`

## Key File Locations

**Entry Points:**
- Backend: `apps/api/src/server.ts` (Fastify, tRPC router registration, job startup)
- Frontend (Root): `apps/web/src/app/layout.tsx` (HTML structure, Providers wrapper)
- Frontend (Dashboard): `apps/web/src/app/page.tsx` (cluster list, filters, grid layout)
- Frontend (Cluster Detail): `apps/web/src/app/clusters/[id]/layout.tsx` (cluster shell, 10-tab bar)

**Configuration:**
- Package manager: `pnpm` (v10.6.2, monorepo lockfile: `pnpm-lock.yaml`)
- Turborepo: `turbo.json` (tasks: dev, build, lint, typecheck, test)
- Linting: `biome.json` (100-char line width, no semicolons, single quotes)
- Next.js: `apps/web/next.config.js` (basePath, redirects, etc.)
- tRPC: `apps/web/src/lib/trpc.ts` (client setup), `apps/api/src/trpc.ts` (server setup)
- Database: `packages/db/src/client.ts` (Drizzle + pg pool)
- Better-Auth: `apps/api/src/lib/auth.ts` (session handler)

**Core Logic:**
- tRPC routers: `apps/api/src/routers/` (28 routers, one per domain: clusters, pods, alerts, etc.)
- K8s integration: `apps/api/src/lib/cluster-client-pool.ts`, `cluster-watch-manager.ts`
- Authorization: `apps/api/src/lib/authorization.ts` (fine-grained access control)
- Frontend routing: `apps/web/src/config/navigation.ts` (6 sidebar items)
- Frontend animations: `apps/web/src/lib/animation-constants.ts` (Motion v12 timing)

**Testing:**
- E2E specs: `tests/e2e/*.spec.ts` (Playwright, BASE_URL required)
- Test helpers: `tests/e2e/helpers.ts` (page object pattern)
- Visual baselines: `tests/visual/__screenshots__/` (committed to git)
- Config: `playwright.config.ts` (baseURL, timeout), `playwright.visual.config.ts`

**Database:**
- Schema source: `charts/voyager/sql/init.sql` (🔴 source of truth, not Drizzle migrations)
- Drizzle tables: `packages/db/src/schema/` (20 table files)
- Migrations: `packages/db/drizzle/*.sql` (generated, applied via helm or pnpm db:migrate)
- Seed: `packages/db/src/seed.ts` (creates default data on fresh install)

## Naming Conventions

**Files:**
- Pages: `page.tsx` (App Router convention)
- Layouts: `layout.tsx`
- Route groups: `(auth)` (parentheses for non-URL segments)
- Components: PascalCase, e.g. `ClusterCard.tsx`, `Sidebar.tsx`
- Utilities: camelCase, e.g. `animation-constants.ts`, `cluster-meta.ts`
- Routers: lowercase with hyphen, e.g. `clusters.ts`, `ai-keys.ts`
- Tests: `*.spec.ts` (Playwright), `*.test.ts` (Vitest)

**Directories:**
- Components: `components/` with subdirs by feature (`components/metrics/`, `components/dashboard/`)
- Shared: `lib/` for utilities, `stores/` for Zustand, `hooks/` for custom React hooks
- Routes: `routers/` (API) and `app/` (frontend pages via App Router)
- Tables: `schema/` with one file per table (or logical grouping)

**TypeScript/Functions:**
- Procedures: camelCase, e.g. `clusters.create`, `pods.list`, `alerts.acknowledge`
- Types: PascalCase, e.g. `ClusterData`, `HealthStatus`, `AuthContext`
- Constants: UPPER_SNAKE_CASE, e.g. `CLUSTER_TABS`, `K8S_CACHE_TTL`, `DEFAULT_RATE_LIMIT_MAX`
- Hooks: `use` prefix, e.g. `useClusterContext()`, `useAnomalyCount()`
- Events: `Event` suffix, e.g. `PodEvent`, `DeploymentProgressEvent`

## Where to Add New Code

**New tRPC Router (API feature):**
1. Create `apps/api/src/routers/[domain].ts`
2. Import `router`, `protectedProcedure` from `../trpc.js`
3. Define procedures with Zod input/output schemas
4. Register in `apps/api/src/routers/index.ts`: `export const appRouter = router({ [domain]: [domainRouter] })`
5. Add tests: `apps/api/src/__tests__/[domain].test.ts`

**New Frontend Page:**
1. Create `apps/web/src/app/[route]/page.tsx` (if standalone) or `apps/web/src/app/[route]/[id]/page.tsx` (nested)
2. Wrap in `<AppLayout>` for shell (sidebar + topbar)
3. Use `trpc.[router].[procedure].useQuery()` or `.useMutation()` for data
4. Compose from `apps/web/src/components/`
5. Add E2E test: `tests/e2e/[feature].spec.ts`

**New Component:**
1. Create `apps/web/src/components/[Component].tsx`
2. Use shadcn/ui components (`apps/packages/ui/`) as building blocks
3. Import animation constants for Motion v12: `import { EASING } from '@/lib/animation-constants'`
4. Export from components barrel (no barrel currently — import directly)
5. Use in pages or other components

**New Database Table:**
1. Create `packages/db/src/schema/[table].ts`
2. Define Drizzle table using pgTable, timestamps, enums
3. Export from `packages/db/src/schema/index.ts`
4. Add SQL to `charts/voyager/sql/init.sql` (🔴 source of truth)
5. Run `pnpm db:generate` to create migration (for reference only)

**New Background Job:**
1. Create `apps/api/src/jobs/[job-name].ts`
2. Export `start[JobName]()` and `stop[JobName]()` functions
3. Use cron interval or polling loop (no external cron service)
4. Call from `apps/api/src/server.ts` startup block
5. Add shutdown cleanup in signal handlers

**New Utility/Helper:**
1. If frontend: `apps/web/src/lib/[util].ts`
2. If API: `apps/api/src/lib/[util].ts`
3. Import and use across routers/pages
4. Document with comments if non-obvious

**Shared Type or Config:**
1. Type: `packages/types/src/[domain].ts` (exported via `index.ts`)
2. Config: `packages/config/src/[domain].ts` (exported via `index.ts`)
3. Import in both API and frontend

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD mapping documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Via `/gsd:map-codebase` orchestrator
- Committed: No — temporary, used by planning phase
- Used by: `/gsd:plan-phase` and `/gsd:execute-phase` for context

**`.learnings/`:**
- Purpose: Agent learning logs (what Claude found, bugs encountered)
- Generated: Manually by agents during investigation
- Committed: Yes (tracked in git)
- Format: Markdown, date-based, searchable

**`pipeline-evidence/`:**
- Purpose: CI/CD artifacts (test results, E2E screenshots, QA reports)
- Generated: By CI pipeline (Jenkins) and local test runs
- Committed: No — gitignored, build artifacts only
- Used for: Post-deployment verification, QA signoff

**`charts/voyager/sql/`:**
- Purpose: Database schema (🔴 source of truth)
- Generated: Manually via SQL DDL statements
- Committed: Yes — critical for reproducible deploys
- Note: `init.sql` is init-container entrypoint, applied before app startup

---

*Structure analysis: 2026-03-26*
