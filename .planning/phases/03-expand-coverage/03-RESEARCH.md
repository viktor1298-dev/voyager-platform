# Phase 3: Expand Coverage - Research

**Researched:** 2026-03-30
**Domain:** K8s Watch API expansion, per-cluster lifecycle, derived resource data
**Confidence:** HIGH

## Summary

Phase 3 extends the live data pipeline from 15 directly-watched resource types to full coverage of all 24 cluster tab resource types. The existing WatchManager, SSE endpoint, and Zustand resource store are well-architected and handle the extension mechanically: adding a new watched type requires an entry in `RESOURCE_DEFS`, a mapper function, and a `ResourceType` union member. The more nuanced work involves derived data (Helm releases from secrets, topology from existing watches, CRDs and RBAC via on-demand tRPC), per-cluster watch lifecycle verification, and switching remaining frontend tabs from tRPC polling to Zustand store selectors.

The codebase is in excellent shape for this phase. Phase 1 fixed informer lifecycle and Phase 2 added reconnection resilience + event buffering. The SSE pipeline (informer -> EventEmitter -> SSE -> useResourceSSE -> Zustand store) is proven for 15 types. Adding network-policies and resource-quotas as new informer types is a straightforward extension of existing patterns. The harder design work is the derived-data strategy for Helm (filter secrets watch), topology (client-side computation), and the non-watchable types (CRDs via tRPC, RBAC via tRPC).

