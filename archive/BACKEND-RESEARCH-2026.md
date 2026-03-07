# Voyager Platform — Backend Deep Research 2026

> Generated: 2026-02-28 | Synthesized from 8 research files (09–16) by 3 investigators
> Architect: Opus 4.6 Principal Synthesis

---

## Executive Summary

**Current State:** Voyager has a solid multi-provider foundation — encrypted credential storage, ClusterClientPool with TTL caching, SSE subscriptions via tRPC, health sync polling, and real K8s data for core operations (pod list/delete, deployments CRUD, log streaming, metrics). However, the backend operates at roughly **60% of Lens-quality**: it lacks the Informer pattern (LIST+WATCH with cache/resync), streams from only a single cluster, has no connection state machine, uses polling for logs instead of follow mode, and **6 tRPC procedures return fully mocked data** (seededRandom charts, hardcoded cluster names). The frontend renders these mocks as if they were real, creating a false picture for users.

**Target State:** A Lens-quality real-time K8s management platform with per-cluster Informer-based streaming, a connection state machine driving instant UI feedback, follow-mode log streaming, proactive cloud token refresh, and zero mock data in production — all metrics charts driven by real time-series data collected from K8s Metrics API and stored historically.

**Issue Count:** 🔴 4 Critical (P0) | 🟡 5 High (P1) | 🟢 6 Improvements (P2)

---

## 🔴 Critical Issues (P0 — Blocking)

### P0-1: Six tRPC Procedures Return Fully Mocked Data

**Root cause:** `apps/api/src/routers/metrics.ts` — `clusterHealth`, `resourceUsage`, `requestRates`, `uptimeHistory`, `alertsTimeline` all use `seededRandom()` with hardcoded constants (`SEED.HEALTH_BASE`, `MOCK_CLUSTER_NAMES`, `MOCK_ALERT_TYPES`). `alerts.evaluate` is a stub returning enabled alerts without evaluation.

**Impact:** Users see convincing charts (CPU waves, uptime bars, alert timelines) that are **entirely fake**. Decision-making based on this data is dangerous. Mock cluster names like `prod-us-east` appear in a tool connected to real infrastructure.

**Fix required:**
1. Replace `metrics.clusterHealth` with real per-cluster health history from DB (`healthHistory` table already exists)
2. Replace `metrics.resourceUsage` with time-series data collected from K8s Metrics API polling (store snapshots in new `metricsHistory` table)
3. Replace `metrics.requestRates` with actual API request counters (or remove the chart)
4. Replace `metrics.uptimeHistory` with real cluster uptime derived from `healthHistory` records
5. Replace `metrics.alertsTimeline` with real alerts from K8s Events or a proper alerting engine
6. Implement `alerts.evaluate` to actually check rules against live metrics

**Effort:** 3–5 days

---

### P0-2: No Informer Pattern — Watches Without LIST Resync

**Root cause:** `apps/api/src/lib/k8s-watchers.ts` uses raw `k8s.Watch` directly on `/api/v1/pods`. No initial LIST to populate cache, no `resourceVersion` tracking, no 410 GONE handling.

**Impact:** Clients miss events during watch reconnects. After a disconnection, the watch resumes from "now" — any events that occurred during the gap are permanently lost. No consistent snapshot of cluster state exists server-side.

**Fix required:**
```typescript
// Replace raw Watch with makeInformer
const informer = k8s.makeInformer(kc, '/api/v1/pods',
  () => coreApi.listPodForAllNamespaces());
informer.on('add', (pod) => emit('added', pod));
informer.on('update', (pod) => emit('modified', pod));
informer.on('delete', (pod) => emit('deleted', pod));
informer.on('error', (err) => handleWatchError(err)); // includes 410 re-LIST
```

**Effort:** 2–3 days

---

### P0-3: Single-Cluster Streaming Only

**Root cause:** `k8s-watchers.ts` calls `getKubeConfig()` → returns a single default kubeconfig. `startPodWatcher()` and `startMetricsPoller()` watch ONE cluster. `subscriptions.ts` streams from a global emitter with no `clusterId` parameter.

**Impact:** Multi-cluster UI shows stale data for all clusters except the default one. The core value proposition of a multi-cluster dashboard is broken.

**Fix required:**
- Create `ClusterWatchManager` class with `Map<clusterId, InformerSet>`
- Tag all emitted events with `clusterId`
- Add `clusterId: z.string()` input to all subscription procedures
- Start/stop watchers per cluster lifecycle

