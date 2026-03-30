# Feature Landscape: Live Data for K8s Web Dashboard

**Domain:** Real-time Kubernetes operations dashboard (web-based)
**Researched:** 2026-03-30
**Reference implementations:** Lens, Rancher Dashboard, Headlamp, Kubernetes Dashboard v3, K9s

## Table Stakes

Features users expect from any K8s dashboard claiming "live data." Missing = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **All workload types update in real-time** | Lens/Rancher/Headlamp all do this. Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs must reflect changes within 1-2s. | Medium | Already have 15 watched types. Need to fix the pipeline so events actually flow continuously. |
| **Pod phase/status color changes live** | Users watch pods transition (Pending -> Running -> Failed). If color lags, trust erodes. | Low | Already have watch events for pods. Need frontend to apply MODIFIED events to pod status immediately. |
| **Delete/scale/restart reflected instantly** | When user performs an action via the UI, they expect immediate feedback. Lens: <1s. Rancher: 1s (buffer flush). | Low | Watch events propagate the change. The action triggers a K8s mutation; the watch sees the change and pushes it. |
| **Events tab live stream** | K8s events (warnings, scheduling, pulling images) are the first thing operators check. Must stream continuously. | Low | Events are already in the 15 watched types. Fix the pipeline and this works. |
| **Nodes status live** | Node conditions (Ready/NotReady/MemoryPressure) are critical signals. Must update without refresh. | Low | Nodes are already watched. |
| **Connection status indicator** | User must know if they are seeing live data or stale data. "Connected/Reconnecting/Disconnected" badge. | Low | Already have `ConnectionStatusBadge` component and `WatchStatusEvent` type. Needs to accurately reflect state. |
| **Auto-reconnect on connection drop** | SSE/WS connections will drop (network blip, laptop sleep, server restart). Must recover automatically without user action. | Medium | EventSource has built-in retry. Need to handle: resume from correct state (full snapshot on reconnect vs incremental). Current `useResourceSSE` has reconnect logic. |
| **Heartbeat / keepalive** | Without periodic pings, proxies and browsers silently close idle SSE connections (30-60s timeout). Industry standard is 15-30s heartbeat interval. | Low | Must send `:heartbeat\n\n` every 15-30s on the SSE connection. Standard SSE practice. |
| **Snapshot on initial connect** | First render must show current state immediately, not wait for incremental events. Lens and Rancher both send full resource list on connection. | Low | Already implemented -- WatchManager sends ObjectCache contents as initial `snapshot` event. |
| **Config/Storage types live** | ConfigMaps, Secrets, PVCs, Namespaces. These change less frequently but must still update live when they do change. | Low | Already in the 15 watched types. |
| **Ingresses and HPA live** | Ingress routing changes and HPA scaling decisions are time-sensitive operational data. | Low | Already watched. |

## Differentiators

