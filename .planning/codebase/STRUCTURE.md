# Codebase Structure

**Analysis Date:** 2026-03-30

## Directory Layout

```
voyager-platform/
├── apps/
│   ├── api/                        # Fastify 5 backend
│   │   ├── src/
│   │   │   ├── server.ts           # Entry point
│   │   │   ├── trpc.ts             # Context + procedure definitions
│   │   │   ├── routers/            # 43 tRPC routers
│   │   │   ├── routes/             # Non-tRPC: SSE + WebSocket endpoints
│   │   │   ├── jobs/               # Background jobs
│   │   │   ├── config/             # Backend-only config
│   │   │   ├── services/           # Business logic (AI, anomaly)
│   │   │   ├── lib/                # Core modules
│   │   │   ├── scripts/            # CLI scripts (seed-admin)
│   │   │   └── __tests__/          # Vitest unit tests
│   │   ├── drizzle/                # Migration files
│   │   ├── feature-flags.json      # OpenFeature flag definitions
│   │   └── package.json
│   └── web/                        # Next.js 16 frontend
│       ├── src/
│       │   ├── app/                # App Router pages (~55 routes)
│       │   ├── components/         # React components (22 subdirectories)
│       │   ├── hooks/              # Custom hooks (14 files)
│       │   ├── stores/             # Zustand stores (8 stores)
│       │   ├── lib/                # Utilities (trpc client, formatters, animation)
│       │   ├── config/             # Frontend config (navigation)
│       │   └── middleware.ts       # Auth guard middleware
│       ├── public/                 # Static assets
│       ├── next.config.ts          # Rewrites, Sentry, experimental flags
│       └── package.json
├── packages/
│   ├── config/                     # @voyager/config — shared constants
│   │   └── src/
│   │       ├── cache.ts            # Cache TTL constants
│   │       ├── sse.ts              # SSE/watch timing constants
│   │       ├── validation.ts       # Zod schema limits
│   │       ├── routes.ts           # API route paths, bypass lists
│   │       └── ai.ts               # AI config
│   ├── db/                         # @voyager/db — Drizzle ORM schema
│   │   └── src/
│   │       ├── client.ts           # pg Pool + Drizzle instance
│   │       ├── schema/             # 20 schema files
│   │       └── seed.ts             # Seed script
│   ├── types/                      # @voyager/types — shared TypeScript types
│   │   └── src/
│   │       ├── sse.ts              # SSE event interfaces (WatchEvent, MetricsEvent, etc.)
│   │       ├── karpenter.ts        # Karpenter types
│   │       └── ai-keys-contract.ts # AI key contracts
│   └── ui/                         # @voyager/ui — placeholder (empty export)
├── charts/voyager/                 # Helm chart for K8s deployment
│   ├── sql/init.sql                # Authoritative DB schema (CREATE TABLE)
│   ├── templates/                  # K8s manifests (deployments, services, ingress, etc.)
│   ├── values.yaml                 # Default Helm values
│   └── values-production.yaml      # Production overrides
├── docker/                         # Dockerfiles
├── tests/
│   ├── e2e/                        # Playwright E2E tests
│   └── visual/                     # Visual regression tests
├── scripts/                        # Utility scripts (health-check.ts)
├── docs/                           # Design docs (DESIGN.md)
├── docker-compose.yml              # Local dev: PostgreSQL (TimescaleDB) + Redis
├── turbo.json                      # Turborepo task config
├── pnpm-workspace.yaml             # Workspace: apps/* + packages/*
├── biome.json                      # Linter config
└── package.json                    # Root: turbo commands, devDependencies
```

## Directory Purposes

**`apps/api/src/routers/`:**
- Purpose: All tRPC procedure definitions (43 routers)
- Contains: One file per domain (e.g., `pods.ts`, `deployments.ts`, `clusters.ts`, `helm.ts`, `rbac.ts`)
- Key files: `index.ts` (router registry -- imports and merges all routers into `appRouter`)
- Pattern: Each router imports from `../trpc.js` for procedures and from `../lib/` for shared logic

**`apps/api/src/routes/`:**
- Purpose: Non-tRPC HTTP endpoints (SSE streams, WebSocket, AI, MCP)
- Contains: 6 route files registered directly on Fastify
- Key files: `resource-stream.ts` (primary K8s live data), `metrics-stream.ts`, `log-stream.ts`, `pod-terminal.ts` (WebSocket), `ai-stream.ts`, `mcp.ts`
- Pattern: Each exports a `register*Route(app)` function called from `server.ts`

