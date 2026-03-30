# Phase 1: Diagnose & Fix Pipeline - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the SSE live data pipeline so K8s watch events flow continuously from cluster to browser. The pipeline partially works (initial events arrive) but then stops delivering — data only updates on page refresh or ~10s polling intervals. After this phase, all 15 currently-watched resource types update in real-time without polling, like Lens/Rancher.

</domain>

<decisions>
## Implementation Decisions

### Data Source Architecture
- **D-01:** SSE-only for watched resource types. Remove all `refetchInterval` on tRPC queries for the 15 watched types. Components read exclusively from Zustand store (fed by `useResourceSSE`). No competing tRPC polling. Match Lens/Rancher approach where the watch stream IS the data source.

### Investigation Approach
- **D-02:** Fix known suspects directly — research identified 3 high-confidence root causes. Fix in order, test after each: (1) remove TQ polling conflict, (2) fix informer reconnect bug (`@kubernetes/client-node` #2385 — informer dies silently on non-410 errors), (3) verify/refactor monkeypatch. No upfront diagnostic logging phase.

### QA Validation
- **D-03:** Both automated Playwright E2E test AND manual functional QA. The E2E test: delete a pod via kubectl, take 4 screenshots at 3s intervals (0s, 3s, 6s, 9s), compare pod status across frames to prove live data (not 10s polling). Build comprehensive E2E test coverage for live data behaviors. Manual QA via functional-qa skill for the phase gate.

### Event Pipeline Safety
- **D-04:** Refactor `watch-db-writer.ts` from monkeypatch to EventEmitter listener pattern. DB sync subscribes to watch events via `emitter.on()`, never intercepts the SSE delivery path. Zero risk of blocking SSE consumers if DB sync fails.

### Claude's Discretion
- Specific order of fixes within the three known suspects
- Whether to upgrade `@kubernetes/client-node` or patch the informer reconnect locally
- Implementation details of the EventEmitter listener refactor

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Live Data Pipeline (backend)
- `apps/api/src/lib/watch-manager.ts` — Unified WatchManager, informer lifecycle, getResources()
- `apps/api/src/routes/resource-stream.ts` — SSE endpoint /api/resources/stream
- `apps/api/src/lib/watch-db-writer.ts` — Monkeypatch on emitWatchEvent (to refactor)
- `apps/api/src/lib/event-emitter.ts` — VoyagerEventEmitter, event channels

### Live Data Pipeline (frontend)
- `apps/web/src/hooks/useResourceSSE.ts` — SSE client hook, EventSource lifecycle
- `apps/web/src/hooks/useResources.ts` — useClusterResources (Zustand selector)
- `apps/web/src/stores/resource-store.ts` — Zustand store for live K8s data

### Research
- `.planning/research/PITFALLS.md` — 15 pitfalls with prevention strategies, especially #1 (informer silent death) and TQ polling conflict
- `.planning/research/ARCHITECTURE.md` — 3-layer pipeline architecture, Rancher/Headlamp patterns
- `.planning/research/SUMMARY.md` — Key findings and root cause hypotheses

### Codebase Analysis
- `.planning/codebase/CONCERNS.md` — Dead code inventory, monkeypatch fragility, security items

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useResourceSSE` hook — already connects EventSource and applies events to Zustand. Core logic is sound, may need reconnect hardening.
- `useClusterResources` hook — stable Zustand selector with memoized callback. Correct pattern.
- `resource-store.ts` — Zustand store with `setResources` (snapshot), `applyEvent` (ADDED/MODIFIED/DELETED), `clearCluster`. All operations exist.

### Established Patterns
- SSE events use typed interfaces from `@voyager/types`: `WatchEventBatch`, `WatchStatusEvent`
- Resource mappers in `lib/resource-mappers.ts` guarantee identical data shapes between SSE and tRPC
- EventEmitter channels: `watch-event:{clusterId}`, `watch-status:{clusterId}`

### Integration Points
- Cluster detail pages import `useClusterResources` from `@/hooks/useResources` — this is the read path
- `useResourceSSE` is placed once in the cluster layout — all tabs get live updates
- 20+ files have `refetchInterval` on tRPC queries — these need audit and removal for watched types

### Key Files with refetchInterval (to modify)
Found via grep — these are the tRPC polling queries that conflict with SSE:
- `Sidebar.tsx` (clusters: 60s, alerts: 30s)
- `TopBar.tsx` (clusters: 60s, alerts: 30s)
- `app/page.tsx` (DB_CLUSTER_REFETCH_MS)
- `app/clusters/[id]/page.tsx` (nodes, events via tRPC)
- `app/clusters/[id]/metrics/page.tsx` (60s)
- Various dashboard widgets (30s)
- `NodeMetricsTable.tsx`, `MetricsTimeSeriesPanel.tsx`, `ResourceSparkline.tsx`

</code_context>

<specifics>
## Specific Ideas

- User wants Lens/Rancher-quality live data — "same approach as high-tech companies"
- Phase gate requires 4-screenshot QA test proving data updates at 3s intervals, not 10s polling
- E2E tests should cover live data behaviors comprehensively to prevent regressions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-diagnose-fix-pipeline*
*Context gathered: 2026-03-30*
