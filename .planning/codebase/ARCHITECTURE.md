# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Monorepo with client-server separation — tRPC-based API bridge, next-gen cloud-native Kubernetes dashboard.

**Key Characteristics:**
- **Monorepo (Turborepo)** with shared packages (`@voyager/db`, `@voyager/types`, `@voyager/config`, `@voyager/ui`)
- **Type-safe RPC** — tRPC 11 + OpenAPI spec generation for full API transparency
- **Fastify 5 backend** with 28 tRPC routers + 2 non-tRPC routes (ai-stream, mcp)
- **Next.js 16 App Router frontend** (10 cluster tabs, 6-item sidebar, Motion v12 animations)
- **PostgreSQL + Redis** — persistent cluster metadata, events, metrics; real-time pub/sub via SSE
- **Multi-cluster orchestration** — connect AWS EKS, Azure AKS, GCP GKE, kubeconfig-based clusters via `@kubernetes/client-node`
- **SSE (Server-Sent Events) subscriptions** for live pod/deployment updates, no polling for UI state
- **Better-Auth** session management (user, session, account, verification tables)

## Layers

**Presentation (Frontend):**
- Purpose: Next.js 16 App Router pages, React 19 components with Motion v12 animations
- Location: `apps/web/src/`
- Contains: Page routes (`/clusters/[id]/*`), UI components (DataTable, Sidebar, AppLayout), hooks, stores (Zustand)
- Depends on: tRPC client (`@/lib/trpc`), Next.js Router, @voyager packages (types, config)
- Used by: Browser clients
- **Entry point:** `apps/web/src/app/layout.tsx` (root layout with Providers)
- **Key files:** `apps/web/src/app/page.tsx` (dashboard), `apps/web/src/app/clusters/[id]/layout.tsx` (cluster detail shell with 10-tab bar)

**API (Backend):**
- Purpose: Fastify 5 server exposing 28 tRPC routers + OpenAPI, auth flows, K8s event streaming
- Location: `apps/api/src/`
- Contains: tRPC routers, non-tRPC routes (ai-stream, mcp), background jobs, K8s watchers
- Depends on: Drizzle ORM, Better-Auth, Kubernetes client, database
- Used by: Frontend tRPC client, OpenAPI consumers
- **Entry point:** `apps/api/src/server.ts` (Fastify initialization, router registration, job startup)

**Shared Data Layer:**
- Purpose: PostgreSQL schema, ORM models, seed data
- Location: `packages/db/src/`
- Contains: Drizzle ORM schema (20 tables), migrations, seed script
- Depends on: Drizzle ORM, pg driver
- Used by: API, database initialization
- **Key files:** `packages/db/src/schema/index.ts` (all schema exports), `charts/voyager/sql/init.sql` (source of truth for schema)

**Shared Types:**
- Purpose: TypeScript interfaces, Zod schemas used across packages
- Location: `packages/types/src/`
- Contains: SSE event types, AI contract types, Karpenter types
- Used by: API routers, frontend components

**Shared Config:**
- Purpose: Environment-based constants (SSE timeouts, AI settings)
- Location: `packages/config/src/`
- Contains: SSE config, AI model settings
- Used by: API and frontend

**Shared UI:**
- Purpose: shadcn/ui component library
- Location: `packages/ui/src/`
- Contains: Button, Card, Dialog, Tabs (imported into frontend components)
- Used by: Frontend pages and components

## Data Flow

**Cluster Management (Create/List/Get):**

1. User submits cluster form → `clusters/add-cluster` page (Next.js form with Zod validation)
2. Form submits to `trpc.clusters.create` → tRPC protectedProcedure
3. API validates provider (aws/azure/gke/kubeconfig/minikube), encrypts connection config with AES-256
4. API stores cluster record in PostgreSQL `clusters` table
5. On success, frontend navigates to `/clusters/[id]` and renders cluster detail shell
6. Dashboard page queries `trpc.clusters.list` (cached 60s) and `trpc.clusters.live` (cached 30s) separately

**Real-Time Pod/Event Updates (SSE):**

1. User opens `/clusters/[id]/pods` tab
2. Frontend subscribes to `trpc.pods.subscribe({ clusterId })` — SSE subscription (not HTTP batch)
3. API establishes EventEmitter listener via `clusterWatchManager.startCluster(clusterId)`
4. Kubernetes informer watches pod changes in cluster — on pod change, emits `PodEvent` via EventEmitter
5. API sends SSE payload: `data: { event: 'pod', data: {...} }`
6. Frontend receives SSE message, updates React Query cache, component re-renders
7. User closes tab → frontend `unsubscribe()` → API stops EventEmitter listener

