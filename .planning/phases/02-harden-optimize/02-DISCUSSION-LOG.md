# Phase 2: Harden & Optimize - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 02-harden-optimize
**Areas discussed:** Reconnect UX, Data recovery, Burst handling, Heartbeat scope

---

## Reconnect UX

| Option | Description | Selected |
|--------|-------------|----------|
| Stale data + status badge | Keep showing last-known data. ConnectionStatusBadge shows 'reconnecting' state. No layout shift, no empty flash. Lens/Rancher approach. | ✓ |
| Subtle loading overlay | Semi-transparent overlay on the data area with a spinner. Data is dimmed but still visible. | |
| Full loading state | Replace data with loading skeleton. Clear signal but user loses context. | |

**User's choice:** Stale data + status badge (Recommended)
**Notes:** None

### Toast on Reconnect

| Option | Description | Selected |
|--------|-------------|----------|
| Silent reconnect | No toast — badge goes back to 'connected' and data refreshes. Clean UX. | ✓ |
| Success toast | Brief 'Connection restored' toast after reconnect. | |
| Toast only if gap > 5s | Only notify if disconnect lasted long enough to matter. | |

**User's choice:** Silent reconnect (Recommended)
**Notes:** None

---

## Data Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh snapshot | On reconnect, server sends full snapshot (current informer cache). Simple, proven, zero new complexity. | |
| Event-ID replay from buffer | Server assigns monotonic IDs to events, buffers last N, replays from Last-Event-ID. Lossless but complex. | |
| You decide | Let Claude choose based on research into Rancher/Headlamp approaches. | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on this — research will inform the decision.

---

## Burst Handling

| Option | Description | Selected |
|--------|-------------|----------|
| 1s buffer | Collect SSE events for 1 second, apply as single batch. Rancher pattern. | |
| rAF batching | Queue events and flush on requestAnimationFrame (~16ms). More responsive. | |
| You decide | Let Claude choose based on research into Rancher/Headlamp burst handling. | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion — research will evaluate Rancher's buffering pattern.

---

## Heartbeat Scope

### Detection Location

| Option | Description | Selected |
|--------|-------------|----------|
| Both client + server | Server: 90s informer heartbeat. Client: detect missing SSE heartbeats, reconnect if gap. | |
| Server-side only | Keep existing 90s informer heartbeat. Client relies on EventSource built-in error handler. | |
| You decide | Let Claude choose based on failure mode analysis. | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on client-side heartbeat monitoring.

### Informer Timeout

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 90s | CONN-02's 30s is about SSE client recovery, not informer detection. Different layers, different timeouts. | ✓ |
| Reduce to 30s | Match CONN-02 exactly. Risks false-positive restarts during quiet periods. | |
| You decide | Let Claude decide based on production event frequency. | |

**User's choice:** Keep 90s (Recommended)
**Notes:** User confirmed that 90s is appropriate for informer death detection.

---

## Claude's Discretion

- Data recovery approach (snapshot vs event-ID replay)
- Burst batching strategy (1s buffer vs rAF vs bulk merge)
- Client-side heartbeat detection implementation
- EventSource vs fetch-based SSE for custom backoff
- Exponential backoff parameters for client reconnect
- Toast threshold for extended outages

## Deferred Ideas

None — discussion stayed within phase scope