**Effort:** 3–5 days

---

### P0-4: Health Check Returns 'unknown' for Non-Minikube Clusters

**Root cause:** `apps/api/src/routers/health.ts` — health check logic:
```typescript
const isMinikube = cluster.provider === 'minikube'
const result = isMinikube ? await performK8sHealthCheck()
  : { status: 'unknown', responseTimeMs: 0 }
```

**Impact:** Any EKS, GKE, AKS, or kubeconfig-based cluster always shows "unknown" health. Only minikube gets real health checks. This defeats the purpose of multi-provider support.

**Fix required:** Use `clusterClientPool.getClient(clusterId)` for ALL providers, not just minikube. The client pool already handles credential decryption and per-provider KubeConfig creation.

**Effort:** 0.5 days

---

## 🟡 High Priority (P1 — Important)

### P1-1: No Connection State Machine

**Root cause:** `health-sync.ts` polls every 5 minutes. No real-time state transitions. `cluster-client-pool.ts` has 5 min TTL but no health-aware eviction.

**Impact:** Up to 5-minute delay before UI reflects cluster going down. No auth expiry detection. No automatic recovery flow.

**Fix required:** Create `ClusterConnectionState` finite state machine:
- States: `connected | connecting | disconnected | error | auth_expired`
- Transitions triggered by watch stream health (real-time, not polled)
- Emit state changes via `voyagerEmitter` → tRPC subscription `clusterHealth`
- File: NEW `lib/cluster-connection-state.ts`

**Effort:** 2–3 days

---

### P1-2: Log Streaming Uses Polling, Not Follow Mode

**Root cause:** `k8s-watchers.ts` `streamLogs()` uses `setInterval` + `readNamespacedPodLog`. Re-fetches entire log tail each interval with timestamp-based dedup.

**Impact:** Log latency depends on poll interval. Unnecessary API load. Missing logs between intervals possible.

**Fix required:**
```typescript
const log = new k8s.Log(kc);
const stream = await log.log(namespace, podName, container, {
  follow: true, tailLines: 100, timestamps: true
});
stream.on('data', (chunk) => emit(parseLogLines(chunk)));
```

**Effort:** 1 day

---

### P1-3: No Token/Certificate Refresh

**Root cause:** `k8s-client-factory.ts` generates EKS/GKE tokens at connection time. `ClusterClientPool` caches for 5 min TTL. No proactive refresh — EKS tokens valid 15 min, so a cached token could expire after cache hit.

**Impact:** Operations fail silently after token expiry. No retry with fresh token on 401/403.

**Fix required:** Track `tokenExpiresAt` in cache entries. Refresh proactively at 80% of lifetime. On 401: attempt one refresh + retry.

**Effort:** 2 days

---

### P1-4: Node & Event Data Not Auto-Synced to DB

**Root cause:** `nodes.list` and `events.list` read from DB only. Population requires manual admin API calls (`nodes.upsert`, `events.create`). No automatic K8s → DB sync.

**Impact:** "Stored" tab shows empty/stale data unless manually populated. Falls back to useless view when live connection unavailable.

**Fix required:** Add background sync jobs that periodically LIST nodes/events from K8s and upsert to DB (similar to existing `health-sync.ts` pattern).

**Effort:** 1–2 days

---

### P1-5: Two Disconnected K8s Connection Paths

**Root cause:** Code uses TWO separate paths:
1. **Global KubeConfig** (`getKubeConfig()`) — deployments, logs, health, watchers, metrics
2. **ClusterClientPool** (`getClient(clusterId)`) — clusters.live, pods.list/delete

**Impact:** Deployments/logs only work against the default cluster. Cannot manage deployments on non-default clusters. Inconsistent behavior.

**Fix required:** Consolidate all K8s operations through `ClusterClientPool`. Remove global kubeconfig path. Pass `clusterId` to all operations.

**Effort:** 2–3 days

---

## 🟢 Improvements (P2 — Quality)

### P2-1: Metrics Polling Not Optimized
Node capacity rarely changes but is re-fetched every poll interval. Cache node allocatable data longer; refresh only on node add/remove events.
**Effort:** 0.5 days

### P2-2: No Namespace/Service/ConfigMap/Secret Management
Only pods and deployments have tRPC procedures. Missing: Namespace CRUD, Services, ConfigMaps, Secrets, PVs, Ingress, CronJobs, RBAC roles.
**Effort:** 1–2 weeks (incremental)

