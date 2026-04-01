# apps/api — Fastify Backend

Fastify 5 + tRPC 11 + Drizzle ORM backend. Entry point: `src/server.ts`.

## Commands

```bash
pnpm dev              # tsx watch, port from .env (default 4000)
pnpm build            # tsc (builds @voyager/types and @voyager/db first)
pnpm test             # vitest run
pnpm test -- src/__tests__/auth.test.ts  # single file
pnpm seed:admin       # seed admin user
```

## Source Layout

```
src/
├── server.ts              # Entry point (DO NOT add migrate() here — Iron Rule #1)
├── trpc.ts                # Context, procedure definitions (public/protected/admin/authorized)
├── routers/               # 45 tRPC routers (index.ts = registry)
├── routes/                # Non-tRPC: ai-stream (SSE), mcp, metrics-stream (SSE), log-stream (SSE), pod-terminal (WebSocket), resource-stream (SSE), watch-health
├── jobs/                  # Background: alert-evaluator, metrics-history-collector, deploy-smoke-test, metrics-stream-job, data-retention
├── config/                # Backend-only config (jobs.ts intervals, k8s.ts client pool)
├── services/              # Business logic (ai-service, ai-provider, ai-key-crypto, ai-key-settings-service, ai-conversation-store, anomaly-service)
└── lib/                   # Core modules (no deps on routers/services)
    ├── auth.ts                  # Better-Auth handler (/api/auth/*)
    ├── auth-bootstrap.ts        # Auth system initialization
    ├── auth-error-mapping.ts    # Auth error → HTTP status/body mapping
    ├── auth-guard.ts            # Request authentication gate (shouldRequireAuth)
    ├── auth-origins.ts          # CORS allowed origins
    ├── auth-request.ts          # External request URL resolution
    ├── authorization.ts         # DB-backed RBAC
    ├── audit.ts                 # Audit trail logging
    ├── cache.ts                 # Redis cache (failures are non-fatal, used as fallback when watches not ready)
    ├── cache-keys.ts            # Centralized Redis cache key builders (fallback path only)
    ├── cluster-client-pool.ts   # Lazy per-cluster K8s clients (AWS/Azure/GKE)
    ├── connection-config.ts     # Connection configuration constants
    ├── connection-tracker.ts    # SSE connection tracking + ConnectionLimiter (socket-based limits)
    ├── credential-crypto.ts     # Cluster credential encryption/decryption
    ├── ensure-admin-user.ts     # Bootstrap admin user on startup
    ├── ensure-bootstrap-user.ts # Bootstrap system user on startup
    ├── ensure-viewer-user.ts    # Bootstrap viewer user on startup
    ├── error-handler.ts         # handleK8sError() — shared across all K8s routers
    ├── event-emitter.ts         # Decouples watchers from SSE consumers
    ├── feature-flags.ts         # OpenFeature + flagd
    ├── health-checks.ts         # Log scanner, startup probe, page smoke, result assessment
    ├── k8s.ts                   # K8s utility helpers
    ├── k8s-client-factory.ts    # KubeConfig factory for all providers
    ├── k8s-units.ts             # K8s resource unit parsing (CPU/memory)
    ├── karpenter-constants.ts   # Karpenter resource type constants
    ├── karpenter-service.ts     # Karpenter business logic
    ├── openapi.ts               # OpenAPI/Swagger spec generation
    ├── presence.ts              # User presence tracking + periodic sweep
    ├── providers.ts             # Cloud provider utilities
    ├── relation-resolver.ts      # Resource family graph walker (resolveRelations — used by relations router)
    ├── resource-mappers.ts      # 17 shared mapper functions (K8s objects → frontend shapes)
    ├── sentry.ts                # Error tracking (skip client-caused errors)
    ├── sso.ts                   # SSO provider integration
    ├── telemetry.ts             # OpenTelemetry setup
    ├── watch-db-writer.ts       # Debounced PostgreSQL sync from watch events (health, nodes, events, K8s version)
    └── watch-manager.ts         # Unified K8s informers — in-memory ObjectCache for all 17 resource types
```

## Key Patterns

