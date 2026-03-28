---
phase: 09-lens-inspired-power-features
plan: 04
subsystem: api, ui
tags: [trpc, mutations, k8s, restart, scale, delete, action-toolbar, confirmation-dialogs]

requires:
  - phase: 09-lens-inspired-power-features
    provides: ActionToolbar, DeleteConfirmDialog, RestartConfirmDialog, ScaleInput, PortForwardCopy components (Plan 02)
  - phase: 09-lens-inspired-power-features
    provides: YAML/Diff tabs on all resource pages (Plan 03)
provides:
  - Restart/scale/delete mutation endpoints for StatefulSets
  - Restart/delete mutation endpoints for DaemonSets
  - Delete mutation endpoint for Deployments
  - ActionToolbar wired into Deployments, StatefulSets, DaemonSets, and Pods detail panels
  - Confirmation dialogs for all destructive actions across workload pages
affects: [09-05, 09-07, 09-08]

tech-stack:
  added: []
  patterns: [adminProcedure mutation with cache invalidation and audit logging, ActionToolbar actions prop on DetailTabs]

key-files:
  modified:
    - apps/api/src/routers/statefulsets.ts
    - apps/api/src/routers/daemonsets.ts
    - apps/api/src/routers/deployments.ts
    - apps/web/src/app/clusters/[id]/deployments/page.tsx
    - apps/web/src/app/clusters/[id]/statefulsets/page.tsx
    - apps/web/src/app/clusters/[id]/daemonsets/page.tsx
    - apps/web/src/app/clusters/[id]/pods/page.tsx
    - apps/web/src/components/resource/index.ts

key-decisions:
  - "Added delete mutation to Deployments router (was missing from prior work, needed for frontend parity)"
  - "Pods page uses existing podName input field for delete mutation instead of name to match established API contract"
  - "PortForwardCopy only shown when pod has container ports (conditional action in toolbar)"

patterns-established:
  - "Workload mutation pattern: adminProcedure + cache invalidation + logAudit + TRPCError catch"
  - "ActionToolbar as actions prop on DetailTabs for right-aligned operational buttons"

requirements-completed: [LENS-04]

duration: 7min
completed: 2026-03-28
---

# Phase 9 Plan 04: Workload Mutation Backends + Action Toolbar Wiring Summary

**Added restart/scale/delete backend mutations for StatefulSets and DaemonSets, wired ActionToolbar with confirmation dialogs into all 4 workload detail panels**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T21:36:50Z
- **Completed:** 2026-03-28T21:44:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added 5 new backend mutation endpoints: StatefulSets (restart, scale, delete), DaemonSets (restart, delete)
- Added 1 missing mutation: Deployments delete (restart/scale already existed)
- Wired ActionToolbar into all 4 workload pages with proper confirmation flows: type-name-to-confirm for delete, single confirm for restart, inline input for scale
- Pods page gains Exec placeholder, Port Forward popover, and Delete confirmation dialog in the detail panel toolbar

## Task Commits

Each task was committed atomically:

1. **Task 1: Add restart/scale/delete mutations to backend routers** - `046689a` (feat)
2. **Task 2: Wire ActionToolbar into all workload pages** - `c0405b3` (feat)

## Files Created/Modified
- `apps/api/src/routers/statefulsets.ts` - Added restart, scale, delete adminProcedure mutations with audit logging
- `apps/api/src/routers/daemonsets.ts` - Added restart, delete adminProcedure mutations with audit logging
- `apps/api/src/routers/deployments.ts` - Added delete adminProcedure mutation (restart/scale existed)
- `apps/web/src/app/clusters/[id]/deployments/page.tsx` - ActionToolbar with restart, scale, delete + confirmation dialogs
- `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` - ActionToolbar with restart, scale, delete + confirmation dialogs
- `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` - ActionToolbar with restart, delete (no scale) + confirmation dialogs
- `apps/web/src/app/clusters/[id]/pods/page.tsx` - ActionToolbar with exec, port forward, delete + DeleteConfirmDialog
- `apps/web/src/components/resource/index.ts` - Added barrel exports for ActionToolbar, DeleteConfirmDialog, RestartConfirmDialog, ScaleInput, PortForwardCopy

## Decisions Made
- Added delete mutation to Deployments router -- was missing from prior work; needed for frontend delete button to function
- Pods page keeps existing `podName` input field in the delete mutation to maintain backward compatibility with the established API contract
- PortForwardCopy action only appears in Pods toolbar when the pod has container ports -- conditionally included in the actions array

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added delete mutation to Deployments router**
- **Found during:** Task 1
- **Issue:** Plan references `trpc.deployments.delete.useMutation()` in Task 2 but deployments.ts only had restart and scale
- **Fix:** Added delete adminProcedure following the same pattern as restart/scale
- **Files modified:** apps/api/src/routers/deployments.ts
- **Verification:** typecheck passes, build passes
- **Committed in:** 046689a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** Delete mutation was required for the frontend wiring in Task 2 to compile. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All workload mutation backends complete and wired to UI
- Exec button is a noop placeholder -- will be wired to terminal drawer in Plan 05
- PortForwardCopy shows kubectl commands -- functional without backend changes
- Components ready for further resource page integrations in Plans 07-10

## Self-Check: PASSED

All 8 modified files verified present. Both task commits (046689a, c0405b3) confirmed in git history.

---
*Phase: 09-lens-inspired-power-features*
*Completed: 2026-03-28*
