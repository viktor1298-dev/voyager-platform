# Architecture

**Analysis Date:** 2026-03-30

## Pattern Overview

**Overall:** Monorepo with a Fastify API backend and Next.js App Router frontend, connected via tRPC and SSE streaming. Kubernetes data flows through a unified watch pipeline (informers) into an in-memory store, then to the browser via SSE for sub-2-second live updates.

**Key Characteristics:**
- Two-app architecture: Fastify 5 API (`apps/api`) + Next.js 16 frontend (`apps/web`)
- Real-time-first: K8s Watch API informers feed SSE streams; tRPC for CRUD and historical data
- Shared packages (`@voyager/db`, `@voyager/types`, `@voyager/config`) enforce type safety across apps
- Multi-cloud K8s: supports AWS EKS, Azure AKS, GCP GKE via a cluster client pool

## Layers

**Frontend (Next.js App Router):**
- Purpose: Server-rendered shell + client-side interactive dashboard
- Location: `apps/web/src/`
- Contains: Pages (`app/`), components, hooks, Zustand stores, tRPC client
- Depends on: `@voyager/types`, `@voyager/config` (via imports), API via tRPC and SSE
- Used by: End users (browser)

**API Server (Fastify + tRPC):**
- Purpose: All business logic, K8s API integration, auth, background jobs
- Location: `apps/api/src/`
- Contains: tRPC routers, SSE/WS routes, background jobs, K8s lib modules, services
- Depends on: `@voyager/db`, `@voyager/types`, `@voyager/config`, `@kubernetes/client-node`, Better-Auth
- Used by: Frontend (via tRPC, SSE, WebSocket)

**Database Layer (Drizzle ORM):**
- Purpose: PostgreSQL (TimescaleDB) schema definition and ORM client
- Location: `packages/db/src/`
- Contains: Schema files (`src/schema/*.ts`), Drizzle client (`src/client.ts`), seed scripts
- Depends on: `drizzle-orm`, `pg`
- Used by: API server (exclusively)

**Shared Config:**
- Purpose: Constants shared between API and frontend (cache TTLs, SSE config, validation limits, route paths)
- Location: `packages/config/src/`
- Contains: `cache.ts`, `sse.ts`, `validation.ts`, `routes.ts`, `ai.ts`
- Used by: Both apps

**Shared Types:**
- Purpose: TypeScript interfaces for SSE events, watch events, resource types
- Location: `packages/types/src/`
- Contains: `sse.ts` (all real-time event shapes), `karpenter.ts`, `ai-keys-contract.ts`
- Used by: Both apps

## Data Flow

**Standard tRPC Request (CRUD):**

1. Browser calls `trpc.{router}.{procedure}.useQuery()` or `.useMutation()`
2. `httpLink` sends HTTP request to `/trpc/{procedure}` (credentials: include)
3. Next.js `rewrites()` proxies `/trpc/*` to Fastify API (`apps/web/next.config.ts`)
4. Fastify `fastifyTRPCPlugin` routes to the correct procedure (`apps/api/src/routers/index.ts`)
5. `createContext()` extracts session from Better-Auth cookie (`apps/api/src/trpc.ts`)
6. Procedure runs (e.g., queries DB via Drizzle, calls K8s API via `clusterClientPool`)
7. Response flows back through tRPC serialization to the frontend TanStack Query cache

**Live K8s Resource Updates (SSE -- primary data path):**

1. Cluster layout mounts `useResourceSSE(clusterId)` hook (`apps/web/src/hooks/useResourceSSE.ts`)
2. Hook creates `EventSource` to `{API_URL}/api/resources/stream?clusterId={id}`
3. API validates auth + cluster, subscribes to `WatchManager` (`apps/api/src/routes/resource-stream.ts`)
4. `WatchManager` starts K8s informers for 15 resource types (if first subscriber) (`apps/api/src/lib/watch-manager.ts`)
5. Informers populate in-memory `ObjectCache`; send initial `snapshot` events to SSE
6. On K8s watch changes (ADDED/MODIFIED/DELETED): informer fires event handler
7. `WatchManager` maps raw K8s object via `resource-mappers.ts`, emits via `VoyagerEventEmitter`
8. SSE route listener writes `event: watch` with `WatchEventBatch` to client
9. Client `useResourceSSE` dispatches to Zustand `resource-store` (ADDED/MODIFIED/DELETED)
10. Components consume via `useClusterResources<T>(clusterId, type)` selector

**Live Metrics Stream (SSE):**

1. Metrics page uses `useMetricsData` hook (`apps/web/src/hooks/useMetricsData.ts`)
2. For ranges <= 15m: SSE via `useMetricsSSE` connects to `/api/metrics/stream?clusterId={id}`
3. API starts `metricsStreamJob` (reference-counted K8s metrics polling at 15s intervals)
4. Polls K8s Metrics API, emits via `voyagerEmitter.emitMetricsStream()`
5. SSE route writes `MetricsStreamEvent` to client
6. For ranges >= 30m: tRPC `metrics.history` reads from TimescaleDB `metrics_history` hypertable