**`apps/api/src/lib/`:**
- Purpose: Core modules -- no dependencies on routers or services
- Contains: K8s client management, auth, caching, event emitter, watch manager, resource mappers, error handling, crypto, telemetry
- Key files: `watch-manager.ts`, `cluster-client-pool.ts`, `event-emitter.ts`, `resource-mappers.ts`, `cache.ts`, `auth.ts`, `auth-guard.ts`, `authorization.ts`, `credential-crypto.ts`, `error-handler.ts`
- Dependency rule: `routers/ -> services/ -> lib/` (routers can skip services, lib NEVER imports from routers or services)

**`apps/api/src/jobs/`:**
- Purpose: Background jobs that run on intervals
- Contains: `alert-evaluator.ts`, `metrics-history-collector.ts`, `deploy-smoke-test.ts`, `metrics-stream-job.ts`
- Pattern: Each exports `start*()` and `stop*()` functions called from `server.ts`

**`apps/api/src/services/`:**
- Purpose: Business logic that sits between routers and lib
- Contains: AI service (conversation, provider, key management), anomaly detection
- Key files: `ai-service.ts`, `ai-provider.ts`, `anomaly-service.ts`

**`apps/api/src/config/`:**
- Purpose: Backend-only configuration (NOT shared with frontend)
- Key files: `jobs.ts` (interval constants), `k8s.ts` (client pool max, encryption key getter)

**`apps/web/src/app/`:**
- Purpose: Next.js App Router pages (~55 page files)
- Contains: Route segments organized by domain
- Key structure: `/clusters/[id]/` has 24 sub-pages (pods, deployments, services, etc.) with a shared layout
- Pattern: Each `page.tsx` is `'use client'` and uses tRPC hooks + Zustand for data

**`apps/web/src/components/`:**
- Purpose: React components organized by feature domain (22 subdirectories)
- Key subdirectories:
  - `clusters/` -- `cluster-tabs-config.ts` (7 groups, 24 tabs), `GroupedTabBar.tsx`
  - `expandable/` -- `ExpandableCard`, `DetailTabs`, `ResourceBar`, `ConditionsList`
  - `resource/` -- `YamlViewer`, `ResourceDiff`, `ActionToolbar`, `SearchFilterBar`
  - `terminal/` -- `TerminalDrawer`, `TerminalSession`, `terminal-context`
  - `topology/` -- `TopologyMap` (React Flow), `TopologyNode`
  - `metrics/` -- `CrosshairProvider`, `DataFreshnessBadge`
  - `charts/` -- chart theme, metric panels
  - `dashboard/` -- `DashboardGrid`, `WidgetLibraryDrawer`, `widgets/`
  - `ui/` -- shadcn/ui primitives
  - `shared/` -- cross-cutting UI components
  - `animations/` -- `FadeIn`, `SlideIn`, `PageTransition`
- Key root files: `providers.tsx`, `AppLayout.tsx`, `Sidebar.tsx`, `CommandPalette.tsx`, `DataTable.tsx`

**`apps/web/src/hooks/`:**
- Purpose: Custom React hooks (14 files)
- Key files: `useResourceSSE.ts` (live K8s data), `useResources.ts` (Zustand selectors), `useMetricsData.ts` (SSE/tRPC switch), `useMetricsSSE.ts` (metrics stream)

**`apps/web/src/stores/`:**
- Purpose: Zustand state stores (8 stores)
- Key files: `resource-store.ts` (live K8s data from SSE), `auth.ts` (session user), `cluster-context.ts`, `dashboard-layout.ts`, `metrics-preferences.ts`

**`apps/web/src/lib/`:**
- Purpose: Utility modules (tRPC client, formatters, animation constants)
- Key files: `trpc.ts` (tRPC client with httpLink + httpSubscriptionLink), `auth-client.ts` (Better-Auth React client), `animation-constants.ts` (Motion v12 presets), `metrics-buffer.ts` (circular buffer), `lttb.ts` (downsampling)

