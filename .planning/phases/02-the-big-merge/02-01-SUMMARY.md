---
phase: 02-the-big-merge
plan: 01
subsystem: git
tags: [merge, conflict-resolution, metrics, sidebar, recharts, motion]

requires:
  - phase: 01-safety-net
    provides: Recovery tags (pre-merge-snapshot, pre-cleanup-feat), branch-tips.txt, rerere enabled
provides:
  - "Merge staging area with 54 commits from feat/init-monorepo integrated into main"
  - "All 9 conflicting files resolved with zero conflict markers"
  - "metrics.ts with nodeTimeSeries + nodeMetricsHistory + RBAC fix + bucket timeline"
  - "Sidebar.tsx with Phase 4 polish + UX audit improvements"
  - "MERGE_HEAD preserved for Plan 02 normalization and Plan 03 commit"
affects: [02-02-PLAN, 02-03-PLAN]

tech-stack:
  added: []
  patterns:
    - "getBucketTimeline() for Grafana-style bucket windows (replacing getTimeRangeStart)"
    - "Array-based bucket stats (replacing Map-based bucketing)"
    - "data-collapsible CSS transition approach for sidebar width (SB-006)"

key-files:
  created: []
  modified:
    - apps/api/src/routers/metrics.ts
    - apps/web/src/components/Sidebar.tsx
    - apps/web/src/components/metrics/MetricsAreaChart.tsx
    - apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx
    - apps/web/src/components/metrics/ResourceSparkline.tsx
    - BOARD.md
    - pipeline-evidence/guardian-accuracy.json
    - tests/e2e/optimistic-ui.spec.ts
    - tests/e2e/phase3-v194-animation.spec.ts

key-decisions:
  - "Accepted feat/init-monorepo's getBucketTimeline approach for all metrics procedures (bucket window support for short ranges)"
  - "Used main's structural Sidebar as base with Phase 4 polish features (accordion, tooltips, data-collapsible)"
  - "Updated nodeTimeSeries to use getBucketTimeline instead of removed getTimeRangeStart"
  - "Used typeof === 'number' filter for sparkline data (stricter than !== null)"
  - "Kept m from motion/react (main's convention) -- normalization to motion deferred to Plan 02-02"

patterns-established:
  - "Tier-based conflict resolution: accept-theirs for data/test files, manual merge for components/API"
  - "Merge staging with --no-commit preserves review window before finalization"

requirements-completed: [MERGE-01, MERGE-02]

duration: 7min
completed: 2026-03-26
---

# Phase 02 Plan 01: Merge Execution and Conflict Resolution Summary

**Merged 54 commits from feat/init-monorepo into main, resolving all 9 conflicting files (metrics.ts with 9 markers, Sidebar.tsx with 5, MetricsAreaChart with 5, 2 single-marker components, 4 accept-theirs files) with zero conflict markers remaining**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-26T19:00:16Z
- **Completed:** 2026-03-26T19:07:01Z
- **Tasks:** 2
- **Files in merge staging area:** 166

## Accomplishments

- Executed `git merge --no-ff --no-commit origin/feat/init-monorepo` bringing 54 commits into main's working tree
- Resolved all 9 conflicting files across 4 tiers of complexity with both branches' features preserved
- Preserved main's nodeTimeSeries procedure + nodeMetricsHistory import (Pitfall 1 prevention)
- Preserved main's Phase 4 sidebar polish (accordion, tooltips, anomaly badge, keyboard shortcut)
- Integrated feat/init-monorepo's bucket timeline system, UX audit fixes, and short-range support
- Merge remains in staged (not committed) state for Plan 02 normalization and Plan 03 commit

## Task Commits

This plan operates within a merge staging area. Per the critical constraint, NO commits were made -- the merge state (MERGE_HEAD) must persist for Plans 02-02 and 02-03.

1. **Task 1: Execute merge and resolve Tier 1-2 conflicts** - No commit (merge staging)
2. **Task 2: Resolve Tier 3-4 conflicts** - No commit (merge staging)

All 9 resolved files are staged via `git add` with MERGE_HEAD intact.

## Files Created/Modified

