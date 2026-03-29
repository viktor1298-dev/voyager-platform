---
phase: 11-lens-grade-live-data-redesign
plan: 03
subsystem: ui
tags: [sse, eventsource, zustand, cors, next.js-proxy, direct-connection]

# Dependency graph
requires:
  - phase: 11-01
    provides: "Rewritten SSE endpoint with snapshot event, immediate flush, compression disabled"
  - phase: 11-02
    provides: "Zustand resource store with setResources, applyEvent, setConnectionState, clearCluster actions"
provides:
  - "useResourceSSE rewritten — direct API connection, Zustand store writes, snapshot handling"
  - "useMetricsSSE converted to direct API connection with withCredentials"
  - "LogViewer converted to direct API connection with withCredentials"
  - "All 3 Next.js SSE proxy routes deleted (~195 lines removed)"
affects: [11-04-consumer-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct browser-to-API SSE via NEXT_PUBLIC_API_URL + withCredentials for CORS"
    - "Zustand getState() for stable action references in useEffect (no deps)"

key-files:
  created: []
  modified:
    - apps/web/src/hooks/useResourceSSE.ts
    - apps/web/src/hooks/useMetricsSSE.ts
    - apps/web/src/components/logs/LogViewer.tsx
  deleted:
    - apps/web/src/app/api/resources/stream/route.ts
    - apps/web/src/app/api/metrics/stream/route.ts
    - apps/web/src/app/api/logs/stream/route.ts

key-decisions:
  - "useResourceStore.getState() for stable references outside React render cycle (no re-render triggers)"
  - "ConnectionState type re-exported from useResourceSSE for backward compat with ConnectionStatusBadge"

patterns-established:
  - "Direct SSE pattern: apiUrl + withCredentials for all browser EventSource connections"
  - "Zustand store as SSE data sink instead of TanStack Query setQueryData"

requirements-completed: [L11-DIRECT-SSE, L11-PROXY-REMOVAL, L11-ZUSTAND-WIRE]

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 11 Plan 03: SSE Direct Connection & Proxy Removal Summary

**Direct browser-to-API SSE connections via NEXT_PUBLIC_API_URL + withCredentials, Zustand store as data sink, all 3 Next.js proxy routes deleted (195 lines removed)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T21:01:10Z
- **Completed:** 2026-03-29T21:05:05Z
- **Tasks:** 2
- **Files modified:** 6 (3 modified, 3 deleted)

## Accomplishments
- Rewrote useResourceSSE to connect directly to API SSE endpoint, write to Zustand store (eliminated 15-case setQueryData switch), and handle new snapshot events for initial data population
- Converted useMetricsSSE and LogViewer EventSource to direct API connections with CORS credentials
- Deleted all 3 Next.js SSE proxy routes (resource, metrics, logs) — removed ~195 lines of node:http proxy code and the entire `apps/web/src/app/api/` directory

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite useResourceSSE** - `1b8be73` (feat)
2. **Task 2: Convert metrics/log SSE, delete proxy routes** - `df54d4a` (feat)

## Files Created/Modified
- `apps/web/src/hooks/useResourceSSE.ts` - Complete rewrite: direct API + Zustand store + snapshot handling (154 lines deleted, 34 added)
- `apps/web/src/hooks/useMetricsSSE.ts` - EventSource URL changed to direct API with withCredentials
- `apps/web/src/components/logs/LogViewer.tsx` - EventSource URL changed to direct API with withCredentials
- `apps/web/src/app/api/resources/stream/route.ts` - DELETED (node:http SSE proxy)
- `apps/web/src/app/api/metrics/stream/route.ts` - DELETED (node:http SSE proxy)
- `apps/web/src/app/api/logs/stream/route.ts` - DELETED (node:http SSE proxy)

## Decisions Made
- Used `useResourceStore.getState()` for stable action references in useEffect — avoids dependency array churn and unnecessary re-connections
- Re-exported `ConnectionState` type from useResourceSSE for backward compatibility with ConnectionStatusBadge import
- Kept useMetricsSSE internal structure (backoff, visibility lifecycle, buffer) unchanged — only the EventSource URL and credentials option changed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All SSE connections now bypass Next.js proxy layer (50-100ms latency per event eliminated)
- Zustand store is the single data sink for SSE resource data
- Ready for Plan 04: consumer migration (swap tRPC useQuery to useClusterResources from Zustand store)

## Self-Check: PASSED

All created/modified files verified on disk. All deleted files confirmed absent. Both task commits found in git log. SUMMARY.md exists.

---
*Phase: 11-lens-grade-live-data-redesign*
*Completed: 2026-03-30*