**Health Sync (Background Job):**

1. Every 5 min, `startHealthSync()` runs (started in server.ts)
2. Iterates all clusters in DB, calls `trpc.clusters.checkHealth({ clusterId })`
3. Pings cluster API endpoint, checks node count, pod count, API latency
4. Stores result in `clusters` table: `health_status`, `last_health_check`, `status`
5. Dashboard queries `trpc.clusters.list` (reads from DB, cache 60s)
6. Frontend displays cluster health badge with latency

**Metrics Collection (Time-Series):**

1. Every 60s, `startMetricsHistoryCollector()` runs
2. For each cluster node, queries metrics via Kubernetes Metrics API
3. Stores CPU/memory usage in `node_metrics_history` table (TimescaleDB hypertable)
4. Frontend queries `trpc.metrics.getNodeMetrics({ clusterId, timeRange })` on `/metrics` tab
5. Component renders recharts AreaChart with time-series data

**Authorization (Fine-Grained Access):**

1. tRPC `authorizedProcedure(objectType, relation)` wraps resource access
2. For cluster edit: `authorizedProcedure('cluster', 'owner')` + object ID from input
3. Checks DB permission via `createAuthorizationService().check(subject, relation, object)`
4. Admin users bypass all checks; regular users must have explicit relation record
5. If denied: `TRPCError { code: 'FORBIDDEN' }`

**State Management:**

- **Server state (DB):** Clusters, nodes, alerts, users, webhooks — persisted in PostgreSQL
- **Real-time state (SSE):** Pod updates, deployment progress, metrics — streamed to clients via EventEmitter
- **Client state (Frontend):** UI filters, sidebar collapse, dashboard layout — Zustand stores
- **Session state (Cookies):** Better-Auth manages session tokens (no JWT needed, cookie-based)
- **Cache (React Query):** tRPC useQuery with `staleTime` and `refetchInterval` settings per endpoint

## Key Abstractions

**tRPC Router (Type-Safe RPC):**
- Purpose: Unified API interface with automatic TypeScript inference
- Examples: `apps/api/src/routers/clusters.ts`, `apps/api/src/routers/pods.ts`, `apps/api/src/routers/alerts.ts`
- Pattern: Each router exports procedures (queries, mutations, subscriptions) with input/output Zod schemas
- Procedures use `publicProcedure`, `protectedProcedure`, `adminProcedure`, or `authorizedProcedure` middleware
- Frontend calls via `trpc.routers.procedure({ input })` with full type safety

**Cluster Client Pool (Kubernetes Access):**
- Purpose: Lazy-loaded per-cluster Kubernetes client connections
- Location: `apps/api/src/lib/cluster-client-pool.ts`
- Pattern: `clusterClientPool.getClient(clusterId)` returns a cached KubeConfig instance
- Handles credential decryption, kubeconfig parsing, AWS/Azure/GKE auth flows
- Prevents credential re-parsing on every API call

**Cluster Watch Manager (Real-Time Informers):**
- Purpose: Manages Kubernetes informers per cluster, emits events to frontend
- Location: `apps/api/src/lib/cluster-watch-manager.ts`
- Pattern: `clusterWatchManager.startCluster(clusterId)` creates informers for pods, deployments, events
- Emits changes to `voyagerEmitter` (EventEmitter) — no polling
- Automatic cleanup on cluster disconnect

**Event Emitter (Internal Pub/Sub):**
- Purpose: Decouples Kubernetes watchers from SSE subscriptions
- Location: `apps/api/src/lib/event-emitter.ts`
- Pattern: `voyagerEmitter.on('pod', callback)` — watchers emit, SSE routes consume
- Allows multiple SSE clients to subscribe to same informer (one watch, many consumers)

**Database Schema (Drizzle ORM):**
- Purpose: Type-safe SQL queries with automatic migrations
- Location: `packages/db/src/schema/`
- Tables: clusters, nodes, events, alerts, users, sessions, anomalies, ai_conversations, webhooks, dashboard_layouts, etc.
- Pattern: Each table defined in Drizzle, exported from `packages/db/src/schema/index.ts`
- Migrations: Auto-generated via `pnpm db:generate`, applied via `pnpm db:migrate`

**Better-Auth (Session Management):**
- Purpose: Handles user signup, login, session validation, OAuth flows
- Location: `apps/api/src/lib/auth.ts`
- Pattern: Unified handler for `/api/auth/*` routes — delegates to Better-Auth library
- Session stored in PostgreSQL `session` table; token in cookie
- On login: creates user + account + session records; on logout: deletes session

