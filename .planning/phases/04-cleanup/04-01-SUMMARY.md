---
phase: 04-cleanup
plan: "01"
subsystem: api, database, build
tags: [dead-code, db-indexes, typescript, next.js, cleanup]

requires:
  - phase: 01-diagnose-fix-pipeline
    provides: unified watch-manager.ts that replaced legacy watchers
provides:
  - 1312 lines dead code removed (6 files deleted)
  - DB indexes on 5 high-query tables (events, nodes, audit_log, alert_history, health_history)
  - Honest build pipeline (ignoreBuildErrors: false)
affects: []

tech-stack:
  added: []
  patterns:
    - "All K8s watching via unified watch-manager.ts (no legacy alternatives)"

key-files:
  created: []
  modified:
    - apps/api/src/routers/index.ts
    - apps/api/src/server.ts
    - apps/api/src/lib/k8s-units.ts
    - apps/web/next.config.ts
    - charts/voyager/sql/init.sql
    - apps/api/CLAUDE.md

key-decisions:
  - "Deleted k8s-watchers.ts entirely -- all 3 exported functions only consumed by subscriptions.ts"
  - "Added 8 indexes total (not just 5) -- included kind and action indexes for filtered queries"

patterns-established:
  - "No legacy watcher code paths remain -- watch-manager.ts is sole K8s informer implementation"

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03]

duration: 3min
completed: 2026-03-30
---

# Phase 4 Plan 1: Dead Code Removal, DB Indexes, Build Honesty Summary

**Removed 1312 lines of dead legacy watcher code (6 files), added 8 DB indexes on 5 tables, and enforced TypeScript build checks by disabling ignoreBuildErrors**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T18:55:31Z
- **Completed:** 2026-03-30T18:59:08Z
- **Tasks:** 3
- **Files modified:** 12 (6 deleted, 6 modified)

## Accomplishments
- Deleted 6 dead code files totaling 1312 lines: cluster-watch-manager.ts, resource-watch-manager.ts, cluster-connection-state.ts, k8s-watchers.ts, subscriptions.ts, subscriptions.test.ts
- Added 8 indexes across 5 tables (events, nodes, audit_log, alert_history, health_history) in init.sql
- Set `ignoreBuildErrors: false` in next.config.ts -- verified typecheck passes with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove dead legacy watcher code (CLEAN-01)** - `cb6e732` (feat)
2. **Task 2: Add missing DB indexes (CLEAN-02)** - `ec77061` (feat)
3. **Task 3: Remove ignoreBuildErrors (CLEAN-03)** - `cf84bea` (feat)

## Files Created/Modified
- `apps/api/src/lib/cluster-watch-manager.ts` - DELETED (300 lines, legacy pod/deployment/node informers)
- `apps/api/src/lib/resource-watch-manager.ts` - DELETED (309 lines, legacy 12-type resource informers)
- `apps/api/src/lib/cluster-connection-state.ts` - DELETED (63 lines, FSM only used by cluster-watch-manager)
- `apps/api/src/lib/k8s-watchers.ts` - DELETED (182 lines, deployment progress + log stream helpers only used by subscriptions)
- `apps/api/src/routers/subscriptions.ts` - DELETED (213 lines, unused tRPC subscription router)
- `apps/api/src/__tests__/subscriptions.test.ts` - DELETED (test for deleted router)
- `apps/api/src/routers/index.ts` - Removed subscriptions router import and registration
- `apps/api/src/server.ts` - Removed stopAllWatchers import and no-op call
- `apps/api/src/lib/k8s-units.ts` - Updated comment reference
- `apps/api/CLAUDE.md` - Updated source layout (removed dead entries, updated router count 45->43)
- `apps/web/next.config.ts` - Set ignoreBuildErrors: false
- `charts/voyager/sql/init.sql` - Added 8 indexes on 5 tables

## Decisions Made
- Deleted k8s-watchers.ts entirely rather than keeping it as an empty file -- all 3 exported functions (watchDeploymentProgress, streamLogs, streamLogsFollow) were only consumed by the deleted subscriptions router, and stopAllWatchers was a documented no-op
- Added 8 indexes instead of the minimum 5 -- included compound indexes on events.kind and audit_log.action for common filtered query patterns

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Also deleted k8s-watchers.ts and subscriptions.test.ts**
- **Found during:** Task 1 (dead code removal)
- **Issue:** Plan only listed 4 files for deletion, but k8s-watchers.ts (182 lines) had 3 functions used exclusively by subscriptions.ts, and subscriptions.test.ts was a test file for the deleted router
- **Fix:** Deleted both files, removed stopAllWatchers import from server.ts
- **Files modified:** apps/api/src/lib/k8s-watchers.ts, apps/api/src/__tests__/subscriptions.test.ts
- **Verification:** No broken imports remain; grep confirms zero references to deleted files
- **Committed in:** cb6e732 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Additional dead code removal was necessary for correctness -- leaving orphaned files with no consumers would be dead code.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Codebase is clean -- all legacy watcher code removed
- DB indexes will be applied on next init.sql execution (fresh deploy or new database)
- Build pipeline enforces TypeScript correctness

## Self-Check: PASSED

- All 6 deleted files confirmed absent from filesystem
- All 3 task commits verified in git log (cb6e732, ec77061, cf84bea)
- All 4 modified files confirmed present

---
*Phase: 04-cleanup*
*Completed: 2026-03-30*