Features that set the product apart. Not universally expected, but valued by power users.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Server-side event batching (1s flush)** | Prevents render thrash during mass events (deployment rollout = 100+ pod events in seconds). Rancher does 1s batching; Lens doesn't need it (desktop app, different render model). Web dashboards NEED this. | Medium | Current architecture already has 1s batching in `resource-stream.ts`. Verify it works correctly under load. |
| **Namespace client-side filtering** | Rancher and Lens let users filter by namespace. Live data should respect this filter. Client-side filtering from cluster-wide watches is the standard approach (avoids multiplying informers per namespace). | Medium | Requires all data in Zustand store (from watches). Filter in the component layer. No new informers needed. |
| **Network Policies live** | NetworkPolicy changes are security-critical. Live updates let operators see policy enforcement changes immediately. Most dashboards require manual refresh for this. | Medium | Currently `cached()` with 15s TTL. Would need adding NetworkPolicy informer to watch pipeline. Low change frequency = low watch cost. |
| **Resource Quotas live** | Quota consumption changes as pods are created/destroyed. Live gauge bars showing quota fill in real-time is compelling. | Medium | Currently `cached()`. Could add ResourceQuota informer or derive quota *usage* from existing pod/node watches (quota definitions change rarely). |
| **Helm "release changed" detection** | Helm releases are stored as K8s Secrets (`type=helm.sh/release.v1`). Already watching Secrets -- can detect Helm release changes by filtering Secret events by type label. Show "updated" badge on Helm tab without full re-decode. | Medium | Watch already covers the underlying Secrets. Need: filter logic in the event handler, lightweight "release changed" notification to frontend, on-demand full decode only when user opens release detail. |
| **"Last synced" timestamp per resource type** | When users see data, they should know how fresh it is. Show "Live" (green dot) or "2m ago" (yellow) per tab. Rancher has this with their manual refresh feature. | Low | Track last event timestamp per resourceType in the Zustand store. Display in tab header or as tooltip. |
| **Stale-while-revalidate display** | Show cached data immediately, overlay a stale indicator when SSE is reconnecting. Prevents blank screens on reconnect. PatternFly has a documented "stale data warning" component pattern. | Low | TanStack Query supports this natively via `staleTime`. Extend with visual indicator when connection state is `reconnecting`. |
| **Graceful degradation to polling** | If SSE connection cannot be established (corporate proxy, WebSocket-only proxy), fall back to periodic tRPC polling. User still gets data, just not instant. | Medium | EventSource failure -> set `refetchInterval: 10s` on TanStack Query. Need reliable detection of SSE failure (timeout, repeated reconnects). |
| **SSE event IDs for resumable streams** | On reconnect, client sends `Last-Event-ID` header. Server replays missed events from a ring buffer. Prevents data staleness during brief disconnects. | High | Requires: server-side event ID tracking, ring buffer (bounded, ~100 events per cluster), replay logic. Significant complexity. Full snapshot on reconnect is simpler and works for most cases. |
| **Animated transitions on resource state change** | Pod phase change: smooth color transition. New pod: slide-in animation. Deleted pod: fade-out. Makes the dashboard feel alive vs a table that just "jumps." | Low | Use Motion v12 (already in stack). `AnimatedList` component exists. Apply `layoutId` for pod rows. |
| **CRD instances live** | Custom Resource changes (Karpenter NodePools, cert-manager Certificates) are high-value for operators. Most dashboards don't watch CRDs live. | High | Requires dynamic informers -- can't pre-register CRD types at compile time. Must discover CRD group/version/resource at runtime and create informers on demand. Headlamp plugin architecture handles this. Defer unless specific CRD demand is clear. |
| **RBAC live** | ClusterRoles/RoleBindings are security-sensitive. Live updates prevent stale permission views. | Medium | Would need RbacAuthorizationV1Api informers (4 types: ClusterRole, ClusterRoleBinding, Role, RoleBinding). Changes are very rare, so watch cost is minimal but ROI is also low. |

## Anti-Features