**Primary recommendation:** Split into 3 plans: (1) Backend expansion: add 2 new informer types + Helm derivation from secrets + watch health metrics endpoint; (2) Frontend wiring: switch all remaining tabs from tRPC to Zustand store + add topology client-side derivation; (3) Per-cluster lifecycle hardening + verification across all 24 tabs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-00:** Match Rancher/Lens approach for all live data decisions. User explicitly deferred all grey areas to Claude with this directive.
- **D-01:** Helm releases derived from watched secrets (Helm stores release data as secrets with label `owner=helm`). No new informer -- filter existing secrets watch. Rancher uses this exact pattern.
- **D-02:** Topology derived from existing pod/service/deployment watches. Topology is a computed view, not a K8s resource. Build topology graph client-side from Zustand store data.
- **D-03:** RBAC tab uses tRPC fetch on tab focus, no watch. K8s has no RBAC watch API (out-of-scope per REQUIREMENTS.md). Refresh on tab focus or manual refresh button.
- **D-04:** CRD definitions listed via tRPC, no live watch. Dynamic informers for custom resources are v2 scope (ADV-02). CRD tab shows current state, not live updates.
- **D-05:** Add network-policies and resource-quotas as new informer resource types in WatchManager.
- **D-06:** Watches start when user opens a cluster detail page (SSE subscribe), stop when they leave (SSE unsubscribe triggers reference count -> 0 -> stopAll). WatchManager already has reference counting.
- **D-07:** Cluster switch cleanup: when user navigates from Cluster A to Cluster B, Cluster A watches stop within 10 seconds (success criterion #3). Client-side: `useResourceSSE` cleanup runs on clusterId change. Server-side: `unsubscribe()` -> reference count reaches 0 -> informers stop.

### Claude's Discretion
- All implementation choices deferred to Claude with "match Rancher/Lens" directive
- Exact resource type additions to ResourceType union type
- How to expose watch health/metrics via API endpoint (success criterion #4)
- Autoscaling tab handling (may overlap with existing HPA watch)
- Logs and metrics tabs (separate SSE streams, not watch-based)

### Deferred Ideas (OUT OF SCOPE)
- Dynamic CRD informers (ADV-02) -- v2 scope
- Multi-replica SSE scaling (ADV-01) -- v2 scope
- Live metrics streaming improvements (ADV-03) -- v2 scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COVER-01 | All 15 currently-watched types update in browser via live SSE without polling or page refresh | Current state audit shows 13/15 already use Zustand store; 2 tabs (overview fallback paths, events DB fallback) need tRPC polling removal |
| COVER-02 | Per-cluster on-demand watching -- start watches when user opens a cluster, stop when they leave (30-cluster scale) | WatchManager already reference-counted; layout already calls `useResourceSSE(clusterId)` with cleanup on unmount; verification and metrics endpoint needed |
| COVER-03 | Expand to all 24 cluster tab types -- add network policies, resource quotas to informers; derive Helm from watched secrets; derive topology from pods/services/deployments; handle CRDs and RBAC | 2 new RESOURCE_DEFS entries + 2 new mappers + ResourceType union update; Helm derivation from secrets; topology client-side; CRDs/RBAC via tRPC |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **ESM-only**: All packages are ESM (`"type": "module"`) -- use `.js` extensions in imports even for `.ts` files
- **Biome lint**: 2-space indent, 100-char line width, single quotes, semicolons as-needed
- **Zod v4**: `z.record()` requires TWO arguments
- **No migrate() in server.ts**: Schema managed exclusively via `charts/voyager/sql/init.sql`
- **Centralized config**: Do NOT add new hardcoded values to routers or jobs -- add constants to appropriate config file
- **Cache keys centralized**: Never construct cache key strings inline -- use `CACHE_KEYS` from `lib/cache-keys.ts`
- **@voyager/ prefix**: Workspace packages use `@voyager/db`, `@voyager/types`, `@voyager/config`
- **handleK8sError**: All K8s router errors must use `handleK8sError(error, operation)` from `lib/error-handler.ts`
- **Iron Rule: Design system**: Before any UI/animation change, read `docs/DESIGN.md`

## Architecture Patterns

### Current Tab Data Source Audit

Understanding which tabs already use live Zustand data vs tRPC polling is critical for planning:

**Already using Zustand store (SSE-fed, live):**
| Tab | Source | Status |
|-----|--------|--------|
| Overview | `useClusterResources` for nodes, events, pods, namespaces | LIVE (with DB fallback for events/nodes/anomalies) |
| Pods | `useClusterResources<PodData>('pods')` | LIVE |
| Deployments | `useClusterResources<DeploymentDetail>('deployments')` | LIVE |
| StatefulSets | `useClusterResources<StatefulSetData>('statefulsets')` | LIVE |
| DaemonSets | `useClusterResources<DaemonSetData>('daemonsets')` | LIVE |
| Services | `useClusterResources<ServiceDetail>('services')` | LIVE |
| Ingresses | `useClusterResources<IngressData>('ingresses')` | LIVE |
| Jobs | `useClusterResources<JobData>('jobs')` | LIVE |
| CronJobs | `useClusterResources<CronJobData>('cronjobs')` | LIVE |
| HPA | `useClusterResources<HPAData>('hpa')` | LIVE |
| ConfigMaps | `useClusterResources<ConfigMapData>('configmaps')` | LIVE |
| Secrets | `useClusterResources<SecretData>('secrets')` | LIVE |
| PVCs | `useClusterResources<PVCData>('pvcs')` | LIVE |
| Namespaces | `useClusterResources<NamespaceData>('namespaces')` | LIVE |
| Nodes | `useClusterResources<LiveNode>('nodes')` | LIVE |
| Events | `useClusterResources<RawEvent>('events')` + DB fallback | LIVE (hybrid) |

**Still using tRPC polling (need conversion or confirmation):**
| Tab | Current Source | Target |
|-----|---------------|--------|
| Network Policies | `trpc.networkPolicies.list.useQuery` | Switch to Zustand (after adding informer) |
| Resource Quotas | `trpc.resourceQuotas.list.useQuery` | Switch to Zustand (after adding informer) |
| Helm | `trpc.helm.list.useQuery` | Derive from watched secrets in Zustand store |
| Topology | `trpc.topology.graph.useQuery` | Client-side derivation from Zustand store data |
| CRDs | `trpc.crds.list.useQuery` | Keep tRPC (D-04: no live watch) |
| RBAC | `trpc.rbac.matrix.useQuery` | Keep tRPC (D-03: no watch API) |
| Autoscaling (Karpenter) | `trpc.karpenter.*.useQuery` | Keep tRPC (CRD-based, v2 scope for dynamic informers) |
| Logs | `trpc.logs.*.useQuery` + SSE log stream | Keep separate SSE stream (not K8s watch-based) |
| Metrics | `trpc.clusters.live.useQuery` + SSE metrics stream | Keep separate SSE stream (not K8s watch-based) |

### Recommended Project Structure Changes

```
packages/types/src/sse.ts
  └── ResourceType union: ADD 'network-policies' | 'resource-quotas'

apps/api/src/lib/
  ├── watch-manager.ts        # ADD 2 entries to RESOURCE_DEFS
  ├── resource-mappers.ts     # ADD mapNetworkPolicy(), mapResourceQuota()
  └── watch-health.ts         # NEW: watch health/metrics for API endpoint

apps/api/src/routes/
  └── watch-health.ts         # NEW: GET /api/watches/health endpoint

apps/web/src/app/clusters/[id]/
  ├── network-policies/page.tsx  # MODIFY: tRPC -> useClusterResources
  ├── resource-quotas/page.tsx   # MODIFY: tRPC -> useClusterResources
  ├── helm/page.tsx              # MODIFY: derive from secrets in Zustand store
  └── (topology component)       # MODIFY: client-side derivation from Zustand
```

### Pattern 1: Adding a New Watched Resource Type

**What:** Mechanical pattern for adding network-policies and resource-quotas to WatchManager.
**When:** For any K8s resource that has a standard LIST+WATCH API.

```typescript
// 1. Add to ResourceType union in packages/types/src/sse.ts
export type ResourceType =
  | 'pods' | 'deployments' | ... // existing 15
  | 'network-policies'           // NEW
  | 'resource-quotas'            // NEW

// 2. Add mapper in apps/api/src/lib/resource-mappers.ts
export function mapNetworkPolicy(np: k8s.V1NetworkPolicy) {
  return {
    name: np.metadata?.name ?? '',
    namespace: np.metadata?.namespace ?? '',
    createdAt: np.metadata?.creationTimestamp
      ? new Date(np.metadata.creationTimestamp as unknown as string).toISOString()
      : null,
    podSelector: (np.spec?.podSelector?.matchLabels as Record<string, string>) ?? {},
    policyTypes: np.spec?.policyTypes ?? [],
    ingressRules: (np.spec?.ingress ?? []).map((rule) => ({
      from: (rule._from ?? []).map((peer) => ({
        podSelector: (peer.podSelector?.matchLabels as Record<string, string>) ?? null,
        namespaceSelector: (peer.namespaceSelector?.matchLabels as Record<string, string>) ?? null,
        ipBlock: peer.ipBlock ? { cidr: peer.ipBlock.cidr, except: peer.ipBlock.except ?? [] } : null,
      })),
      ports: (rule.ports ?? []).map((p) => ({
        protocol: p.protocol ?? 'TCP',
        port: p.port != null ? String(p.port) : null,
      })),
    })),
    egressRules: (np.spec?.egress ?? []).map((rule) => ({
      to: (rule.to ?? []).map((peer) => ({
        podSelector: (peer.podSelector?.matchLabels as Record<string, string>) ?? null,
        namespaceSelector: (peer.namespaceSelector?.matchLabels as Record<string, string>) ?? null,
        ipBlock: peer.ipBlock ? { cidr: peer.ipBlock.cidr, except: peer.ipBlock.except ?? [] } : null,
      })),
      ports: (rule.ports ?? []).map((p) => ({
        protocol: p.protocol ?? 'TCP',
        port: p.port != null ? String(p.port) : null,
      })),
    })),
    labels: (np.metadata?.labels as Record<string, string>) ?? {},
  }
}

// 3. Add to RESOURCE_DEFS in apps/api/src/lib/watch-manager.ts
{
  type: 'network-policies',
  apiPath: '/apis/networking.k8s.io/v1/networkpolicies',
  listFn: networkingV1ListFn('listNetworkPolicyForAllNamespaces'),
  mapper: (obj) => mappers.mapNetworkPolicy(obj as k8s.V1NetworkPolicy),
},

// 4. Switch frontend tab from tRPC to Zustand
// In network-policies/page.tsx:
const policies = useClusterResources<PolicyItem>(clusterId, 'network-policies')
```

**Confidence:** HIGH -- this exactly matches the established pattern for 15 existing types.

### Pattern 2: Helm Derivation from Secrets Watch (D-01)

**What:** Derive Helm release list from the already-watched `secrets` resource type by filtering for `owner=helm` label.
**When:** Helm tab loads -- read secrets from Zustand store, filter and decode client-side.

There are two options:

**Option A: Server-side derivation in snapshot/watch events** -- WatchManager detects Helm secrets and emits synthetic `helm-releases` events alongside the regular `secrets` events. This requires a new pseudo-resource type in the SSE stream.

**Option B: Client-side derivation from Zustand store** -- The Helm tab page reads all secrets from the Zustand store, filters for `labels.owner === 'helm'` and `type === 'helm.sh/release.v1'`, groups by release name, and shows the latest revision. No backend changes needed.

**Recommendation: Option B (client-side derivation).**

Reasons:
1. Secrets are already watched and arrive in the Zustand store with full data (including labels, type, and dataEntries)
2. Helm release count is typically 20-100 even in large clusters -- trivial to filter client-side
3. No new backend plumbing needed
4. Matches D-02 (topology is also derived client-side)
5. Avoids the complexity of decoding gzipped release data in the browser -- for the **list view** we only need name, namespace, chart name, status, and revision, which are available in the secret labels + a lightweight decode

**Critical detail:** The secret `mapSecret()` mapper already includes `type`, `labels`, and `dataEntries` (with base64-decoded values). For Helm list, labels alone provide `name`, `status`, `version`. For detail view, `dataEntries[0].value` (the `release` key) contains the base64+gzip+JSON payload.

**Browser gzip decode:** The browser needs `pako` or similar to gunzip the Helm release data for detail views. However, for the list view, labels are sufficient. The `helm.get` and `helm.revisions` tRPC endpoints can remain for detail views (decoded server-side). Only the list view switches to live derivation.

```typescript
// Client-side Helm derivation hook (new file)
export function useHelmReleases(clusterId: string) {
  const secrets = useClusterResources<SecretData>(clusterId, 'secrets')
  return useMemo(() => {
    const helmSecrets = secrets.filter(
      s => s.type === 'helm.sh/release.v1' && s.labels?.owner === 'helm'
    )
    // Group by release name, keep latest revision
    const releaseMap = new Map<string, SecretData>()
    for (const s of helmSecrets) {
      const name = s.labels?.name ?? s.name
      const ns = s.namespace
      const key = `${ns}/${name}`
      const rev = parseInt(s.labels?.version ?? '0', 10)
      const existing = releaseMap.get(key)
      const existingRev = existing
        ? parseInt(existing.labels?.version ?? '0', 10)
        : -1
      if (rev > existingRev) releaseMap.set(key, s)
    }
    return [...releaseMap.values()].map(s => ({
      name: s.labels?.name ?? s.name,
      namespace: s.namespace,
      status: s.labels?.status ?? 'unknown',
      revision: parseInt(s.labels?.version ?? '0', 10),
      // Chart details require decode -- omit for list, use tRPC helm.get for detail
      chartName: '', // Will be populated when detail is requested
      chartVersion: '',
      appVersion: '',
      updatedAt: null,
    }))
  }, [secrets])
}
```

**Confidence:** HIGH -- Rancher uses exactly this pattern (filter secrets, extract from labels).

### Pattern 3: Topology Client-Side Derivation (D-02)

**What:** Build topology graph (nodes + edges) entirely from data already in the Zustand store.
**When:** User navigates to topology view or overview page with topology map.

The current `topology.ts` router already reads from WatchManager in-memory store when available (lines 69-83). The client-side approach takes this further: instead of a tRPC round-trip to the server (which reads from WatchManager's ObjectCache), read directly from the Zustand store on the client.

```typescript
// New hook: useTopologyGraph(clusterId, namespace?)
// Reads: pods, services, deployments, statefulsets, daemonsets, ingresses, nodes
// Returns: { nodes: TopologyNode[], edges: TopologyEdge[] }
export function useTopologyGraph(clusterId: string, namespace?: string) {
  const pods = useClusterResources<PodData>(clusterId, 'pods')
  const services = useClusterResources<ServiceData>(clusterId, 'services')
  const deployments = useClusterResources<DeploymentData>(clusterId, 'deployments')
  const statefulsets = useClusterResources<StatefulSetData>(clusterId, 'statefulsets')
  const daemonsets = useClusterResources<DaemonSetData>(clusterId, 'daemonsets')
  const ingresses = useClusterResources<IngressData>(clusterId, 'ingresses')
  const nodes = useClusterResources<NodeData>(clusterId, 'nodes')

  return useMemo(() => {
    // Same logic as topology.ts router but operating on mapped data
    // Filter by namespace, build graph nodes + edges
  }, [pods, services, deployments, statefulsets, daemonsets, ingresses, nodes, namespace])
}
```

**Key difference from server-side:** The server topology router works with raw `k8s.V1Pod` etc. objects, while the client works with mapped data (which has `name`, `namespace`, `labels`, `selector` etc. already extracted). The topology graph builder needs to be adapted to work with the mapped shapes. This is a moderate rewrite of the graph-building logic.

**Alternative:** Keep the tRPC endpoint but have it return data from the Zustand store refresh. However, this defeats the purpose of live topology updates.

**Recommendation:** Port the topology graph-building logic to a client-side hook. The mapped resource shapes already contain all needed fields (name, namespace, labels, selectors, nodeName, ownerReferences are present in pod mapper output -- verify). The graph updates live as pods/deployments change.

**Concern:** The pod mapper does NOT include `ownerReferences` or `spec.nodeName` -- these are raw K8s fields not currently in the mapped shape. The topology graph builder needs these for pod-to-deployment and pod-to-node edges. **Either extend the pod mapper to include these fields, or keep the topology server-side** (where it already works with raw K8s objects from the informer ObjectCache).

**Revised recommendation:** Keep topology as server-side tRPC with WatchManager as data source (already implemented in current code). The topology router already reads from `watchManager.getResources()` when available. This is already "live" in the sense that it reads from the live informer cache, not from a stale Redis/DB cache. Converting to client-side would require extending multiple mappers for raw K8s fields (ownerReferences, nodeName, selector.matchLabels in raw format).

**Confidence:** MEDIUM -- topology server-side is already using live WatchManager data. True client-side derivation would require mapper changes.

### Pattern 4: Watch Health/Metrics Endpoint

**What:** API endpoint exposing which clusters have active watches, for success criterion #4.
**When:** Verification and monitoring.

```typescript
// New route: GET /api/watches/health
// Response:
{
  activeWatches: [
    {
      clusterId: "uuid-1",
      subscriberCount: 2,
      informerCount: 17,  // 15 existing + 2 new
      readyTypes: ["pods", "deployments", ...],
      uptime: "12m 34s"
    }
  ],
  totalClusters: 30,
  watchedClusters: 1  // Only the actively-viewed one
}
```

Uses existing `WatchManager` methods: `getActiveClusterIds()`, `isWatching()`.

**Confidence:** HIGH -- WatchManager already exposes the needed data.

### Anti-Patterns to Avoid

- **Adding tRPC polling alongside SSE for the same resource type:** This is Pitfall #1 from PITFALLS.md. All 15+ directly-watched types must use Zustand store exclusively. tRPC polling for these types creates race conditions.
- **Adding unnecessary new informers for derived data:** Helm releases come from secrets (already watched). Topology comes from 7 already-watched types. Do NOT add a "helm" informer or "topology" informer.
- **Blocking the SSE snapshot with Helm decode:** Helm secret data (base64+gzip+JSON) is large. The snapshot already sends all secrets. Do NOT try to decode every Helm secret during snapshot -- let the client filter and decode on demand.
- **Manual resourceVersion tracking:** Let `makeInformer` handle this internally. Custom resourceVersion logic causes Pitfall #3 (410 Gone loops).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| K8s watch lifecycle | Custom watch loop | `@kubernetes/client-node` `makeInformer()` | Handles LIST+WATCH, resourceVersion tracking, 410 recovery |
| SSE reconnection | Manual retry logic | Existing `useResourceSSE` with backoff | Already battle-tested in Phase 2 |
| Event buffering | Per-component debounce | Existing 1-second buffer in `useResourceSSE` | Single buffer for all types, batch flush to Zustand |
| Helm release decode | Browser-side gzip | Keep `helm.get` tRPC endpoint for detail view | Server has `zlib.gunzipSync()`, browser would need pako |
| Topology graph layout | Manual positioning | dagre (already integrated via React Flow) | Automatic hierarchical layout |

**Key insight:** 90% of the infrastructure for this phase already exists. The WatchManager, SSE endpoint, Zustand store, and useResourceSSE hook are generic across all resource types. Adding new types is mechanical. The real work is: (a) ensuring all tabs read from the correct data source, (b) Helm derivation from secrets, and (c) verifying per-cluster lifecycle works end-to-end.

## Common Pitfalls

### Pitfall 1: NetworkPolicy `_from` vs `from` API Inconsistency
**What goes wrong:** The K8s NetworkPolicy `ingress[].from` field is called `_from` in `@kubernetes/client-node` TypeScript types because `from` is a reserved word. The existing `network-policies.ts` router already handles this with `rule._from`.
**Why it happens:** TypeScript SDK uses `_from` to avoid keyword collision.
**How to avoid:** Copy the existing mapping pattern from `routers/network-policies.ts` into the new `mapNetworkPolicy()` function in `resource-mappers.ts`.
**Warning signs:** Empty ingress `from` arrays in network policy data despite rules existing.

### Pitfall 2: Helm Secrets Have Large `data.release` Fields
**What goes wrong:** Each Helm secret contains the full release payload (chart + values + manifest) encoded as base64+gzip. With 50+ Helm releases, the secrets snapshot can be 10-50MB.
**Why it happens:** Secrets are watched with full data (including `data.release`).
**How to avoid:** The secrets mapper already sends `dataEntries` with base64-decoded values. For Helm list derivation, only labels are needed (name, status, version, owner). Do NOT decode gzip in the browser for the list view. Keep `helm.get` tRPC for detail.
**Warning signs:** Slow snapshot delivery, browser memory spikes on clusters with many Helm releases.

### Pitfall 3: ResourceType String Must Match Exactly in Store Key
**What goes wrong:** The Zustand store key is `${clusterId}:${resourceType}`. If the backend sends `network-policies` but the frontend queries `networkPolicies`, the selector returns empty.
**Why it happens:** Inconsistent naming conventions (kebab-case in ResourceType vs camelCase in code).
**How to avoid:** Use the exact same `ResourceType` string literal everywhere: `'network-policies'` (kebab-case, matching the K8s convention already used for all 15 types like `'statefulsets'`, `'configmaps'`, `'pvcs'`).
**Warning signs:** Tab shows empty state while SSE events are flowing.

### Pitfall 4: useResourceSSE Cleanup Race on Cluster Switch
**What goes wrong:** User navigates from Cluster A to Cluster B. The React effect cleanup for A and the connect for B can overlap, causing brief double-subscription.
**Why it happens:** React `useEffect` cleanup is asynchronous. The SSE endpoint's `request.raw.on('close')` fires when the TCP connection terminates, which may be delayed.
**How to avoid:** The current implementation already handles this correctly: `useResourceSSE` has `closeConnection()` in its cleanup function, which calls `es.close()` synchronously. The server `close` handler then decrements the reference count. Key verification: ensure `clearCluster(clusterId)` in cleanup wipes old cluster data so stale data from Cluster A is not shown while Cluster B loads.
**Warning signs:** Brief flash of Cluster A data when switching to Cluster B.

### Pitfall 5: Topology Mapper Field Gap
**What goes wrong:** Attempting to build topology client-side but the mapped pod/service shapes lack `ownerReferences`, `spec.nodeName`, and raw `selector.matchLabels`.
**Why it happens:** Resource mappers intentionally flatten K8s objects. The topology graph builder needs relationship fields that aren't in the current mapped shapes.
**How to avoid:** Either (a) extend mappers to include relationship fields, or (b) keep topology server-side reading from WatchManager ObjectCache (current approach works and is already live).
**Warning signs:** Topology graph shows disconnected nodes, no edges.

## Code Examples

### Example 1: ResourceQuota Mapper (new)

```typescript
// Source: follows established pattern from mapNamespace, mapPVC, etc.
export function mapResourceQuota(rq: k8s.V1ResourceQuota) {
  return {
    name: rq.metadata?.name ?? '',
    namespace: rq.metadata?.namespace ?? '',
    hard: (rq.status?.hard as Record<string, string>) ?? {},
    used: (rq.status?.used as Record<string, string>) ?? {},
    createdAt: rq.metadata?.creationTimestamp
      ? new Date(rq.metadata.creationTimestamp as unknown as string).toISOString()
      : null,
    labels: (rq.metadata?.labels as Record<string, string>) ?? {},
  }
}
```

### Example 2: RESOURCE_DEFS Entry for Resource Quotas (new)

```typescript
// Source: follows established pattern from RESOURCE_DEFS array
{
  type: 'resource-quotas',
  apiPath: '/api/v1/resourcequotas',
  listFn: coreV1ListFn('listResourceQuotaForAllNamespaces'),
  mapper: (obj) => mappers.mapResourceQuota(obj as k8s.V1ResourceQuota),
},
```

### Example 3: Frontend Tab Switch (network-policies)

```typescript
// Before (tRPC polling):
const policiesQuery = trpc.networkPolicies.list.useQuery({ clusterId }, { staleTime: 15000 })
const policies = (policiesQuery.data ?? []) as PolicyItem[]

// After (Zustand store, live via SSE):
import { useClusterResources } from '@/hooks/useResources'
const policies = useClusterResources<PolicyItem>(clusterId, 'network-policies')
const connectionState = useConnectionState(clusterId)
```

### Example 4: Watch Health Endpoint

```typescript
// New route: apps/api/src/routes/watch-health.ts
import type { FastifyInstance } from 'fastify'
import { watchManager } from '../lib/watch-manager.js'

export async function registerWatchHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/watches/health', async () => {
    const activeIds = watchManager.getActiveClusterIds()
    return {
      activeWatches: activeIds.map(id => ({
        clusterId: id,
        watching: true,
      })),
      totalWatchedClusters: activeIds.length,
    }
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tRPC polling for all K8s resources | SSE + Zustand store for 15 watched types | Phase 1-2 (this project) | Eliminated 10-30s polling lag |
| Global always-on watches | Per-cluster on-demand watches | Phase 1 (subscribe/unsubscribe) | Memory/CPU proportional to active users, not total clusters |
| Separate managers for pods/deployments/other | Unified WatchManager with RESOURCE_DEFS | Phase 1 refactor | Single pattern for all types |

## Open Questions

1. **Topology: Client-side vs Server-side?**
   - What we know: Server-side topology router already reads from WatchManager live cache. Client-side would require extending pod/service mappers with relationship fields (ownerReferences, nodeName).
   - What's unclear: Whether the user considers server-side tRPC (reading from live WatchManager cache) as "live enough" -- it is live data but requires a round-trip.
   - Recommendation: Keep topology server-side. It already reads live data from WatchManager. The tRPC response is fresh (not cached). Making it client-side adds complexity for marginal gain. The topology tab can add `refetchInterval: 5000` (5s) on the tRPC query to auto-refresh the graph as pods/services change. This is NOT the Pitfall #1 anti-pattern because topology is a derived/computed view, not a raw resource type.

2. **Helm List: Labels-only vs Full Decode?**
   - What we know: Helm secret labels provide name, status, version. Chart name/version/appVersion require decoding the release data (base64+gzip+JSON).
   - What's unclear: Whether the current Helm list UX requires chart name/version (it does -- current `extractSummaryFromSecret` decodes every secret).
   - Recommendation: For the Helm list derived from Zustand, show name/status/revision from labels. For chart name/version, trigger a lazy tRPC `helm.get` call. Or accept that the list shows slightly less info when live-derived vs the full decode. The current Helm tab already decodes server-side -- we can keep `helm.list` tRPC as a "detail enrichment" source while the live count/presence comes from secrets filtering.

3. **Autoscaling (Karpenter) Tab: Live or tRPC?**
   - What we know: Karpenter uses CRDs (NodePool, NodeClaim, EC2NodeClass). These are custom resources that `makeInformer` cannot watch without ADV-02.
   - What's unclear: Does the user consider this tab as part of the "24 cluster tab types" that need live data?
   - Recommendation: Keep Karpenter tabs on tRPC. They are CRD-based, and D-04 explicitly defers CRD watching to v2. The existing HPA tab already has a live informer, which covers standard autoscaling.

## Detailed Tab-by-Tab Coverage Map

This is the definitive mapping of all 24 tabs to their data source strategy:

| # | Tab | Current Data Source | Phase 3 Target | Action Required |
|---|-----|-------------------|----------------|-----------------|
| 1 | Overview | Zustand (hybrid with DB fallback) | No change | Verify no tRPC polling conflicts |
| 2 | Nodes | Zustand `nodes` | No change | Already live |
| 3 | Events | Zustand `events` + DB fallback | No change | Already live |
| 4 | Logs | Separate SSE log stream | No change | Not watch-based |
| 5 | Metrics | Separate SSE metrics stream | No change | Not watch-based |
| 6 | Pods | Zustand `pods` | No change | Already live |
| 7 | Deployments | Zustand `deployments` | No change | Already live |
| 8 | StatefulSets | Zustand `statefulsets` | No change | Already live |
| 9 | DaemonSets | Zustand `daemonsets` | No change | Already live |
| 10 | Jobs | Zustand `jobs` | No change | Already live |
| 11 | CronJobs | Zustand `cronjobs` | No change | Already live |
| 12 | Services | Zustand `services` | No change | Already live |
| 13 | Ingresses | Zustand `ingresses` | No change | Already live |
| 14 | Net Policies | tRPC `networkPolicies.list` | **Zustand `network-policies`** | Add informer + mapper + switch frontend |
| 15 | ConfigMaps | Zustand `configmaps` | No change | Already live |
| 16 | Secrets | Zustand `secrets` | No change | Already live |
| 17 | Namespaces | Zustand `namespaces` | No change | Already live |
| 18 | Quotas | tRPC `resourceQuotas.list` | **Zustand `resource-quotas`** | Add informer + mapper + switch frontend |
| 19 | PVCs | Zustand `pvcs` | No change | Already live |
| 20 | HPA | Zustand `hpa` | No change | Already live |
| 21 | Karpenter | tRPC `karpenter.*` | **Keep tRPC** | CRD-based, v2 scope |
| 22 | Helm | tRPC `helm.list` | **Derive from Zustand `secrets`** | Client-side filter + labels |
| 23 | CRDs | tRPC `crds.*` | **Keep tRPC** (D-04) | No live watch |
| 24 | RBAC | tRPC `rbac.matrix` | **Keep tRPC** (D-03) | No watch API |

**Summary of changes needed:**
- 2 tabs need new informers (network-policies, resource-quotas)
- 1 tab needs client-side derivation (Helm from secrets)
- 1 tab's data source (topology/overview) already reads from live WatchManager
- 3 tabs keep tRPC (CRDs, RBAC, Karpenter) -- by design
- 2 tabs keep separate SSE streams (Logs, Metrics) -- not watch-based
- 15 tabs are already live -- no changes needed

## Sources

### Primary (HIGH confidence)
- Codebase audit: `apps/api/src/lib/watch-manager.ts` -- RESOURCE_DEFS pattern, subscribe/unsubscribe lifecycle
- Codebase audit: `packages/types/src/sse.ts` -- ResourceType union, WatchEvent interfaces
- Codebase audit: `apps/api/src/routes/resource-stream.ts` -- SSE endpoint, snapshot delivery, event replay
- Codebase audit: `apps/api/src/lib/resource-mappers.ts` -- 15 existing mapper functions, established pattern
- Codebase audit: All 24 cluster tab page.tsx files -- current data source audit
- Codebase audit: `apps/api/src/routers/network-policies.ts` -- existing mapping logic to port
- Codebase audit: `apps/api/src/routers/resource-quotas.ts` -- existing mapping logic to port
- Codebase audit: `apps/api/src/routers/helm.ts` -- Helm decode pattern (base64+gzip+JSON from secrets)
- Codebase audit: `apps/api/src/routers/topology.ts` -- WatchManager integration already present

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` -- Pipeline architecture documentation
- `.planning/research/PITFALLS.md` -- Domain pitfalls (TQ polling conflict, informer silent stop, etc.)
- `.planning/phases/03-expand-coverage/03-CONTEXT.md` -- User decisions (D-01 through D-07)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, all capabilities exist in current stack
- Architecture: HIGH -- pattern is established for 15 types, mechanical extension for 2 new types
- Derived data (Helm/Topology): MEDIUM -- Helm labels-only derivation is straightforward but detail view needs server decode; topology client-side has mapper gaps
- Pitfalls: HIGH -- extensively documented in existing research + codebase patterns
- Per-cluster lifecycle: HIGH -- WatchManager reference counting already implemented and tested

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- architecture is established, no external dependencies changing)