**Pod Terminal (WebSocket):**

1. User clicks Exec button, `openTerminal()` from `TerminalProvider` context
2. `TerminalDrawer` renders xterm.js, connects WebSocket to `/api/pod-terminal?clusterId=...&namespace=...&podName=...&container=...`
3. API authenticates, gets KubeConfig from `clusterClientPool`, creates `@kubernetes/client-node Exec`
4. PassThrough streams bridge browser WS <-> K8s exec API (`apps/api/src/routes/pod-terminal.ts`)
5. Shell attempts in order: `/bin/bash`, `/bin/sh`, `/bin/ash`

**State Management:**
- **Server state (DB):** TanStack Query via tRPC hooks, 30s global `staleTime`
- **Real-time state (K8s live):** Zustand `resource-store` fed by SSE (`useResourceSSE`)
- **UI state:** Zustand stores (`auth`, `cluster-context`, `dashboard-layout`, `metrics-preferences`, `notifications`, `presence`)
- **Session:** Better-Auth cookie-based sessions (httpOnly, secure, sameSite)
- **URL state:** `nuqs` for URL query parameters

## Key Abstractions

**WatchManager (Unified K8s Informers):**
- Purpose: Single manager for all 15 K8s resource types per cluster with reference counting
- Location: `apps/api/src/lib/watch-manager.ts`
- Pattern: First SSE subscriber triggers `subscribe(clusterId)` which starts all informers. Last unsubscribe stops them. Informer `ObjectCache` is the in-memory store. `getResources()` returns `null` until initial list completes (routers use null to trigger K8s API fallback).
- Reconnect: Exponential backoff with jitter on informer errors

**ClusterClientPool (Multi-Cloud K8s Auth):**
- Purpose: Lazy per-cluster KubeConfig cache with proactive token refresh
- Location: `apps/api/src/lib/cluster-client-pool.ts`
- Pattern: In-memory LRU cache (max from `K8S_CONFIG.CLIENT_POOL_MAX`). Decrypts stored credentials, creates KubeConfig via factory. Token refresh at 80% of TTL (EKS 15m, GKE/AKS 1h).

**VoyagerEventEmitter (Pub/Sub Bridge):**
- Purpose: Decouples K8s watchers/jobs from SSE consumers
- Location: `apps/api/src/lib/event-emitter.ts`
- Pattern: Node.js `EventEmitter` with typed methods. Channels: `watch-event:{clusterId}`, `watch-status:{clusterId}`, `metrics-stream:{clusterId}`, `log:{podKey}`, `pod-event`, `deployment-progress`, `alert`

**Resource Mappers:**
- Purpose: Transform raw K8s objects to frontend-compatible shapes
- Location: `apps/api/src/lib/resource-mappers.ts`
- Pattern: 15 mapper functions (one per resource type). Used by both tRPC routers and WatchManager to guarantee identical data shapes.

**Watch DB Writer:**
- Purpose: Persists watch events to PostgreSQL periodically (replaces legacy sync jobs)
- Location: `apps/api/src/lib/watch-db-writer.ts`
- Pattern: Dirty-set tracking + debounced periodic sync (every 60s). Syncs nodes, events, and cluster health status. Intercepts `emitWatchEvent` to track changes.

**tRPC Procedure Hierarchy:**
- Purpose: Layered auth middleware
- Location: `apps/api/src/trpc.ts`
- Pattern: `publicProcedure` (no auth) -> `protectedProcedure` (session required) -> `adminProcedure` (admin role) -> `authorizedProcedure(objectType, relation)` (RBAC check)

**Resource Store (Zustand):**
- Purpose: Client-side in-memory cache of live K8s resources
- Location: `apps/web/src/stores/resource-store.ts`
- Pattern: `Map<string, unknown[]>` keyed by `{clusterId}:{resourceType}`. `setResources` replaces array (snapshot), `applyEvent` handles ADDED/MODIFIED/DELETED. `subscribeWithSelector` ensures granular re-renders.

## Entry Points

**API Server:**
- Location: `apps/api/src/server.ts`
- Triggers: `pnpm dev` (tsx watch) or `pnpm start` (compiled)
- Responsibilities: Registers Fastify plugins (CORS, rate-limit, compression, WebSocket), mounts tRPC at `/trpc`, OpenAPI at `/api`, Better-Auth at `/api/auth/*`, SSE routes (`/api/resources/stream`, `/api/metrics/stream`, `/api/logs/stream`), WS route (`/api/pod-terminal`), health endpoints. Starts background jobs (alert evaluator, metrics collector, watch-db-writer, deploy smoke test). Ensures admin/viewer users exist.

**Web Frontend:**
- Location: `apps/web/src/app/layout.tsx` (root layout) + `apps/web/src/components/providers.tsx` (client providers)
- Triggers: `pnpm dev` (next dev, port 3000)
- Responsibilities: Root layout wraps all pages in `Providers` which sets up ThemeProvider, tRPC + TanStack Query, TerminalProvider + TerminalDrawer, LazyMotion, Toaster, CommandPalette, KeyboardShortcuts. `AuthSessionSync` syncs Better-Auth session to Zustand auth store.

