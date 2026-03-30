# Phase 2: Harden & Optimize - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Make SSE connections resilient to network drops and server restarts, and handle burst events (rolling updates, 50+ events in 5s) without UI jank. After this phase, SSE auto-reconnects with no visible flash of empty state, missed data is recovered, informer death is detected and recovered, and burst events render smoothly.

</domain>

<decisions>
## Implementation Decisions

### Reconnect UX
- **D-01:** Stale data + status badge. During SSE reconnect, keep showing last-known data. ConnectionStatusBadge (already exists) shows 'reconnecting' state. No layout shift, no empty flash, no loading overlay. Matches Lens/Rancher approach.
- **D-02:** Silent reconnect. No toast notification on successful reconnection. Badge transitions back to 'connected' and data refreshes silently. Only show toast for extended outages (if at all — Claude's discretion on threshold).

### Data Recovery
- **D-03:** Claude's discretion on reconnect data recovery approach. Options: fresh snapshot on reconnect (simple, already exists on initial connect) vs event-ID replay from server buffer (lossless). Research should compare Rancher/Headlamp approaches to inform the decision.

### Burst Handling
- **D-04:** Claude's discretion on burst event batching strategy. Options: 1-second buffer (Rancher pattern), rAF-based batching, or Zustand bulk merge. Research should evaluate Rancher's buffering pattern and determine optimal approach for 50+ events in 5 seconds without jank.

### Heartbeat & Failure Detection
- **D-05:** Claude's discretion on heartbeat detection scope — whether client-side SSE heartbeat monitoring is needed in addition to existing server-side informer heartbeat. Both layers (informer death + SSE connection death) need coverage.
- **D-06:** Keep 90s informer heartbeat timeout. The CONN-02 "recover within 30s" requirement applies to SSE client recovery, not informer detection. Different layers, different timeouts. Reducing to 30s would cause false-positive informer restarts during normal quiet periods (many resource types are stable for minutes).

### Claude's Discretion
- Data recovery approach (snapshot vs event-ID replay) — based on research
- Burst batching strategy (1s buffer vs rAF vs bulk merge) — based on research
- Client-side heartbeat detection implementation — based on failure mode analysis
- Whether to use native EventSource or switch to fetch-based SSE for custom backoff
- Exponential backoff parameters for client reconnect
- Whether to add toast notification for extended outages (>30s)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Live Data Pipeline (backend)
- `apps/api/src/routes/resource-stream.ts` — SSE endpoint, heartbeat keepalive, snapshot on connect, event delivery
- `apps/api/src/lib/watch-manager.ts` — WatchManager with informer lifecycle, heartbeat timeout (90s), exponential backoff reconnect, reference counting
- `apps/api/src/lib/event-emitter.ts` — VoyagerEventEmitter, `watch-event:{clusterId}` and `watch-status:{clusterId}` channels

### Live Data Pipeline (frontend)
- `apps/web/src/hooks/useResourceSSE.ts` — SSE client hook, EventSource lifecycle, visibility-change reconnect, connection state management
- `apps/web/src/stores/resource-store.ts` — Zustand store with setResources (snapshot), applyEvent (individual), clearCluster
- `apps/web/src/hooks/useResources.ts` — useClusterResources (Zustand selector), useConnectionState

### Shared Config
- `packages/config/src/sse.ts` — All SSE/watch constants (heartbeat intervals, reconnect delays, backoff multiplier, buffer sizes, connection limits)
- `packages/types/src/sse.ts` — SSEConnectionState type, WatchEventBatch, WatchStatusEvent interfaces

### Research (from Phase 1)
- `.planning/research/PITFALLS.md` — 15 pitfalls including informer silent death (#1), TQ polling conflict, reconnection patterns
- `.planning/research/ARCHITECTURE.md` — 3-layer pipeline architecture, Rancher/Headlamp buffering patterns

### Phase 1 Context
- `.planning/phases/01-diagnose-fix-pipeline/01-CONTEXT.md` — Phase 1 decisions (SSE-only D-01, EventEmitter pattern D-04) that carry forward

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConnectionStatusBadge` — already exists in the UI, shows SSE connection state ('connected', 'reconnecting', 'disconnected'). Ready to use for reconnect UX.
- `useResourceSSE` — has visibility-change reconnect (added in Phase 1). Needs extension for backoff and heartbeat detection.
- `resource-store.ts` — has both `setResources()` (bulk snapshot) and `applyEvent()` (single event). Batch version (`applyEvents()` for multiple events at once) would be new.
- `packages/config/src/sse.ts` — already defines `SSE_INITIAL_RECONNECT_DELAY_MS` (1s), `SSE_RECONNECT_BACKOFF_MULTIPLIER` (2), `SSE_MAX_RECONNECT_DELAY_MS` (30s), `SSE_MAX_RECONNECT_ATTEMPTS` (0=infinite). These are defined but NOT used on the client side.

### Established Patterns
- Server heartbeat: `:heartbeat\n\n` comment every 30s — client can monitor this for connection liveness
- Server snapshot on connect: sends full informer cache per resource type — this IS the "data recovery" mechanism today
- Informer exponential backoff: `WATCH_RECONNECT_BASE_MS * 2^(attempt-1)` capped at `WATCH_RECONNECT_MAX_MS` with jitter — proven pattern on server side
- EventEmitter decoupling: one informer produces events, many SSE consumers listen — already handles connection multiplexing

### Integration Points
- `useResourceSSE.ts` line 76: `new EventSource(url, { withCredentials: true })` — this is where custom reconnect logic would wrap or replace native EventSource
- `resource-stream.ts` line 119-139: snapshot + watch event writing — this is where event IDs would be added (if event-ID approach chosen)
- `resource-store.ts` `applyEvent()` — this is where batch buffering would accumulate events before flushing to store

### Known Issue from Investigation
- Dirty API restart (kill without clean shutdown) leaves informers in reconnect loops. 13/15 informers showed "The user aborted a request" errors until a clean restart. This is an @kubernetes/client-node informer cleanup issue — Phase 2 should ensure client-side recovery handles this gracefully (reconnect gets fresh snapshot regardless of server state).

</code_context>

<specifics>
## Specific Ideas

- User wants Lens/Rancher-quality resilience — connection blips should be invisible
- The "dirty restart" issue discovered during investigation: a killed API leaves informers in permanent reconnect loops. Client-side reconnection must handle server-side instability gracefully.
- Phase 1 patterns should carry forward: SSE-only data source (no polling), EventEmitter decoupling, both E2E + functional QA for phase gate

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-harden-optimize*
*Context gathered: 2026-03-30*