### P2-3: No Horizontal Scaling Path
EventEmitter is process-local. For multi-instance Voyager, need Redis Pub/Sub or NATS as event bus.
**Effort:** 1 week

### P2-4: No Cluster Auto-Discovery
Manual registration only. Could auto-discover from kubeconfig contexts or cloud provider APIs.
**Effort:** 2–3 days

### P2-5: No Multi-Cluster Metrics Aggregation
`metrics.currentStats` is single-cluster only. Dashboard should aggregate across all connected clusters.
**Effort:** 1–2 days

### P2-6: No Alert Evaluation Engine
Alert rules exist in DB but are never evaluated against live data. Need a periodic evaluation loop comparing rules to actual metrics.
**Effort:** 3–5 days

---

## 📊 Mock vs Real Audit Table

| Feature | Status | Data Source | Notes |
|---------|--------|-------------|-------|
| Cluster list | ✅ Real | DB | No live enrichment for inactive clusters |
| Cluster live data | ✅ Real | K8s API (6 parallel calls) | Via ClusterClientPool, 30s cache |
| Pod list | ✅ Real | K8s CoreV1 | 15s cache via `cached()` |
| Pod delete | ✅ Real | K8s CoreV1 | With audit logging |
| Deployment list | ✅ Real | K8s AppsV1 | 30s Redis cache |
| Deployment restart | ✅ Real | K8s AppsV1 | Rolling restart annotation |
| Deployment scale | ✅ Real | K8s AppsV1 | spec.replicas patch |
| Log streaming | ✅ Real | K8s CoreV1 | Polling-based, not follow mode |
| Pod list for logs | ✅ Real | K8s CoreV1 | Authorization-aware |
| Current metrics | ✅ Real | K8s Metrics API | CPU/memory % calculation |
| Health check (minikube) | ✅ Real | K8s CoreV1 | Derives healthy/degraded/critical |
| Pod watch events (SSE) | ✅ Real | K8s Watch API | Single cluster only |
| Metrics polling (SSE) | ✅ Real | K8s Metrics API | Single cluster only |
| **Cluster health timeline** | 🔴 **MOCK** | `seededRandom()` | Fake healthy/degraded/offline % |
| **Resource usage charts** | 🔴 **MOCK** | `sin/cos + random` | CPU/memory from math formulas |
| **Request rates** | 🔴 **MOCK** | Hardcoded | No request tracking exists |
| **Uptime history** | 🔴 **MOCK** | `MOCK_CLUSTER_NAMES` | Hardcoded 'prod-us-east' etc. |
| **Alerts timeline** | 🔴 **MOCK** | `MOCK_ALERT_TYPES` | Random timestamps and counts |
| **Alert evaluation** | 🔴 **STUB** | DB only | Returns enabled list, no evaluation |
| Health check (non-minikube) | ⚠️ Partial | Returns 'unknown' | ClusterClientPool not used |
| Node list | ⚠️ DB-only | No auto-sync | Manual upsert required |
| Event list | ⚠️ DB-only | No auto-sync | Manual creation required |
| Alert CRUD | ⚠️ DB-only | Rules only | No evaluation engine |
| Namespace management | ❌ Missing | — | Only listed in clusters.live |
| Service listing | ❌ Missing | — | No tRPC procedure |
| ConfigMap/Secret mgmt | ❌ Missing | — | No tRPC procedure |
| PV monitoring | ❌ Missing | — | No tRPC procedure |
| Ingress/NetworkPolicy | ❌ Missing | — | No tRPC procedure |
| CronJob/Job mgmt | ❌ Missing | — | No tRPC procedure |
| RBAC management | ❌ Missing | — | No tRPC procedure |

---

## 🏗️ Architecture Recommendations

### How Lens Does It (Reference)

Lens implements the **Informer pattern** as its core streaming architecture:

1. **LIST + WATCH with local cache**: Initial LIST populates in-memory store, WATCH with `resourceVersion` for incremental updates. On 410 GONE → full re-LIST (resync).
2. **Per-resource informers**: Separate watch streams for pods, deployments, nodes, events — each with independent lifecycle.
3. **IPC bridge**: Watch events flow main process → renderer via Electron IPC.
4. **Catalog system**: Clusters are first-class entities. Each cluster stores its own kubeconfig snippet with isolated KubeConfig instance — no cross-contamination.
5. **Connection state machine**: `connected → connecting → disconnected → error` with clear transitions. Watch liveness = cluster health.
6. **Exponential backoff with jitter**: 1s base, doubling to 30s max, random jitter prevents thundering herd on reconnect.
7. **Separate metrics polling**: Metrics API not watchable, polled on separate interval. Node capacity cached long-term.

