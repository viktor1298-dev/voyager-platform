---
phase: 04-cleanup
plan: 02
subsystem: database
tags: [postgres, drizzle, indexes, performance, sql]

requires:
  - phase: none
    provides: "Independent plan -- no prior phase dependency"
provides:
  - "8 database indexes on events, nodes, audit_log, alert_history, and health_history tables"
  - "Index definitions in both init.sql (production) and Drizzle schema (ORM type generation)"
affects: [api-routers, query-performance]

tech-stack:
  added: []
  patterns: ["CREATE INDEX IF NOT EXISTS after each table definition in init.sql", "Drizzle index() callback pattern for schema awareness"]

key-files:
  created: []
  modified:
    - "charts/voyager/sql/init.sql"
    - "packages/db/src/schema/events.ts"
    - "packages/db/src/schema/nodes.ts"
    - "packages/db/src/schema/audit-log.ts"
    - "packages/db/src/schema/alerts.ts"
    - "packages/db/src/schema/health-history.ts"

key-decisions:
  - "Standard B-tree indexes (not GIN/BRIN) -- correct for equality and range queries on UUID/timestamp columns"
  - "Drizzle index() without DESC -- Drizzle handles schema awareness, init.sql handles actual sort order"

patterns-established:
  - "Index placement: CREATE INDEX IF NOT EXISTS immediately after its table's CREATE TABLE in init.sql"
  - "Drizzle index mirroring: every init.sql index must have a matching index() call in the Drizzle schema callback"

requirements-completed: [CLEAN-02]

duration: 3min
completed: 2026-03-30
---

# Phase 04 Plan 02: Add Missing DB Indexes Summary

**8 database indexes added to events, nodes, audit_log, alert_history, and health_history tables for query performance optimization**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T18:54:46Z
- **Completed:** 2026-03-30T18:58:14Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added 8 missing indexes to init.sql (production schema source of truth) using idempotent CREATE INDEX IF NOT EXISTS
- Mirrored all 8 indexes in Drizzle ORM schema files for type generation and schema awareness
- All index names consistent between SQL and ORM: idx_events_cluster_ts, idx_nodes_cluster, idx_nodes_cluster_name, idx_audit_log_timestamp, idx_audit_log_resource_id, idx_alert_history_alert_triggered, idx_health_history_cluster_checked, idx_health_history_checked

## Task Commits

Each task was committed atomically:

1. **Task 1: Add indexes to init.sql** - `40fbfcb` (feat)
2. **Task 2: Mirror indexes in Drizzle schema files** - `ce0cf6c` (feat)

## Files Created/Modified
- `charts/voyager/sql/init.sql` - 8 new CREATE INDEX IF NOT EXISTS statements after respective table definitions
- `packages/db/src/schema/events.ts` - Added index import and idx_events_cluster_ts in existing callback
- `packages/db/src/schema/nodes.ts` - Added index import and callback with idx_nodes_cluster, idx_nodes_cluster_name
- `packages/db/src/schema/audit-log.ts` - Added index import and callback with idx_audit_log_timestamp, idx_audit_log_resource_id
- `packages/db/src/schema/alerts.ts` - Added index import and callback to alertHistory with idx_alert_history_alert_triggered
- `packages/db/src/schema/health-history.ts` - Added index import and callback with idx_health_history_cluster_checked, idx_health_history_checked

## Decisions Made
- Used standard B-tree indexes (PostgreSQL default) for all 8 indexes -- correct for equality and range queries on UUID/timestamp columns used by tRPC routers
- Drizzle index() definitions omit DESC modifier since Drizzle doesn't support it directly -- the init.sql handles actual sort order at database level

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- Worktree typecheck for api/web packages fails due to workspace symlink resolution (pre-existing worktree issue). The db package typechecks cleanly, confirming all index definitions are valid.

## User Setup Required
None -- no external service configuration required. Indexes are idempotent and will be created on next deployment or docker compose restart.

## Next Phase Readiness
- CLEAN-02 requirement complete -- database indexes in place
- Combined with 04-01 (dead code removal + ignoreBuildErrors), Phase 4 cleanup will be fully complete

## Known Stubs
None -- no stubs in this plan.

---
*Phase: 04-cleanup*
*Completed: 2026-03-30*
