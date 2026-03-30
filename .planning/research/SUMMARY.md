# Research Summary: Live K8s Data Pipeline

**Domain:** Real-time K8s web dashboard (SSE streaming)
**Researched:** 2026-03-30
**Overall confidence:** HIGH

## Executive Summary

Production K8s web dashboards (Rancher Dashboard, Headlamp, Kubernetes Dashboard v3) all use the same fundamental pattern: server-side K8s Watch API informers feeding a streaming transport to the browser. Rancher uses WebSocket with a 1-second client-side event buffer and server-side debouncing. Headlamp uses WebSocket with backend multiplexing. Kubernetes Dashboard v3/v7 proxies through Kong. The transport choice varies, but the backend pattern is identical.

Voyager Platform's existing architecture -- `@kubernetes/client-node` informers, Fastify SSE via `reply.raw.write()`, Zustand resource store -- is architecturally correct and matches these production systems. SSE is the right transport because Voyager's resource streaming is unidirectional (server-to-client), SSE provides native auto-reconnection via `EventSource`, and HTTP/2 eliminates the old 6-connection browser limit that drove Headlamp to WebSocket.

The live data pipeline's current problems are implementation bugs, not architectural problems. Research identified the most likely root causes: (1) TanStack Query polling overwriting SSE data with stale responses, (2) `@kubernetes/client-node` informer silently stopping due to known reconnection bugs, and (3) missing client-side event batching causing jank during burst events. All three have proven fixes from production K8s dashboards.

The key missing features vs. production dashboards are: SSE event ID tracking with Last-Event-ID replay (no-data-loss reconnection), client-side 1-second event buffering (Rancher's proven pattern), and informer heartbeat timeout (detect silent disconnects). None of these require new libraries or architectural changes -- they're additions to the existing pipeline.

## Key Findings

**Stack:** Keep SSE (correct for unidirectional streaming). Optionally adopt `@fastify/sse` ^0.4.0 (Fastify 5 compatible) for built-in Last-Event-ID, heartbeat, and backpressure. Current `@kubernetes/client-node` ^1.4.0 is the latest version.

**Architecture:** The 3-layer pipeline (K8s Watch -> SSE -> Zustand) is correct. Gaps are in implementation: no event IDs, no replay buffer, no client batching, no heartbeat timeout enforcement.

**Critical pitfall:** TanStack Query polling likely overwrites SSE data -- this is the most probable cause of the "only updates every 10s" symptom. Every component displaying live K8s data must read exclusively from Zustand (SSE-fed), never from TanStack Query with refetchInterval.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Diagnose and Fix SSE Pipeline** - Fix the stream stopping, remove TQ polling conflict
   - Addresses: LIVE-01, LIVE-05
   - Avoids: Pitfall 1 (TQ overwrite), Pitfall 2 (informer silent stop)

2. **Harden Reconnection** - Add SSE event IDs, replay buffer, informer heartbeat timeout
   - Addresses: LIVE-06
   - Avoids: Pitfall 3 (resourceVersion mismatch), Pitfall 7 (proxy buffering)

3. **Optimize Performance** - Client-side 1s event buffer, batch Zustand updates
   - Addresses: Smooth scaling operations, prepare for type expansion
   - Avoids: Pitfall 6 (Zustand Map copy per event)

4. **Expand Coverage** - Add remaining resource types, per-cluster lifecycle
   - Addresses: LIVE-02, LIVE-03, LIVE-04
   - Avoids: Pitfall 4 (listener leak), Pitfall 5 (snapshot OOM)

5. **Clean Up** - Remove dead code, add missing DB indexes, fix ignoreBuildErrors
   - Addresses: CLEAN-01, CLEAN-02, CLEAN-03

**Phase ordering rationale:**
- Phase 1 must come first because nothing works until the SSE stream continuously delivers events
- Phase 2 before Phase 3 because reconnection bugs can mask performance issues
- Phase 3 before Phase 4 because expanding to 24 types without batching will cause worse jank
- Phase 5 is independent and can be done at any point but is lowest priority

**Research flags for phases:**
- Phase 1: Needs investigation-type work (debugging), not research. Read the codebase, find the polling conflict, trace informer lifecycle.
- Phase 2: Standard patterns, no further research needed. Event IDs and replay are well-documented SSE spec features.
- Phase 3: Standard patterns. Rancher's 1-second buffer is the proven approach.
- Phase 4: May need research for non-standard K8s API informers (CRDs, Helm secrets, RBAC aggregation).
- Phase 5: No research needed. Mechanical cleanup.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (SSE over WS) | HIGH | Verified against Rancher, Headlamp, K8s Dashboard architectures. SSE correct for unidirectional streaming. |
| Features | HIGH | Table stakes features match Lens/Rancher/Headlamp capabilities. |
| Architecture | HIGH | 3-layer pipeline matches all production K8s web dashboards. Existing code structure is sound. |
| Pitfalls | HIGH | @kubernetes/client-node bugs verified via GitHub issues. TQ polling conflict is a hypothesis but highly probable given symptoms. |
| Root cause diagnosis | MEDIUM | TQ polling conflict is the most likely cause, but needs codebase investigation to confirm. Could also be informer lifecycle bug. |

## Gaps to Address

- **Root cause confirmation needed:** The TanStack Query polling overwrite hypothesis needs codebase investigation (Phase 1 work, not more research)
- **CRD/Helm/RBAC informer patterns:** Expanding to 24 resource types requires understanding how to watch non-standard K8s APIs (CRDs use dynamic informers, Helm releases are just Secrets, RBAC has no watch support). Needed for Phase 4.
- **Multi-pod SSE scaling:** If Voyager ever runs multiple API replicas behind a load balancer, SSE connections are long-lived and sticky. May need Redis pub/sub to broadcast watch events across pods. Not needed now (single replica) but relevant for future.
- **@fastify/sse evaluation:** The plugin is new (v0.4.0, ~6 months old). May have rough edges. Evaluate in Phase 2 against keeping raw `reply.raw.write()` with manual event ID tracking.

---

*Research summary: 2026-03-30*