### What Voyager Needs

```
                    ┌──────────────────────────────────┐
                    │      ClusterWatchManager          │
                    │  ┌─────────┐  ┌─────────┐       │
[Cluster A API] ◄──┤  │Informer │  │Informer │  ...  │
[Cluster B API] ◄──┤  │(pods)   │  │(deploy) │       │
                    │  └────┬────┘  └────┬────┘       │
                    │       │            │             │
                    │  ┌────▼────────────▼────┐       │
                    │  │  Per-Cluster EventBus │       │
                    │  │  (tagged w/ clusterId)│       │
                    │  └────────┬──────────────┘       │
                    └───────────┼──────────────────────┘
                                │
                    ┌───────────▼──────────────────────┐
                    │     Global Event Router           │
                    │  - Routes by clusterId            │
                    │  - Filters by namespace           │
                    │  - Deduplicates                   │
                    └───────────┬──────────────────────┘
                                │
              ┌─────────────────┼─────────────────────┐
              │                 │                      │
        ┌─────▼─────┐   ┌──────▼──────┐   ┌──────────▼───┐
        │ tRPC Sub   │   │ tRPC Sub    │   │ tRPC Sub     │
        │ (pods)     │   │ (metrics)   │   │ (clusterHP)  │
        └─────┬─────┘   └──────┬──────┘   └──────────┬───┘
              │                 │                      │
              └────── SSE ─────┴──────────────────────┘
                                │
                          [Frontend]
```

### Recommended Architecture for 2026

**Core principle:** Every piece of data the user sees must come from a real K8s API call or a time-series record of one. Zero mocks in production.

**Key components to build:**

1. **`ClusterWatchManager`** — Per-cluster informer lifecycle. `Map<clusterId, InformerSet>`. Start/stop watchers tied to cluster connection state.

2. **`ClusterConnectionState`** — Finite state machine per cluster. States: `connected | connecting | disconnected | error | auth_expired`. Transitions driven by watch health + periodic probes.

3. **`MetricsHistoryCollector`** — Background job that snapshots metrics from K8s Metrics API into a `metricsHistory` table. Powers the historical charts that are currently mocked.

4. **Consolidated K8s client path** — All operations through `ClusterClientPool`. Remove global kubeconfig path entirely.

5. **Log follow streams** — Replace polling with `k8s.Log` follow mode.

6. **Token lifecycle** — Track cloud token expiry, proactive refresh at 80% TTL.

**Resource budget per cluster:**
- 5–6 long-lived HTTP connections (one per informer)
- ~100KB–1MB memory for local cache
- 10 clusters = ~60 connections, ~10MB cache (fine for single instance)

---

## ✅ TODO Checklists

### Phase 1 — Fix Critical Bugs (1–2 days)

- [ ] **P0-4**: Fix `health.check` to use `clusterClientPool.getClient()` for ALL providers, not just minikube
- [ ] **P1-5**: Audit all routers using `getKubeConfig()` and add `clusterId` parameter — start consolidating to ClusterClientPool
- [ ] **P0-1 partial**: Add `// TODO: MOCK DATA` comments to all 6 mock procedures so frontend team knows
- [ ] Add integration test: health check returns real status for a kubeconfig-based cluster

### Phase 2 — Real Data (3–5 days)

- [ ] **P0-1**: Create `metricsHistory` DB table (timestamp, clusterId, cpuPercent, memPercent, podCount)
- [ ] **P0-1**: Create `MetricsHistoryCollector` background job — snapshot metrics every 60s per cluster
- [ ] **P0-1**: Replace `metrics.clusterHealth` with real data from `healthHistory` table
- [ ] **P0-1**: Replace `metrics.resourceUsage` with real data from `metricsHistory` table
- [ ] **P0-1**: Replace `metrics.uptimeHistory` with real cluster uptime from `healthHistory`
- [ ] **P0-1**: Replace `metrics.alertsTimeline` with real K8s Events (type=Warning)
- [ ] **P0-1**: Remove or clearly label `metrics.requestRates` (no real data source exists)
- [ ] **P1-4**: Create background sync for nodes (K8s → DB) every 5 min
- [ ] **P1-4**: Create background sync for events (K8s → DB) every 2 min