**Authorization Service (Fine-Grained):**
- Purpose: Checks if user can perform action on resource
- Location: `apps/api/src/lib/authorization.ts`
- Pattern: `createAuthorizationService(db).check(subject, relation, object)`
- Objects: user, cluster, dashboard, webhook
- Relations: owner, editor, viewer
- DB-backed via `authorization_relations` table

## Entry Points

**Backend:**
- Location: `apps/api/src/server.ts`
- Triggers: Container startup, `pnpm --filter api dev` for local dev
- Responsibilities:
  - Initialize Fastify app, register plugins (compress, CORS, rate-limit, tRPC, Swagger)
  - Register tRPC router at `/trpc` prefix, OpenAPI at `/api`
  - Start Better-Auth handler at `/api/auth/*`
  - Start K8s watchers, background jobs (health-sync, alert-evaluator, metrics-collector, node-sync, event-sync)
  - Set up graceful shutdown (SIGTERM/SIGINT)

**Frontend:**
- Location: `apps/web/src/app/layout.tsx` (root) → `apps/web/src/app/page.tsx` (dashboard)
- Triggers: `next dev` for local, `next start` for production
- Responsibilities:
  - Wrap app in tRPC provider + theme provider + query client provider (Providers.tsx)
  - Render AppLayout (sidebar + topbar + content area)
  - Render dashboard with cluster list, filters, environment grouping
  - On cluster click, navigate to `/clusters/[id]` (cluster detail shell with tab bar)

**Cluster Detail Page:**
- Location: `apps/web/src/app/clusters/[id]/layout.tsx`
- Triggers: User navigates to `/clusters/[id]` or `/clusters/[id]/[tab]`
- Responsibilities:
  - Fetch cluster metadata via `trpc.clusters.get({ id })`
  - Render cluster header with name, provider logo, breadcrumbs
  - Render 10-tab bar (Overview, Nodes, Pods, Deployments, Services, Namespaces, Events, Logs, Metrics, Autoscaling)
  - Route active tab to respective page (e.g., `/clusters/[id]/pods` → `apps/web/src/app/clusters/[id]/pods/page.tsx`)
  - Enable keyboard shortcuts (1-9 for tab selection, [ and ] for prev/next)

## Error Handling

**Strategy:** Multi-layer error propagation with client-specific formatting

**Patterns:**

- **tRPC errors:** Thrown as `TRPCError { code, message }` in procedures; auto-serialized to client with code + message + stack (if not hidden)
- **Client error codes (no Sentry):** UNAUTHORIZED, NOT_FOUND, BAD_REQUEST — client caused, don't report
- **Server error codes (Sentry):** All others (INTERNAL_SERVER_ERROR, CONFLICT) — report to Sentry + respond to client
- **Auth errors:** Caught by `handleTRPCError` on frontend; redirect to `/login` on UNAUTHORIZED
- **Non-tRPC endpoint errors:** Caught by Fastify error handler; respond with `{ error, statusCode }`
- **Database errors:** Drizzle ORM throws on constraint violations; caught by tRPC error formatter
- **K8s connection errors:** Logged to stdout, don't crash API; health check returns degraded status

## Cross-Cutting Concerns

**Logging:**
- Backend: Fastify built-in logger (async, log levels)
- Frontend: Console logs (removed in production via build)
- SSE debug: Logged to stdout on informer events

**Validation:**
- Backend: Zod schemas on all tRPC inputs + Better-Auth form validation
- Frontend: React Hook Form + Zod for UI forms; tRPC validates before sending
- Database: PostgreSQL constraints (NOT NULL, UNIQUE, FOREIGN KEY)

**Authentication:**
- Better-Auth cookie session (secure, httpOnly, sameSite=strict)
- tRPC protectedProcedure checks `ctx.session` and `ctx.user`
- Non-tRPC routes checked via `app.addHook('onRequest')` auth guard
- Admin role required for sensitive operations (user management, feature flags)

**Rate Limiting:**
- Global: 200 req/min per IP (configurable via env)
- Whitelist: `/api/auth/`, `/health`, `/trpc` (SSE subscriptions need unlimited)
- Applied via `@fastify/rate-limit` plugin

**Observability:**
- **Errors:** Sentry integration — all non-client errors reported with context
- **Traces:** OpenTelemetry auto-instrumentation (if enabled via env)
- **Logs:** Fastify logger, K8s watcher debug logs
- **Health:** `/health` endpoint (always up), `/health/metrics-collector` (collector status)

---

*Architecture analysis: 2026-03-26*
