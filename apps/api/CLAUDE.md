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
├── routes/                # Non-tRPC: ai-stream (SSE), mcp, metrics-stream (SSE), log-stream (SSE), pod-terminal (WebSocket), resource-stream (SSE)
├── jobs/                  # Background: health-sync, alert-evaluator, metrics-history-collector, node-sync, event-sync, deploy-smoke-test, metrics-stream-job
├── config/                # Backend-only config (jobs.ts intervals, k8s.ts client pool)
├── services/              # Business logic (AI, anomaly detection)
└── lib/                   # Core modules (no deps on routers/services)
    ├── cluster-client-pool.ts   # Lazy per-cluster K8s clients (AWS/Azure/GKE)
    ├── cluster-watch-manager.ts # K8s informers for pods/deployments/nodes → voyagerEmitter
    ├── resource-watch-manager.ts # K8s informers for 12 additional resource types; Redis cache invalidation
    ├── event-emitter.ts         # Decouples watchers from SSE consumers
    ├── auth.ts                  # Better-Auth handler (/api/auth/*)
    ├── authorization.ts         # DB-backed RBAC
    ├── credential-crypto.ts     # Cluster credential encryption/decryption
    ├── error-handler.ts         # handleK8sError() — shared across all K8s routers
    ├── cache-keys.ts            # Centralized Redis cache key builders
    ├── cache.ts                 # Redis cache (failures are non-fatal)
    ├── health-checks.ts         # Log scanner, startup probe, page smoke, result assessment
    ├── k8s-client-factory.ts    # KubeConfig factory for all providers
    ├── feature-flags.ts         # OpenFeature + flagd
    ├── sentry.ts                # Error tracking (skip client-caused errors)
    └── telemetry.ts             # OpenTelemetry setup
```

## Key Patterns

- **Dependency direction:** routers/ → services/ → lib/ (routers can skip services)
- **Procedure types:** `publicProcedure` (no auth), `protectedProcedure` (session required), `adminProcedure` (admin role), `authorizedProcedure` (RBAC check)
- **Multi-cloud K8s:** Cluster client pool handles AWS EKS, Azure AKS, GCP GKE credential types
- **Redis failures:** Always catch and fall through — never crash the request
- **Audit logging:** `try { logAudit(...) } catch { console.error(...) }` — never break the main operation
- **Rate limiting:** 200 req/min per IP; whitelist: `/api/auth/`, `/health`, `/trpc`
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
| **K8s Resource Routers** | `routers/{resource}.ts` | `authorizedProcedure('cluster', 'viewer')` + `clusterClientPool.getClient()` + `cached()` with 15s TTL (seconds, not ms!). Redis cache auto-invalidated by ResourceWatchManager. Used by: ingresses, statefulSets, daemonSets, jobs, cronJobs, hpa, configMaps, secrets, pvcs, yaml, helm, crds, rbac, networkPolicies, resourceQuotas, topology |
| **Cluster Client Pool** | `lib/cluster-client-pool.ts` | Lazy-loaded per-cluster K8s clients; caches KubeConfig, handles credential decryption |
| **Cluster Watch Manager** | `lib/cluster-watch-manager.ts` | Informers for pods/deployments/nodes → `voyagerEmitter`; auto-reconnects (5s delay) |
| **Resource Watch Manager** | `lib/resource-watch-manager.ts` | Informers for 12 types; reference-counted per SSE subscriber; invalidates Redis cache |
| **Resource Stream Route** | `routes/resource-stream.ts` | SSE `/api/resources/stream` — bridges watch events, buffered, authenticated |
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

### K8S_ENABLED=false Does NOT Disable Sync Jobs
`K8S_ENABLED=false` only disables K8s watchers (informers) and deploy-smoke-test. All sync jobs (health-sync, node-sync, event-sync, metrics-collector, alert-evaluator) **always run**. They handle per-cluster errors gracefully and are required for remotely-added clusters with embedded credentials.

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