**`packages/db/src/schema/`:**
- Purpose: Drizzle ORM table definitions (20 files)
- Key files: `clusters.ts`, `nodes.ts`, `events.ts`, `auth.ts` (Better-Auth tables), `authorization.ts` (RBAC), `metrics-history.ts` (TimescaleDB), `alerts.ts`, `webhooks.ts`, `dashboards.ts`
- Note: These mirror `charts/voyager/sql/init.sql` which is the authoritative schema

**`charts/voyager/`:**
- Purpose: Helm chart for Kubernetes deployment
- Key files: `sql/init.sql` (authoritative DB schema), `templates/` (K8s manifests), `values.yaml`
- Generated: No (hand-authored)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `apps/api/src/server.ts`: API server bootstrap (plugins, routes, jobs, shutdown)
- `apps/web/src/app/layout.tsx`: Root HTML layout
- `apps/web/src/components/providers.tsx`: Client provider tree (tRPC, theme, terminal, etc.)
- `apps/web/src/middleware.ts`: Auth redirect middleware
- `apps/web/next.config.ts`: Rewrites, Sentry, experimental flags

**Configuration:**
- `packages/config/src/sse.ts`: SSE timing, watch constants, connection limits
- `packages/config/src/cache.ts`: Cache TTL values
- `packages/config/src/validation.ts`: Zod schema limits (shared across routers)
- `packages/config/src/routes.ts`: API route paths, auth bypass paths
- `apps/api/src/config/jobs.ts`: Background job intervals
- `apps/api/src/config/k8s.ts`: Client pool max, encryption key
- `apps/web/src/config/navigation.ts`: Sidebar nav items (6)
- `apps/web/src/components/clusters/cluster-tabs-config.ts`: Cluster detail tabs (7 groups, 24 tabs)

**Core Logic:**
- `apps/api/src/lib/watch-manager.ts`: K8s informer lifecycle + in-memory store
- `apps/api/src/lib/cluster-client-pool.ts`: Multi-cloud K8s auth cache
- `apps/api/src/lib/event-emitter.ts`: Pub/sub bridge (watchers -> SSE)
- `apps/api/src/lib/resource-mappers.ts`: K8s object -> frontend shape (15 mappers)
- `apps/api/src/lib/watch-db-writer.ts`: Periodic PostgreSQL sync from watches
- `apps/api/src/lib/auth.ts`: Better-Auth configuration
- `apps/api/src/lib/authorization.ts`: RBAC service (check/grant/revoke)
- `apps/api/src/routes/resource-stream.ts`: Primary SSE endpoint for live K8s data
- `apps/api/src/trpc.ts`: tRPC context + procedure hierarchy

**Testing:**
- `apps/api/src/__tests__/`: API unit tests (Vitest)
- `apps/web/src/stores/__tests__/`: Store unit tests
- `apps/web/src/lib/*.test.ts`: Lib unit tests (co-located)
- `tests/e2e/`: Playwright E2E tests
- `tests/visual/`: Visual regression tests

## Naming Conventions

**Files:**
- Router files: kebab-case matching domain (`pods.ts`, `network-policies.ts`, `resource-quotas.ts`)
- Component files: PascalCase (`AppLayout.tsx`, `CommandPalette.tsx`, `YamlViewer.tsx`)
- Hook files: camelCase with `use` prefix (`useResourceSSE.ts`, `useMetricsData.ts`)
- Store files: kebab-case (`resource-store.ts`, `dashboard-layout.ts`)
- Config files: kebab-case (`cluster-tabs-config.ts`, `animation-constants.ts`)
- Schema files: kebab-case (`metrics-history.ts`, `audit-log.ts`)
- Lib/utility files: kebab-case (`cache-keys.ts`, `error-handler.ts`)

**Directories:**
- App routes: kebab-case matching URL segments (`network-policies/`, `resource-quotas/`)
- Component dirs: kebab-case by feature (`expandable/`, `terminal/`, `topology/`)
- Package dirs: kebab-case (`config/`, `types/`, `db/`)

**Exports:**
- Package prefix: `@voyager/` (e.g., `@voyager/db`, `@voyager/types`, `@voyager/config`)
- Router exports: camelCase + `Router` suffix (`podsRouter`, `helmRouter`)
- Store exports: `use` prefix + `Store` suffix (`useResourceStore`, `useAuthStore`)

## Import Patterns