- **Dependency direction:** routers/ → services/ → lib/ (routers can skip services)
- **Procedure types:** `publicProcedure` (no auth), `protectedProcedure` (session required), `adminProcedure` (admin role), `authorizedProcedure` (RBAC check)
- **Multi-cloud K8s:** Cluster client pool handles AWS EKS, Azure AKS, GCP GKE credential types
- **Redis failures:** Always catch and fall through — never crash the request
- **Audit logging:** `try { logAudit(...) } catch { console.error(...) }` — never break the main operation
- **Rate limiting:** 200 req/min per IP; whitelist: `/api/auth/`, `/health`, `/api/resources/stream`, `/api/metrics/stream`, `/api/logs/stream`
- **Health endpoints:** `/health` (always up), `/health/metrics-collector` (collector status)

### Error Handling

- **K8s router errors:** Use `handleK8sError(error, operation)` from `lib/error-handler.ts` — standardized across all K8s routers
- tRPC errors: `TRPCError { code, message }` — codes: `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_SERVER_ERROR`
- Client-caused errors (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`) → no Sentry; server errors → Sentry
- K8s connection errors: logged, don't crash API; health check returns degraded

### Cache Keys

All Redis cache keys are centralized in `lib/cache-keys.ts`. **Never construct cache key strings inline** — use `CACHE_KEYS.k8sServices(clusterId, ns)` etc. This prevents key format drift and makes invalidation patterns reliable.

## Key Abstractions

| Abstraction | File | Pattern |
|-------------|------|---------|
| **K8s Resource Routers** | `routers/{resource}.ts` | `watchManager.getResources()` for in-memory data (returns null if not ready → fallback to `cached()` K8s API call). 17 watched types + topology + clusters. Non-watched: yaml, helm, crds, rbac |
| **Unified WatchManager** | `lib/watch-manager.ts` | Single manager for all 17 K8s resource types. Informer ObjectCache = in-memory store. Per-cluster persistent lifecycle with reference counting. `getResources()` returns null until informer initial list completes (prevents race condition). Exponential backoff reconnect on errors. **60s grace period** on last subscriber disconnect — prevents cold cache on browser refresh. |
| **Resources Router** | `routers/resources.ts` | Generic `resources.snapshot` endpoint — returns all cached WatchManager data in one HTTP response for instant page load |
| **Resource Mappers** | `lib/resource-mappers.ts` | 17 shared mapper functions (K8s raw → frontend shape). Used by both tRPC routers and SSE events to guarantee identical data shapes. |
| **Watch DB Writer** | `lib/watch-db-writer.ts` | Debounced periodic PostgreSQL sync from watch events. Syncs health status, node counts, events, and K8s server version (via VersionApi) to clusters table. |
| **Cluster Client Pool** | `lib/cluster-client-pool.ts` | Lazy-loaded per-cluster K8s clients; caches KubeConfig, handles credential decryption |
| **Resource Stream Route** | `routes/resource-stream.ts` | SSE `/api/resources/stream` — immediate flush (no batching), per-cluster persistent watches with shared replay buffer, socket-tracked connection limits |
| **Event Emitter** | `lib/event-emitter.ts` | Decouples watchers from SSE (one watch, many consumers) |
| **Metrics Stream Job** | `jobs/metrics-stream-job.ts` | Reference-counted K8s metrics polling — starts on first SSE subscriber |
| **Metrics SSE Route** | `routes/metrics-stream.ts` | `/api/metrics/stream?clusterId=<uuid>` — live K8s metrics at 10-15s resolution |
| **Pod Terminal Route** | `routes/pod-terminal.ts` | WebSocket pod exec — `@fastify/websocket` bridged to K8s Exec |
| **Log Stream Route** | `routes/log-stream.ts` | SSE pod log streaming with follow mode |
| **YAML Router** | `routers/yaml.ts` | Universal K8s raw resource fetcher (16 types) |
| **Helm Router** | `routers/helm.ts` | Helm releases — base64+gzip decode from K8s secrets |
| **CRD Router** | `routers/crds.ts` | CRD browser (ApiextensionsV1Api + CustomObjectsApi) |
| **RBAC Router** | `routers/rbac.ts` | Permission matrix aggregation |
| **Topology Router** | `routers/topology.ts` | Resource topology graph (nodes + edges) |

## Adding a New Router

1. Create `src/routers/my-feature.ts` with tRPC procedures
2. Register in `src/routers/index.ts`
3. Export types for the web app via `@voyager/types` if needed

## Gotchas

### K8S_ENABLED=false Does NOT Disable All Jobs
`K8S_ENABLED=false` only disables K8s watchers (informers) and deploy-smoke-test. Remaining jobs (metrics-history-collector, alert-evaluator) **always run**. They handle per-cluster errors gracefully and are required for remotely-added clusters with embedded credentials.

### Provider ≠ Auth Mechanism — Kubeconfig-First in Client Factory
`provider` (aws/azure/gke/minikube/kubeconfig) tells us WHERE the cluster lives — for display (logos, labels). The `connectionConfig` shape determines HOW to authenticate. `createKubeConfigForCluster` checks for a `kubeconfig` field first — if present, uses `kc.loadFromString()` regardless of provider. Provider-specific auth (AWS STS, Azure credential, GKE service account) is only used when native credentials are provided. **Never assume `provider: 'aws'` means AWS access keys** — it can be a kubeconfig for an EKS cluster.

### Kubeconfig Provider — Context Fallback
When loading a kubeconfig via `loadFromString()`, if no explicit `context` param is provided, the factory falls back to `current-context` from the YAML, then to the first context. Without this, the KubeConfig object may have no context selected, causing API calls to fail silently.

### Cluster List Node Count Comes from `nodes` Table
The cluster list page gets `nodeCount` by counting rows in the `nodes` table (populated by node-sync), NOT from `clusters.nodesCount`. If node-sync isn't running, cluster cards show 0 nodes.

### Metrics Response Shape — Wrapped Object
`metrics.history` returns `{ data: MetricsDataPoint[], serverTime: string, intervalMs: number }`, NOT a flat array. All consumers must access `.data` property.

### handleK8sError Causes `void` Return Type Inference
Routers using `handleK8sError(err, op)` in catch blocks infer return type as `void | undefined`. Frontend `.data` gets `void | undefined`. **Fix:** define explicit interface types and cast with `as`.

### Pod Terminal — First WebSocket in Codebase
`routes/pod-terminal.ts` uses `@fastify/websocket`. The plugin must be registered in `server.ts` before any WS routes. Uses `@kubernetes/client-node` `Exec` bridged to browser WS via PassThrough streams.

### Helm Release Decoding — base64 + gzip + JSON
Helm v3 stores releases as K8s Secrets (`type=helm.sh/release.v1`). Decode: `Buffer.from(b64, 'base64')` → `zlib.gunzipSync()` → `JSON.parse()`. List metadata-only first, decode on-demand to avoid OOM.

### Redis `cached()` TTL Is in SECONDS, Not Milliseconds
`cached(key, ttl, fn)` passes `ttl` to `redis.setEx()` which expects **seconds**. `cached(key, 15_000, fn)` = 15,000 seconds (4.1 hours), not 15 seconds. Always use plain integers.

### K8s Informers Do NOT Auto-Reconnect
`makeInformer()` does not reconnect on error. **Always call `informer.start()` in the error handler** with a delay (5s). Both watch managers implement this. Without it, all live data stops after first network hiccup.

### SSE Endpoints Must Flush Immediately
SSE endpoints must write data immediately after `writeHead()` — e.g., `reply.raw.write(':connected\n\n')`. Without this, the proxy and browser hang in CONNECTING state waiting for the first byte.

### SSE Routes Require `reply.hijack()` Before `writeHead()`
All SSE routes must call `reply.hijack()` before `reply.raw.writeHead()`. Without it, Fastify 5 tries to send its own response after the async handler completes → "invalid payload type" error → SSE connection killed immediately after `:connected`. All 5 SSE routes (resource-stream, metrics-stream, log-stream, ai-stream, mcp) follow this pattern.

### WatchManager Status Events Are Silent for Individual Informers
Individual informer error/reconnect cycles do NOT emit SSE status events. Only cluster-level `connected` (on initial subscribe) and `disconnected` (all informers failed) are sent to clients. This prevents the browser from showing "Reconnecting..." due to normal informer churn. The `watch-db-writer.ts` `newListener` handler uses a re-entrancy guard flag (`addingStatusListener`) to prevent infinite recursion when subscribing to new `watch-status:*` channels.

### SSE Connection Limits Use Socket-Tracking, Not Counters
`ConnectionLimiter` in `connection-tracker.ts` tracks actual `ServerResponse` references and auto-purges destroyed/ended sockets before checking limits. Never use simple increment/decrement counters for SSE — they leak under rapid EventSource reconnections.
