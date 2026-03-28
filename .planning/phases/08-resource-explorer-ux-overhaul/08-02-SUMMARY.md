---
phase: 08-resource-explorer-ux-overhaul
plan: 02
subsystem: api, ui
tags: [sse, kubernetes, informers, real-time, event-source, trpc-cache, websocket-alternative]

requires:
  - phase: 08-resource-explorer-ux-overhaul
    provides: "GroupedTabBar cluster layout with 19 resource types"
provides:
  - "ResourceWatchManager with K8s informers for 12 additional resource types"
  - "SSE endpoint /api/resources/stream for real-time resource change events"
  - "useResourceSSE client hook for automatic tRPC cache invalidation"
  - "Layout-level SSE connection covering ALL cluster tabs"
affects: [08-resource-explorer-ux-overhaul]

tech-stack:
  added: []
  patterns: [reference-counted-resource-watches, sse-event-buffering, layout-level-sse-hook, debounced-cache-invalidation]

key-files:
  created:
    - apps/api/src/lib/resource-watch-manager.ts
    - apps/api/src/routes/resource-stream.ts
    - apps/web/src/hooks/useResourceSSE.ts
  modified:
    - apps/api/src/lib/event-emitter.ts
    - apps/api/src/server.ts
    - packages/types/src/sse.ts
    - packages/config/src/sse.ts

key-decisions:
  - "Reference-counted per-cluster watches: informers start on first subscriber, stop on last disconnect"
  - "Individual informer failure does not stop others: graceful degradation per resource type"
  - "Bridge existing ClusterWatchManager pod/deployment/node events into unified resource stream"
  - "Layout-level single SSE hook covers all tabs without per-tab code"
  - "1s debounce window on tRPC cache invalidation to prevent UI thrashing during rolling deployments"

patterns-established:
  - "ResourceWatchManager: reference-counted K8s informer lifecycle per cluster"
  - "SSE event buffering: accumulate events for RESOURCE_STREAM_BUFFER_MS before flushing to client"
  - "Layout-level SSE: single useResourceSSE call in cluster layout invalidates tRPC cache for all tabs"

requirements-completed: [UX-05]

duration: 6min
completed: 2026-03-28
---

# Phase 08 Plan 02: K8s Watch Real-Time System Summary

**Reference-counted K8s informers for 12 resource types with SSE streaming and automatic tRPC cache invalidation via layout-level hook**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T18:08:55Z
- **Completed:** 2026-03-28T18:15:36Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built ResourceWatchManager with K8s informers for 12 resource types (services, ingresses, statefulsets, daemonsets, jobs, cronjobs, hpa, configmaps, secrets, pvcs, namespaces, events) with reference-counted per-cluster lifecycle
- Created /api/resources/stream SSE endpoint with auth, connection limits, buffered event flushing, and bridge for existing pod/deployment/node events
- Created useResourceSSE client hook with debounced tRPC cache invalidation covering all 15 resource types
- Integrated hook at cluster layout level so ALL tabs get live data updates automatically

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ResourceWatchManager + SSE types + event emitter extension + SSE route** - `6691fdc` (feat)
2. **Task 2: Create useResourceSSE client hook and integrate into cluster layout** - `cc4d970` (feat)

## Files Created/Modified
- `apps/api/src/lib/resource-watch-manager.ts` - Reference-counted K8s informer manager for 12 resource types
- `apps/api/src/routes/resource-stream.ts` - SSE endpoint with auth, limits, buffered event flushing, pod/deployment/node bridging
- `apps/web/src/hooks/useResourceSSE.ts` - Client hook for SSE subscription with debounced tRPC cache invalidation
- `apps/api/src/lib/event-emitter.ts` - Added emitResourceChange method to VoyagerEventEmitter
- `apps/api/src/server.ts` - Registered resource stream route and shutdown handler
- `packages/types/src/sse.ts` - Added ResourceType, ResourceChangeType, ResourceChangeEvent types
- `packages/config/src/sse.ts` - Added RESOURCE_STREAM_BUFFER_MS and connection limit constants
- `apps/web/src/app/clusters/[id]/layout.tsx` - Integrated useResourceSSE hook

## Decisions Made
- Reference-counted watches: informers start only when first SSE subscriber connects, stop when last disconnects (prevents orphan watchers)
- Individual informer failure tolerance: if one resource type fails to start, others continue (graceful degradation)
- Bridge existing ClusterWatchManager events: pod-event, deployment-event, node-event are re-emitted as ResourceChangeEvent in the SSE stream for unified coverage of all 15 resource types
- 1s debounce on tRPC cache invalidation prevents UI thrashing during rolling deployments that emit many rapid changes
- EventSource with withCredentials: true for cookie-based auth (consistent with existing metrics SSE pattern)

## Deviations from Plan

None - plan executed exactly as written. Types and config constants from Step 1 and Step 2 were already present (added by parallel plan 08-01), so those steps were skipped.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all code is fully wired with no placeholder data.

## Next Phase Readiness
- Real-time resource change pipeline is operational: K8s informers detect changes, SSE streams them, client hook invalidates tRPC cache
- All existing cluster tabs (pods, deployments, services, etc.) get live updates automatically
- Ready for subsequent plans that build on real-time data (search, filtering, detail panels)

---
*Phase: 08-resource-explorer-ux-overhaul*
*Completed: 2026-03-28*

## Self-Check: PASSED

- All 3 created files exist (resource-watch-manager.ts, resource-stream.ts, useResourceSSE.ts)
- Both commits found: 6691fdc (Task 1), cc4d970 (Task 2)
- Key patterns verified: ResourceChangeEvent, emitResourceChange, registerResourceStreamRoute, useResourceSSE in layout
