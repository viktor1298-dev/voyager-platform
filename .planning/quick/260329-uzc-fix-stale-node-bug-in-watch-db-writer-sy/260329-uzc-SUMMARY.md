---
type: quick-summary
task_id: 260329-uzc
title: "Fix stale node bug in watch-db-writer syncNodes()"
completed: 2026-03-29T19:22:00Z
duration: "1min"
tasks_completed: 1
tasks_total: 1
files_modified:
  - apps/api/src/lib/watch-db-writer.ts
key_changes:
  - "Added notInArray import from drizzle-orm"
  - "Added DELETE step after upsert loop in syncNodes() to remove stale DB rows"
decisions: []
---

# Quick Task 260329-uzc: Fix stale node bug in watch-db-writer syncNodes()

**One-liner:** Delete phantom nodes from DB after upsert by adding `notInArray` cleanup in `syncNodes()`

## What Changed

`syncNodes()` in `watch-db-writer.ts` upserted current nodes from WatchManager into the `nodes` table but never removed rows for nodes that no longer exist in the in-memory store. This caused terminated nodes (e.g., `ip-10-0-246-211.ec2.internal`) to persist as phantom rows, inflating node counts on the cluster list page.

### Fix

1. Added `notInArray` to the drizzle-orm import (line 10)
2. After the upsert `for` loop completes, added a `DELETE` step that removes any `nodes` rows where `clusterId` matches but `name` is NOT IN the current WatchManager node list (lines 113-117)

### Safety

- The existing early-return guard (`if (rawNodes.length === 0) return` on line 42) prevents the delete from ever running with an empty list, which would incorrectly wipe all nodes for a cluster.
- Delete runs after all upserts complete (not interleaved), ensuring no race between insert and delete.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 945db3b | fix(260329-uzc): delete stale nodes from DB after syncNodes() upsert |

## Verification

- `pnpm --filter api exec tsc --noEmit` -- zero errors
- Runtime verification: after API restart, `nodes.list` will return only nodes present in WatchManager (matching `kubectl get nodes` count)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