Features to explicitly NOT build. Each is tempting but harmful.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Watch all clusters simultaneously** | With 30 clusters, this means 30 x 15+ = 450+ active informers. K8s API servers will throttle. Memory usage explodes. Lens only watches the active cluster. Rancher had severe issues at scale with excessive watches (GitHub Issue #5997 -- resourceVersion confusion flooded the API server). | Watch only the actively-viewed cluster. Start informers on cluster open, stop on cluster leave. Current `subscribe(clusterId)` / `unsubscribe(clusterId)` pattern is correct. |
| **WebSocket for live data transport** | SSE is the industry standard for web-based K8s dashboards (server-to-client streaming). WS adds bidirectional complexity, doesn't work through all proxies, and provides no benefit for unidirectional data flow. Rancher uses WS for historical reasons (pre-SSE era); modern dashboards prefer SSE. | Keep SSE for live data. WS stays only for pod exec (bidirectional terminal I/O). |
| **Client-side K8s Watch API (direct from browser)** | Some tutorials suggest connecting the browser directly to the K8s API stream. This exposes cluster credentials to the browser, doesn't work through corporate proxies, prevents server-side batching/mapping, and can't aggregate multi-cluster. | Keep the server-side proxy pattern: K8s Watch -> Backend -> SSE -> Browser. This is what Headlamp, Rancher, and every production web dashboard does. |
| **Live data for ALL 24 cluster tabs** | Some tabs (Logs, Metrics, Overview, Topology) are composite views that aggregate from multiple sources or use entirely different pipelines (Metrics API, pod log follow). They don't benefit from K8s resource Watch API. | Watch the 15 core resource types via informers. Composite tabs (Overview, Topology) derive from those. Logs and Metrics have their own dedicated SSE streams that already work. |
| **Watching K8s events indefinitely** | K8s events are ephemeral (default 60-minute cluster-side retention). Watching them forever wastes server memory. Storing all events in PostgreSQL creates unbounded table growth. | Watch events like any other type (keep in ObjectCache for live view). Persist to DB on a capped schedule (watch-db-writer already does 60s sync). Prune old events from DB on schedule. |
| **Per-namespace informers** | Creating separate informers per namespace multiplies watch connections. 100 namespaces x 15 types = 1,500 informers per cluster. API server impact is severe. | Use cluster-wide informers and filter client-side by namespace. All production dashboards (Lens, Rancher, Headlamp) do this. |
| **Sub-second update latency target** | Chasing <500ms latency adds complexity (disable batching, requestAnimationFrame scheduling, WebSocket instead of SSE). The 1s batch window is the proven standard (Rancher). Users cannot perceive 500ms vs 1.5s for dashboard table updates. | Target 1-2s update latency. This matches Lens and Rancher. The 1s server-side batch is the right tradeoff. |
| **Real-time diff highlighting (show what changed)** | Tempting to highlight "this field just changed" on each update. But for resources that change frequently (pods during rollout), the diff flicker is distracting, adds rendering cost, and clutters the UI. | Show current state cleanly. Offer "View YAML" and "Resource Diff" (already built) for on-demand comparison. |
| **Karpenter/Autoscaling live via K8s watch** | Karpenter uses CRDs (NodePools, NodeClaims, EC2NodeClasses). Watching CRDs requires dynamic informers. Karpenter CRDs don't exist on all clusters. | Keep Karpenter data via the dedicated `karpenter-service.ts`. Poll on tab open, refresh on demand. Not worth dynamic informer complexity for one CRD family. |
| **Client-side polling alongside SSE** | TanStack Query `refetchInterval` can overwrite fresh SSE data with stale poll responses, creating a "data jumps backward" effect. This is likely part of the current bug. | When SSE is connected: disable polling for watched resource types. Use Zustand store exclusively for live K8s data. TanStack Query handles only historical/DB data (alerts, users, settings). |
| **Unbounded server-side event replay buffer** | Memory leak risk on high-churn clusters. A busy cluster can generate thousands of events per minute. | If implementing event replay: use a fixed-size ring buffer (100-500 events per cluster). On overflow, send full snapshot instead of replay. |

## Per-Resource-Type Live Data Expectations

Categorized by update urgency and whether K8s Watch API is the right approach.

### Tier 1: MUST be live (Watch API) -- changes are operationally urgent

These types change during normal operations and operators need immediate visibility.

| Resource Type | Update Frequency | Currently Watched | Operational Urgency | Notes |
|---------------|-----------------|-------------------|--------------------|----|
| Pods | Very High | Yes | Critical -- crashes, restarts, OOMKills | Primary indicator of cluster health. Most-watched type in every dashboard. |
| Deployments | High | Yes | High -- rollouts, scaling, failures | readyReplicas/replicas delta is the key signal during rollouts. |
| Events (K8s) | Very High | Yes | High -- first diagnostic data source | Warning events (ImagePullBackOff, FailedScheduling) need immediate visibility. |
| Nodes | Medium | Yes | Critical -- NotReady = service impact | Node failures are cluster-level emergencies. Condition changes must be instant. |
| StatefulSets | Medium | Yes | High -- stateful workload health | Slower to recover than Deployments, more urgent to notice failures. |
| DaemonSets | Low-Medium | Yes | High -- per-node workload health | Missing DaemonSet pod = monitoring/logging gap on that node. |
| Jobs | High (burst) | Yes | Medium -- batch completion tracking | Jobs complete/fail in bursts. Operator needs to know completion status. |
| Services | Low | Yes | Medium -- endpoint changes affect routing | Service type/port/selector changes are infrequent but affect traffic routing. |
| HPA | Medium | Yes | High -- scaling decisions are time-sensitive | Current vs desired replicas, scaling events, cooldown status. |

### Tier 2: SHOULD be live (Watch API) -- changes matter but less urgent

| Resource Type | Update Frequency | Currently Watched | Operational Urgency | Notes |
|---------------|-----------------|-------------------|--------------------|----|
| CronJobs | Low | Yes | Low-Medium | Schedule changes are rare. New CronJob creation is the relevant event. |
| Ingresses | Low | Yes | Medium | Routing changes typically happen during deploys. Important but not urgent. |
| ConfigMaps | Low | Yes | Low | Config changes can trigger pod restarts (via mounted volumes). Watch is cheap since changes are rare. |
| Secrets | Low | Yes | Low | Helm releases stored as Secrets -- enables Helm tab awareness. Watch is cheap. |
| PVCs | Low | Yes | Low-Medium | PVC Pending -> Bound transition is relevant for storage troubleshooting. |
| Namespaces | Very Low | Yes | Low | Namespace creation/deletion is rare. Watch is essentially free (few events). |

### Tier 3: CAN be polled (no Watch API needed) -- changes are rare or data is composite

| Resource Type | Update Frequency | Currently Watched | Why Polling/Caching is OK | Notes |
|---------------|-----------------|-------------------|------------------|----|
| Network Policies | Very Low | No (cached, 15s TTL) | Changes 1-2x per deploy cycle. Not operationally urgent. | Could upgrade to Tier 2 later if demand exists. Low watch cost. |
| Resource Quotas | Very Low | No (cached, 15s TTL) | Quota *definitions* rarely change. Quota *usage* is derived from pod counts (already watched). | Consider: derive usage display from watched pods rather than separate informer. |
| RBAC (4 types) | Very Low | No (cached) | Roles/bindings change during permission setup, not during operations. | 4 informers for very-rarely-changing data. Low ROI for live watching. |
| CRDs (definitions) | Very Low | No (cached, 30s TTL) | CRD schemas change during cluster upgrades, not during operations. | CRD *instances* are a separate question -- see Differentiators. |
| CRD instances | Varies | No | Dynamic informer complexity. Per-CRD decision needed. | Karpenter NodeClaims = medium frequency; cert-manager Certs = low. |
| Helm releases | Low | No (cached) | Helm installs/upgrades are deliberate operations. User knows when to refresh. | Can detect changes via Secret watch events (Helm secrets have specific type label). |
| Karpenter resources | Medium | No (service layer) | CRD-based, not available on all clusters. Dedicated service handles data aggregation. | Dynamic informer complexity not justified for single CRD family. |
| Metrics | N/A | Separate SSE stream | Already has dedicated `/api/metrics/stream` for short ranges, TimescaleDB for historical. | Uses Metrics API polling (15s interval), not K8s Watch API. Different pipeline entirely. |
| Logs | N/A | Separate SSE stream | Already has dedicated `/api/logs/stream` with follow mode. | Pod log streaming is a K8s log follow API, not a Watch API. |
| Overview | N/A (composite) | Derives from watched types | Aggregates health/status from pods, nodes, deployments, events. | No separate watch needed -- re-renders when underlying watched data changes. |
| Topology | N/A (composite) | Derives from watched types | Graph built from pods, services, deployments, ingresses relationships. | Rebuilds from watched data. Could trigger graph re-layout on relevant events. |

## Feature Dependencies

```
SSE Pipeline Fix (LIVE-01, LIVE-05)
  --> All Tier 1/2 types update live in browser (LIVE-02)
  --> Connection status badge reflects actual state
  --> Heartbeat prevents silent disconnects
  --> Auto-reconnect delivers fresh snapshot (LIVE-06)

SSE Pipeline Fix
  --> Stale-while-revalidate display
  --> Animated transitions on state change
  --> "Last synced" timestamp tracking

Disable TanStack Query polling for watched types
  --> Prevents stale poll data overwriting fresh SSE data
  --> Required for pipeline fix to actually work

Per-cluster on-demand watching (LIVE-03)
  --> Required BEFORE scaling to 30 clusters
  --> Already partially implemented (subscribe/unsubscribe)
  --> Needs lifecycle enforcement (cleanup on unmount, timeout on idle)

Event batching verification
  --> Already implemented (1s in resource-stream.ts)
  --> Needs load testing during mass pod events (scale 1->50)

Namespace client-side filtering
  --> Requires all data in Zustand store (from watches)
  --> SSE pipeline must work first

Network Policies + Resource Quotas (optional Tier 2 upgrade)
  --> New informer definitions in RESOURCE_DEFS
  --> New ResourceType union members in @voyager/types
  --> New mapper functions in resource-mappers.ts
  --> Independent of SSE pipeline fix (can be done in parallel)

Helm "release changed" notification
  --> Filter Secret watch events by label type=helm.sh/release.v1
  --> Depends on SSE pipeline delivering Secret events

SSE event IDs + replay buffer (optional differentiator)
  --> Server-side ring buffer per cluster
  --> Event ID generation and tracking
  --> Replay logic on reconnect with Last-Event-ID header
  --> Can be deferred: full snapshot on reconnect is simpler and works

Dead code removal (CLEAN-01)
  --> Removes confusion (legacy watchers, dead emitter methods)
  --> Reduces cognitive load for pipeline debugging
  --> Independent of feature work
```

## MVP Recommendation

**Priority 1 -- Fix the pipeline (the entire value proposition depends on this):**
1. Fix SSE stream to deliver continuous events (LIVE-01) -- not just first event then silence
2. Fix `useResourceSSE` to correctly apply events to Zustand store / TanStack Query cache (LIVE-05)
3. Disable TanStack Query polling for types that are receiving SSE data (prevent stale overwrite)
4. Add heartbeat to SSE connection (prevent silent proxy/browser close)
5. Verify auto-reconnect delivers fresh snapshot on reconnect (LIVE-06)
6. Verify 1s server-side batching works under load (deployment rollout test)

**Priority 2 -- Polish the live experience (after pipeline is proven):**
7. Connection status badge accurately reflects real-time state (connected/reconnecting/disconnected)
8. "Last synced" timestamp per resource type in tab headers
9. Stale data indicator when SSE is reconnecting (PatternFly-style warning bar)
10. Animated transitions on pod state changes (fade-in/out, color transitions)
11. Namespace client-side filtering for watched data

**Priority 3 -- Expand coverage (only after pipeline is solid and tested):**
12. Network Policies informer (add to RESOURCE_DEFS, new mapper)
13. Resource Quotas informer (add to RESOURCE_DEFS, new mapper)
14. Helm "release changed" detection from Secret watch events
15. RBAC informers (4 types -- lowest priority, changes are extremely rare)

**Defer indefinitely:**
- CRD dynamic informers (high complexity, uncertain ROI)
- Karpenter live watch (CRD-based, not universal, has dedicated service)
- SSE event ID replay (full snapshot on reconnect is simpler and sufficient)
- Per-tab lazy watching (15 informers per cluster is acceptable overhead)
- Per-namespace informers (use cluster-wide + client-side filter)
- Optimistic UI on mutations (wait for watch event instead, 1-2s is fast enough)

## Sources

- [Rancher Dashboard WebSocket Watch Architecture](https://extensions.rancher.io/internal/code-base-works/api-resources-and-schemas) -- MEDIUM confidence
- [Rancher Watch Re-subscription Bug #5997](https://github.com/rancher/dashboard/issues/5997) -- HIGH confidence (primary source, shows real pitfalls)
- [Rancher Data Load Optimizations](https://extensions.rancher.io/internal/code-base-works/kubernetes-resources-data-load) -- MEDIUM confidence
- [Rancher Performance Settings](https://extensions.rancher.io/internal/code-base-works/performance) -- MEDIUM confidence
- [Lens Desktop Live Monitoring](https://www.mirantis.com/blog/simplify-kubernetes-monitoring-and-management-with-lens-desktop/) -- MEDIUM confidence
- [Lens Kubernetes IDE Overview](https://lenshq.io/blog/lens-kubernetes) -- MEDIUM confidence
- [Headlamp 2025 Highlights](https://kubernetes.io/blog/2026/01/22/headlamp-in-2025-project-highlights/) -- MEDIUM confidence
- [Headlamp GitHub](https://github.com/kubernetes-sigs/headlamp) -- HIGH confidence
- [K8s Dashboard Comparison 2026](https://www.bytebase.com/blog/top-open-source-kubernetes-dashboard/) -- LOW confidence (overview only)
- [Coding a Real-Time K8s Dashboard](https://learnkube.com/real-time-dashboard) -- MEDIUM confidence
- [K8s Informer Best Practices](https://www.plural.sh/blog/manage-kubernetes-events-informers/) -- MEDIUM confidence
- [K8s Informer Performance/Memory](https://groups.google.com/g/kubernetes-sig-api-machinery/c/VHEiNka4mtg) -- HIGH confidence (K8s SIG discussion)
- [SSE Best Practices for K8s Dashboards](https://dev.to/perber/building-a-kubernetes-dashboard-implementing-a-real-time-logview-with-server-sent-events-and-react-window-1lel) -- MEDIUM confidence
- [K8s API Streaming Enhancement](https://v1-32.docs.kubernetes.io/blog/2024/12/17/kube-apiserver-api-streaming/) -- HIGH confidence (official K8s blog)
- [PatternFly Stale Data Warning UX](https://www.patternfly.org/component-groups/status-and-state-indicators/stale-data-warning/) -- MEDIUM confidence (UX patterns)

---

*Features research: 2026-03-30*