### Phase 3 — Lens-Quality Streaming (1–2 weeks)

- [ ] **P0-2**: Replace raw `k8s.Watch` with `k8s.makeInformer` in `k8s-watchers.ts`
- [ ] **P0-2**: Add resourceVersion tracking and 410 GONE handling
- [ ] **P0-3**: Create `ClusterWatchManager` class (`lib/cluster-watch-manager.ts`)
- [ ] **P0-3**: Tag all emitted events with `clusterId`
- [ ] **P0-3**: Add `clusterId` input to all subscription procedures in `subscriptions.ts`
- [ ] **P0-3**: Start/stop watchers on cluster connect/disconnect
- [ ] **P1-1**: Create `ClusterConnectionState` FSM (`lib/cluster-connection-state.ts`)
- [ ] **P1-1**: Add `clusterHealth` tRPC subscription
- [ ] **P1-2**: Replace log polling with `k8s.Log` follow mode
- [ ] **P1-3**: Track token expiry in `ClusterClientPool` cache entries
- [ ] **P1-3**: Proactive token refresh at 80% TTL
- [ ] **P1-3**: Retry with fresh token on 401/403
- [ ] **P1-5**: Remove global kubeconfig path entirely — all ops through ClusterClientPool

### Phase 4 — Production Ready (2–3 weeks)

- [ ] **P2-6**: Build alert evaluation engine (periodic loop comparing rules to live metrics)
- [ ] **P2-2**: Add Services tRPC router (list, get)
- [ ] **P2-2**: Add Namespace tRPC router (list, create, delete)
- [ ] **P2-2**: Add ConfigMap/Secret tRPC router (list, get — secrets masked)
- [ ] **P2-5**: Multi-cluster metrics aggregation for dashboard
- [ ] **P2-1**: Optimize metrics polling — cache node capacity, refresh only on node events
- [ ] **P2-4**: Cluster auto-discovery from kubeconfig contexts
- [ ] Add comprehensive error handling decision tree (401→refresh, 410→resync, 429→backoff)
- [ ] Security audit: ensure no skipTLSVerify in production, credential rotation alerts
- [ ] Load test: 10 clusters, verify resource budget (~60 connections, ~10MB)

---

## 🔧 Implementation Guides

### Guide 1: Replace Mock Metrics with Real Data

**Files to modify:**
- `apps/api/src/routers/metrics.ts` — replace all 5 mock procedures
- `packages/db/src/schema.ts` — add `metricsHistory` table
- `apps/api/src/jobs/` — new `metrics-history-collector.ts`

**Schema:**
```typescript
// packages/db/src/schema.ts
export const metricsHistory = pgTable('metrics_history', {
  id: serial('id').primaryKey(),
  clusterId: text('cluster_id').notNull().references(() => clusters.id),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  cpuPercent: real('cpu_percent'),
  memoryPercent: real('memory_percent'),
  podCount: integer('pod_count'),
  nodeCount: integer('node_count'),
});
```

**Collector job:**
```typescript
// apps/api/src/jobs/metrics-history-collector.ts
export function startMetricsHistoryCollector(intervalMs = 60_000) {
  setInterval(async () => {
    const clusters = await db.select().from(clustersTable).where(eq(status, 'connected'));
    for (const cluster of clusters) {
      try {
        const kc = await clusterClientPool.getClient(cluster.id);
        const metrics = await fetchMetrics(kc); // existing logic from metrics.currentStats
        await db.insert(metricsHistory).values({
          clusterId: cluster.id,
          timestamp: new Date(),
          cpuPercent: metrics.cpuPercent,
          memoryPercent: metrics.memoryPercent,
          podCount: metrics.podCount,
        });
      } catch (e) { /* log, don't crash */ }
    }
  }, intervalMs);
}
```

**Replace mock procedure:**
```typescript
// metrics.ts — clusterHealth (BEFORE: seededRandom)
clusterHealth: protectedProcedure
  .input(z.object({ range: z.enum(['1h','6h','24h','7d']) }))
  .query(async ({ input }) => {
    const since = rangeToDate(input.range);
    const history = await db.select()
      .from(healthHistory)
      .where(and(gte(healthHistory.checkedAt, since)))
      .orderBy(asc(healthHistory.checkedAt));
    return aggregateHealthTimeline(history);
  }),
```