**Middleware (Auth Guard):**
- Location: `apps/web/src/middleware.ts`
- Triggers: Every non-static request
- Responsibilities: Checks session cookie existence. Redirects to `/login` if missing. Expires stale cookies. Skips public paths (API, static, login).

## Error Handling

**Strategy:** Multi-layer with separation of client vs server errors

**Patterns:**
- **K8s router errors:** All K8s-facing routers use `handleK8sError(error, operation)` from `apps/api/src/lib/error-handler.ts` -- standardized error mapping to TRPCError codes
- **tRPC error formatter:** Client error codes (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`) are NOT reported to Sentry; server errors ARE (`apps/api/src/trpc.ts`)
- **Fastify error handler:** Catches unhandled errors, reports to Sentry, returns JSON error response (`apps/api/src/server.ts`)
- **Frontend error handling:** `handleTRPCError()` in `apps/web/src/lib/trpc.ts` intercepts UNAUTHORIZED errors and redirects to `/login`
- **Redis failures:** Always caught and fallen through -- never crash the request (`apps/api/src/lib/cache.ts`)
- **Audit logging:** Always wrapped in try/catch -- never breaks the main operation
- **K8s informer errors:** Exponential backoff reconnect in `WatchManager.handleInformerError()`

## Cross-Cutting Concerns

**Logging:**
- API: Fastify built-in logger (`app.log.info/warn/error`), plus direct `console.log/warn/error` in lib modules
- Frontend: Console only (no structured logging)

**Validation:**
- All tRPC router inputs validated with Zod schemas
- Shared validation limits in `packages/config/src/validation.ts` (`LIMITS.NAME_MAX`, `LIMITS.LIST_MAX`, etc.)
- Auth route inputs validated by Better-Auth

**Authentication:**
- Better-Auth with Drizzle adapter (`apps/api/src/lib/auth.ts`)
- Cookie-based sessions (configurable expiry, default 24h)
- Optional Entra ID (Azure AD) SSO via `genericOAuth` plugin
- API auth guard: `onRequest` hook checks session for `/api/*` and `/trpc/*` paths (tRPC routes handle own auth via procedures) (`apps/api/src/lib/auth-guard.ts`)
- Frontend middleware: redirects to `/login` if no session cookie (`apps/web/src/middleware.ts`)

**Authorization:**
- Role-based: `admin` and `viewer` roles
- RBAC: `authorizedProcedure(objectType, relation)` checks `accessRelations` table via `apps/api/src/lib/authorization.ts`
- Teams-based access: users belong to teams, teams have cluster access relations

**Caching:**
- **Redis (fallback path):** Used when WatchManager informers are not ready. `cached(key, ttl, fn)` in `apps/api/src/lib/cache.ts`. TTL in SECONDS. Keys centralized in `apps/api/src/lib/cache-keys.ts`.
- **In-memory (primary path):** WatchManager informer `ObjectCache` holds live K8s data. `getResources()` returns directly from memory.
- **Client-side:** TanStack Query with 30s global `staleTime`; Zustand resource-store for SSE data

**Rate Limiting:**
- 200 req/min per IP via `@fastify/rate-limit`
- Bypass paths: `/api/auth/`, `/health`, `/trpc` (`packages/config/src/routes.ts`)
- Auth routes explicitly exempt (`config: { rateLimit: false }`)

## Background Jobs

| Job | Location | Interval | Purpose |
|-----|----------|----------|---------|
| Alert Evaluator | `apps/api/src/jobs/alert-evaluator.ts` | 60s | Evaluates alert rules against K8s metrics |
| Metrics History Collector | `apps/api/src/jobs/metrics-history-collector.ts` | 60s | Collects cluster/node metrics to TimescaleDB |
| Watch DB Writer | `apps/api/src/lib/watch-db-writer.ts` | 60s | Syncs watch events (nodes, events, health) to PostgreSQL |
| Deploy Smoke Test | `apps/api/src/jobs/deploy-smoke-test.ts` | 30s delay | Checks deploy health post-rollout |
| Metrics Stream Job | `apps/api/src/jobs/metrics-stream-job.ts` | 15s | Reference-counted live metrics polling for SSE subscribers |

**Lifecycle:** All jobs start in `server.ts` `start()`. Graceful shutdown via `SIGTERM`/`SIGINT` handlers that stop all watchers, jobs, and flush Sentry.

## Request Routing (API to Frontend)

**Next.js Rewrites (`apps/web/next.config.ts`):**
- `/trpc/*` -> `{API_URL}/trpc/*` (all tRPC calls)
- `/api/*` -> `{API_URL}/api/*` (except SSE streams)
- SSE streams (`/api/resources/stream`, `/api/metrics/stream`, `/api/logs/stream`) are **excluded** from rewrites -- browsers connect directly to the API URL via `NEXT_PUBLIC_API_URL`

**Why SSE bypasses rewrites:** Next.js rewrites buffer responses, which breaks SSE streaming. SSE endpoints use `EventSource` with the API URL directly.

---

*Architecture analysis: 2026-03-30*
