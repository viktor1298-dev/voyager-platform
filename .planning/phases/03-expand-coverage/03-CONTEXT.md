# Phase 3: Expand Coverage - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend live watching to all 24 cluster tab resource types with per-cluster on-demand lifecycle. After this phase, every cluster tab shows live data (via direct watch or derivation), and watches start/stop automatically based on user navigation. Only the actively-viewed cluster has running watches (30-cluster scale).

</domain>

<decisions>
## Implementation Decisions

### Guiding Principle
- **D-00:** Match Rancher/Lens approach for all live data decisions. User explicitly deferred all grey areas to Claude with this directive. Research should verify Rancher/Headlamp patterns for each decision below.

### Resource Derivation Strategy
- **D-01:** Helm releases derived from watched secrets (Helm stores release data as secrets with label `owner=helm`). No new informer — filter existing secrets watch. Rancher uses this exact pattern.
- **D-02:** Topology derived from existing pod/service/deployment watches. Topology is a computed view, not a K8s resource. Build topology graph client-side from Zustand store data.
- **D-03:** RBAC tab uses tRPC fetch on tab focus, no watch. K8s has no RBAC watch API (out-of-scope per REQUIREMENTS.md). Refresh on tab focus or manual refresh button.
- **D-04:** CRD definitions listed via tRPC, no live watch. Dynamic informers for custom resources are v2 scope (ADV-02). CRD tab shows current state, not live updates.

### New Direct Watches
- **D-05:** Add network-policies and resource-quotas as new informer resource types in WatchManager. These are standard K8s resources with full watch API support.

### Per-Cluster Watch Lifecycle
- **D-06:** Claude's discretion on lifecycle implementation. Match Lens behavior: watches start when user opens a cluster detail page (SSE subscribe), stop when they leave (SSE unsubscribe triggers reference count → 0 → stopAll). WatchManager already has reference counting — verify it cleanly stops all informers on last unsubscribe.
- **D-07:** Cluster switch cleanup: when user navigates from Cluster A to Cluster B, Cluster A watches stop within 10 seconds (success criterion #3). Client-side: `useResourceSSE` cleanup runs on clusterId change. Server-side: `unsubscribe()` → reference count reaches 0 → informers stop.

### Claude's Discretion
- All implementation choices deferred to Claude with "match Rancher/Lens" directive
- Research should verify patterns for: resource type expansion, derived data, per-cluster lifecycle
- Exact resource type additions to ResourceType union type
- How to expose watch health/metrics via API endpoint (success criterion #4)
- Autoscaling tab handling (may overlap with existing HPA watch)
- Logs and metrics tabs (separate SSE streams, not watch-based)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Watch Manager (backend)
- `apps/api/src/lib/watch-manager.ts` — RESOURCE_DEFS array, subscribe/unsubscribe lifecycle, reference counting, informer creation
- `apps/api/src/routes/resource-stream.ts` — SSE endpoint, snapshot delivery, event ID system (Phase 2)
- `apps/api/src/lib/resource-mappers.ts` — All resource mapping functions (pod, service, deployment, etc.)

### Resource Types (shared)
- `packages/types/src/sse.ts` — ResourceType union type (currently 15 types), WatchEvent interfaces

### Frontend Hooks
- `apps/web/src/hooks/useResourceSSE.ts` — SSE subscription, event buffering, reconnect (Phase 2)
- `apps/web/src/stores/resource-store.ts` — Zustand store, applyEvents batch method (Phase 2)
- `apps/web/src/hooks/useResources.ts` — useClusterResources selector

### Cluster Tabs
- `apps/web/src/app/clusters/[id]/` — 22 tab directories, each has page.tsx consuming cluster data

### Prior Phase Context
- `.planning/phases/01-diagnose-fix-pipeline/01-CONTEXT.md` — SSE-only data source (D-01), EventEmitter pattern (D-04)
- `.planning/phases/02-harden-optimize/02-CONTEXT.md` — Reconnect UX (D-01/D-02), 90s heartbeat (D-06)

### Research
- `.planning/research/ARCHITECTURE.md` — Pipeline architecture, Rancher/Headlamp patterns
- `.planning/research/PITFALLS.md` — Pitfalls relevant to scaling watches

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WatchManager.subscribe/unsubscribe` — already reference-counted, stops all informers when count reaches 0. Core lifecycle for per-cluster watching.
- `RESOURCE_DEFS` array — adding new types is mechanical: add entry with type, apiPath, listFn, mapper. Pattern established for 15 types.
- `resource-mappers.ts` — established mapping pattern for each K8s resource type. New types follow same structure.
- `resource-store.ts` — Zustand store with `setResources`, `applyEvent`, `applyEvents`, `clearCluster`. Generic across all resource types.

### Established Patterns
- EventEmitter channels: `watch-event:{clusterId}`, `watch-status:{clusterId}` — all resource types share these channels
- SSE events carry `resourceType` field — frontend routes events to correct store slice automatically
- `useClusterResources(clusterId, resourceType)` — generic Zustand selector works for any type

### Integration Points
- `ResourceType` union in `packages/types/src/sse.ts` — needs new entries for network-policies, resource-quotas
- `RESOURCE_DEFS` in `watch-manager.ts` — needs new entries for each new watched type
- Cluster tab pages in `apps/web/src/app/clusters/[id]/` — many already use tRPC, need to switch to Zustand store for live data
- Helm tab (`apps/web/src/app/clusters/[id]/helm/`) — needs to derive from secrets watch data
- Network policies tab, resource quotas tab — need new informers + frontend integration

</code_context>

<specifics>
## Specific Ideas

- User wants Rancher/Lens quality across the board — same patterns, same behavior
- Per-cluster lifecycle already partially works via WatchManager reference counting — verify and harden
- "30 clusters in the system" constraint means only 1-2 clusters watched at a time (user navigating)

</specifics>

<deferred>
## Deferred Ideas

- Dynamic CRD informers (ADV-02) — v2 scope
- Multi-replica SSE scaling (ADV-01) — v2 scope
- Live metrics streaming improvements (ADV-03) — v2 scope

</deferred>

---

*Phase: 03-expand-coverage*
*Context gathered: 2026-03-30*