**Cross-package imports (workspace):**
```typescript
import { db, clusters } from '@voyager/db'
import { CACHE_TTL, LIMITS } from '@voyager/config'
import { SSE_HEARTBEAT_INTERVAL_MS } from '@voyager/config/sse'
import type { WatchEvent, ResourceType } from '@voyager/types'
```

**API internal imports (relative with .js extension):**
```typescript
import { watchManager } from '../lib/watch-manager.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { protectedProcedure, router } from '../trpc.js'
```

**Web internal imports (path alias @/):**
```typescript
import { trpc } from '@/lib/trpc'
import { useClusterResources } from '@/hooks/useResources'
import { useResourceStore } from '@/stores/resource-store'
import { AppLayout } from '@/components/AppLayout'
```

**Module boundaries:**
- `packages/*` never import from `apps/*`
- `apps/web` imports types from `apps/api` via `@voyager/api/types` (re-exported `AppRouter`)
- `apps/api/src/lib/` never imports from `routers/` or `services/`
- `apps/api/src/routers/` can import from `lib/` and `services/`

## Where to Add New Code

**New tRPC Router:**
1. Create `apps/api/src/routers/my-feature.ts`
2. Register in `apps/api/src/routers/index.ts` (import + add to `appRouter`)
3. If new shared types needed: add to `packages/types/src/` and re-export from `index.ts`

**New SSE/WebSocket Route:**
1. Create `apps/api/src/routes/my-stream.ts` with `registerMyStreamRoute(app)` export
2. Call the register function in `apps/api/src/server.ts`
3. Authenticate manually (SSE routes handle auth inline, not via tRPC procedures)

**New Background Job:**
1. Create `apps/api/src/jobs/my-job.ts` with `startMyJob()` and `stopMyJob()` exports
2. Add interval constant to `apps/api/src/config/jobs.ts`
3. Call start/stop in `apps/api/src/server.ts` (startup + SIGTERM handler)

**New Frontend Page:**
1. Create `apps/web/src/app/my-page/page.tsx`
2. If sidebar-visible: add entry to `apps/web/src/config/navigation.ts`
3. Wrap in `<AppLayout>` for authenticated pages

**New Cluster Resource Tab:**
1. Add page at `apps/web/src/app/clusters/[id]/my-resource/page.tsx`
2. Add tab entry to `apps/web/src/components/clusters/cluster-tabs-config.ts` (standalone or group child)
3. Data comes from `useClusterResources<MyType>(clusterId, 'my-resource')` if watched, or tRPC query if not

**New React Component:**
- Feature-specific: `apps/web/src/components/{feature}/MyComponent.tsx`
- Shared UI primitive: `apps/web/src/components/ui/` (shadcn/ui pattern)
- Shared cross-feature: `apps/web/src/components/shared/`

**New Custom Hook:**
- `apps/web/src/hooks/useMyHook.ts`

**New Zustand Store:**
- `apps/web/src/stores/my-store.ts`

**New Shared Config Constant:**
- `packages/config/src/{category}.ts` (import from `@voyager/config`)
- Backend-only: `apps/api/src/config/{category}.ts`

**New Shared Type:**
- `packages/types/src/{domain}.ts` (re-export from `index.ts`)

**New DB Table:**
1. Add schema to `packages/db/src/schema/my-table.ts`
2. Re-export from `packages/db/src/schema/index.ts`
3. Add CREATE TABLE to `charts/voyager/sql/init.sql` (authoritative source)
4. Run `pnpm db:generate` for migration

## Special Directories

**`charts/voyager/sql/`:**
- Purpose: Authoritative PostgreSQL schema (`init.sql`)
- Generated: No
- Committed: Yes
- Note: This runs on `docker compose up` and Helm install. Drizzle schema files mirror this for ORM types.

**`apps/api/drizzle/`:**
- Purpose: Generated Drizzle migration files
- Generated: Yes (via `pnpm db:generate`)
- Committed: Yes

**`.planning/`:**
- Purpose: GSD workflow planning artifacts
- Generated: Yes (by Claude GSD commands)
- Committed: Yes

**`docker/`:**
- Purpose: Dockerfiles for building API and Web images
- Contains: `Dockerfile.api`, `Dockerfile.web`
- Committed: Yes

**`tests/e2e/` and `tests/visual/`:**
- Purpose: Playwright E2E and visual regression tests
- Committed: Yes
- Run via: `pnpm test:e2e`, `pnpm test:visual`

---

*Structure analysis: 2026-03-30*