**Test:**
```typescript
// tests/metrics-real-data.test.ts
it('clusterHealth returns real data from healthHistory', async () => {
  await db.insert(healthHistory).values([...testData]);
  const result = await caller.metrics.clusterHealth({ range: '1h' });
  expect(result.every(p => p.healthy + p.degraded + p.offline === 100)).toBe(true);
  expect(result.length).toBeGreaterThan(0);
});
```

---

### Guide 2: Implement Informer Pattern

**Files to modify:**
- `apps/api/src/lib/k8s-watchers.ts` — replace Watch with makeInformer

**Pattern:**
```typescript
import * as k8s from '@kubernetes/client-node';

export function createPodInformer(kc: k8s.KubeConfig, clusterId: string) {
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  
  const informer = k8s.makeInformer(
    kc,
    '/api/v1/pods',
    () => coreApi.listPodForAllNamespaces()
  );

  informer.on('add', (pod: k8s.V1Pod) => {
    voyagerEmitter.emit('pod-event', {
      type: 'added', clusterId,
      pod: mapPodToDto(pod),
    });
  });

  informer.on('update', (pod: k8s.V1Pod) => {
    voyagerEmitter.emit('pod-event', {
      type: 'modified', clusterId,
      pod: mapPodToDto(pod),
    });
  });

  informer.on('delete', (pod: k8s.V1Pod) => {
    voyagerEmitter.emit('pod-event', {
      type: 'deleted', clusterId,
      pod: mapPodToDto(pod),
    });
  });

  informer.on('error', (err: any) => {
    // 410 GONE is handled internally by makeInformer (re-LIST)
    // Other errors: log + emit health change
    voyagerEmitter.emit('cluster-state-change', {
      clusterId, state: 'disconnected', error: err.message,
    });
  });

  return informer;
}
```

**Test:**
```typescript
it('informer emits pod events with clusterId', async () => {
  const events: any[] = [];
  voyagerEmitter.on('pod-event', (e) => events.push(e));
  const informer = createPodInformer(testKc, 'test-cluster');
  await informer.start();
  // Create a pod in test cluster
  await coreApi.createNamespacedPod('default', testPod);
  await waitFor(() => events.length > 0);
  expect(events[0].clusterId).toBe('test-cluster');
  expect(events[0].type).toBe('added');
  informer.stop();
});
```

---

### Guide 3: ClusterWatchManager

**New file:** `apps/api/src/lib/cluster-watch-manager.ts`

```typescript
interface ClusterInformerSet {
  pods: k8s.Informer<k8s.V1Pod>;
  deployments: k8s.Informer<k8s.V1Deployment>;
  nodes: k8s.Informer<k8s.V1Node>;
  metricsInterval: NodeJS.Timeout;
}

class ClusterWatchManager {
  private clusters = new Map<string, ClusterInformerSet>();

  async startCluster(clusterId: string): Promise<void> {
    if (this.clusters.has(clusterId)) return;
    
    const kc = await clusterClientPool.getClient(clusterId);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);

    const pods = k8s.makeInformer(kc, '/api/v1/pods',
      () => coreApi.listPodForAllNamespaces());
    const deployments = k8s.makeInformer(kc, '/apis/apps/v1/deployments',
      () => appsApi.listDeploymentForAllNamespaces());
    const nodes = k8s.makeInformer(kc, '/api/v1/nodes',
      () => coreApi.listNode());

    // Wire events with clusterId tag
    this.wireInformer(pods, clusterId, 'pod');
    this.wireInformer(deployments, clusterId, 'deployment');
    this.wireInformer(nodes, clusterId, 'node');

    await Promise.all([pods.start(), deployments.start(), nodes.start()]);
    
    const metricsInterval = setInterval(
      () => this.pollMetrics(clusterId, kc), 30_000);

    this.clusters.set(clusterId, { pods, deployments, nodes, metricsInterval });
  }

  stopCluster(clusterId: string): void {
    const set = this.clusters.get(clusterId);
    if (!set) return;
    set.pods.stop();
    set.deployments.stop();
    set.nodes.stop();
    clearInterval(set.metricsInterval);
    this.clusters.delete(clusterId);
  }

  private wireInformer<T>(informer: k8s.Informer<T>, clusterId: string, resource: string) {
    for (const event of ['add', 'update', 'delete'] as const) {
      informer.on(event, (obj: T) => {
        voyagerEmitter.emit(`${resource}-event`, {
          type: event === 'add' ? 'added' : event === 'update' ? 'modified' : 'deleted',
          clusterId,
          data: obj,
        });
      });
    }
    informer.on('error', (err) => {
      connectionState.onWatchError(clusterId, err);
    });
  }
}

export const clusterWatchManager = new ClusterWatchManager();
```