### Tier 1 (accept-theirs)
- `BOARD.md` - Pipeline state updated to v223-v225 (feat/init-monorepo's latest)
- `pipeline-evidence/guardian-accuracy.json` - Latest evidence data from feat/init-monorepo

### Tier 2 (accept-theirs)
- `tests/e2e/optimistic-ui.spec.ts` - Updated selectors for v215+ UI
- `tests/e2e/phase3-v194-animation.spec.ts` - Updated selectors for v215+ UI

### Tier 3 (manual merge, 1 conflict each)
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` - Combined main's NodeMetricsTable with feat's NodeResourceBreakdown
- `apps/web/src/components/metrics/ResourceSparkline.tsx` - Used stricter typeof filter with main's comment

### Tier 4 (manual merge, 5-9 conflicts)
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` - Combined bucket window fields, Grafana-style axis formatting, short-range timeline support, removed duplicate connectNulls prop
- `apps/web/src/components/Sidebar.tsx` - Main's Phase 4 structural base with feat's aria-label, collapsed alert dot, UX refinements
- `apps/api/src/routers/metrics.ts` - Feat's getBucketTimeline for all procedures, main's nodeTimeSeries preserved and updated to use getBucketTimeline

## Decisions Made

1. **getBucketTimeline over getTimeRangeStart** -- All 6 metrics procedures now use feat/init-monorepo's getBucketTimeline approach. Main's getTimeRangeStart was removed. The bucket timeline approach supports short ranges (30s, 1m, 5m) and returns bucketStart/bucketEnd fields that the frontend MetricsAreaChart tooltip depends on.

2. **Main's Sidebar as structural base** -- Main's Sidebar has Phase 4 polish (SB-002 through SB-011): clusters accordion, tooltip support in collapsed mode, anomaly badge, keyboard shortcut (Cmd+B), data-collapsible CSS transitions. Feat/init-monorepo's flat nav with cluster quick-switch footer was simpler but less feature-complete. Added feat's `aria-label` and collapsed-state alert indicator dot.

3. **nodeTimeSeries updated to getBucketTimeline** -- Main's nodeTimeSeries procedure called the now-removed `getTimeRangeStart()`. Updated to use `getBucketTimeline()` for consistency. The procedure still queries `nodeMetricsHistory` table and returns per-node time series data.

4. **m vs motion deferred** -- Kept `m` from motion/react in Sidebar.tsx (matching main's convention). The normalization to `motion` is scoped to Plan 02-02 (post-merge normalization).

5. **Network bytes null over zero fallback** -- MetricsAreaChart uses `null` for missing network bytes (feat/init-monorepo's approach) instead of main's fallback-to-zero. This preserves gap rendering with `connectNulls={false}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated nodeTimeSeries to use getBucketTimeline**
- **Found during:** Task 2 (metrics.ts conflict resolution)
- **Issue:** The nodeTimeSeries procedure (main's contribution) called `getTimeRangeStart()` which no longer exists after resolving conflicts in favor of feat/init-monorepo's `getBucketTimeline()` approach
- **Fix:** Changed `const start = getTimeRangeStart(input.range)` to `const timeline = getBucketTimeline(input.range); const start = timeline.start`
- **Files modified:** apps/api/src/routers/metrics.ts
- **Verification:** grep confirms no references to getTimeRangeStart remain

**2. [Rule 1 - Bug] Removed duplicate connectNulls prop in MetricsAreaChart**
- **Found during:** Task 2 (MetricsAreaChart.tsx conflict resolution)
- **Issue:** The merged file had duplicate `connectNulls={false}` props on the Area component (one from each branch)
- **Fix:** Removed the duplicate prop
- **Files modified:** apps/web/src/components/metrics/MetricsAreaChart.tsx
- **Verification:** Single connectNulls prop remains

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary to prevent runtime errors. No scope creep.

## Issues Encountered

- Removed a stale worktree at `.claude/worktrees/objective-shockley` during pre-merge safety checks (required clean worktree list)
- STATE.md had unstaged changes requiring stash/pop around the merge operation

## Next Phase Readiness

- Merge staging area is ready for Plan 02-02 (post-merge normalization: motion imports, evil merge review, typecheck/lint)
- MERGE_HEAD preserved -- Plan 02-03 will commit the merge after validation passes
- Key risk: `server.ts` and `ClusterHealthWidget.tsx` auto-merged without conflicts -- these are "evil merge" candidates that Plan 02-02 must review (Pitfall 2)
- Motion import normalization (m -> motion) is scoped to Plan 02-02

## Self-Check: PASSED

- SUMMARY.md: FOUND
- MERGE_HEAD: FOUND (merge in progress)
- Conflict markers: 0
- Unresolved conflicts (UU): 0
- nodeTimeSeries in metrics.ts: FOUND (1 occurrence)
- nodeMetricsHistory in metrics.ts: FOUND (6 occurrences)
- All 9 resolved files staged: CONFIRMED

---
*Phase: 02-the-big-merge*
*Completed: 2026-03-26*