---

### Guide 4: Fix Health Check for All Providers

**File:** `apps/api/src/routers/health.ts`

```typescript
// BEFORE (broken):
const isMinikube = cluster.provider === 'minikube';
const result = isMinikube ? await performK8sHealthCheck() : { status: 'unknown' };

// AFTER (fixed):
const hasCredentials = cluster.connectionConfig && Object.keys(cluster.connectionConfig).length > 0;
if (hasCredentials) {
  try {
    const kc = await clusterClientPool.getClient(cluster.id);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const start = Date.now();
    const [nodes, pods] = await Promise.all([
      coreApi.listNode(),
      coreApi.listPodForAllNamespaces(),
    ]);
    const responseTimeMs = Date.now() - start;
    result = deriveHealthStatus(nodes.items, pods.items, responseTimeMs);
  } catch (err) {
    result = { status: 'unreachable', responseTimeMs: 0, error: err.message };
  }
} else {
  result = { status: 'unknown', responseTimeMs: 0, details: { reason: 'No credentials configured' } };
}
```

**Test:**
```typescript
it('health.check returns real status for EKS cluster with credentials', async () => {
  const result = await caller.health.check({ clusterId: eksClusterId });
  expect(result.status).not.toBe('unknown');
  expect(['healthy', 'degraded', 'critical', 'unreachable']).toContain(result.status);
});
```

---

### Guide 5: Log Follow Mode

**File:** `apps/api/src/lib/k8s-watchers.ts`

```typescript
// BEFORE: polling with setInterval
export function streamLogs(podKey, namespace, podName, container) {
  const interval = setInterval(async () => {
    const log = await coreApi.readNamespacedPodLog(podName, namespace, {
      tailLines: 100, timestamps: true
    });
    voyagerEmitter.emitLogLine(podKey, parseLogs(log));
  }, 2000);
}

// AFTER: follow mode
export async function streamLogsFollow(
  clusterId: string, namespace: string, podName: string,
  container: string | undefined, signal: AbortSignal
) {
  const kc = await clusterClientPool.getClient(clusterId);
  const log = new k8s.Log(kc);
  const podKey = `${clusterId}/${namespace}/${podName}`;
  
  const stream = await log.log(namespace, podName, container ?? '', {
    follow: true,
    tailLines: 100,
    timestamps: true,
  });

  stream.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      voyagerEmitter.emit('log-line', { podKey, line: parseLogLine(line) });
    }
  });

  stream.on('error', (err) => {
    voyagerEmitter.emit('log-error', { podKey, error: err.message });
  });

  signal.addEventListener('abort', () => stream.destroy());
}
```

---

### Configuration Constants

Add to `packages/config/src/sse.ts`:
```typescript
export const INFORMER_RESYNC_PERIOD_MS = 30 * 60 * 1000;     // 30min full resync
export const CLUSTER_WATCH_STARTUP_DELAY_MS = 1000;           // stagger per-cluster
export const MAX_CONCURRENT_CLUSTER_WATCHES = 20;
export const TOKEN_REFRESH_THRESHOLD_RATIO = 0.8;             // refresh at 80% TTL
export const METRICS_HISTORY_INTERVAL_MS = 60_000;            // 1 min snapshots
export const METRICS_HISTORY_RETENTION_DAYS = 30;             // purge after 30 days
```

---

## Appendix: Research Sources

This document synthesizes findings from 8 research files produced by 3 parallel investigators:
- **Files 09–10**: Lens/Rancher/Headlamp pattern analysis & Voyager gap analysis
- **Files 11–12**: Streaming architecture design & multi-cluster best practices
- **Files 13–14**: Complete data flow audit & mock vs real audit
- **Files 15–16**: Missing implementations inventory & frontend tRPC call mapping
- **Files 01–08**: Not available (kubeconfig parsing, client creation, live data, error handling, network connectivity, DB schema, mock audit, root cause) — investigators may still be producing these

---

*Document version: 1.0 | 2026-02-28 | ~15 issues identified | Guides the entire Phase E development*
