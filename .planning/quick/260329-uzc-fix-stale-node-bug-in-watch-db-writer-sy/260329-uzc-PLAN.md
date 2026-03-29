---
type: quick
task_id: 260329-uzc
title: "Fix stale node bug in watch-db-writer syncNodes()"
files_modified:
  - apps/api/src/lib/watch-db-writer.ts
autonomous: true
estimated_effort: "5 min"
---

<objective>
Fix stale node bug: `syncNodes()` upserts current nodes into the DB but never deletes nodes that no longer exist in the WatchManager's in-memory store. This causes phantom nodes (e.g., `ip-10-0-246-211.ec2.internal`) to persist in the `nodes` table after the real node is terminated, inflating node counts on the cluster list page.

Purpose: The `nodes.list` tRPC procedure reads directly from the DB (`nodes` table), so stale rows cause the frontend to show ghost nodes with incorrect pod counts. The WatchManager (in-memory) has the correct 5 nodes, but the DB has 6.

Output: After fix, `syncNodes()` will delete any `nodes` rows for the given `clusterId` whose `name` is NOT in the current WatchManager node list, ensuring DB always reflects reality.
</objective>

<context>
@apps/api/src/lib/watch-db-writer.ts
@packages/db/src/schema/nodes.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add stale node deletion after upsert loop in syncNodes()</name>
  <files>apps/api/src/lib/watch-db-writer.ts</files>
  <action>
In `apps/api/src/lib/watch-db-writer.ts`:

1. Add `notInArray` to the existing drizzle-orm import on line 10:
   Change: `import { and, eq } from 'drizzle-orm'`
   To: `import { and, eq, notInArray } from 'drizzle-orm'`

2. After the upsert `for` loop (after line 111, before the closing `}` of `syncNodes`), add a delete step:

```typescript
  // Delete stale nodes no longer reported by WatchManager
  const currentNodeNames = rawNodes.map((n) => n.metadata?.name ?? 'unknown')
  await db
    .delete(nodes)
    .where(
      and(
        eq(nodes.clusterId, clusterId),
        notInArray(nodes.name, currentNodeNames),
      ),
    )
```

This mirrors the upsert logic which already uses `clusterId + name` as the composite key for matching. The `notInArray` operator generates a SQL `NOT IN (...)` clause, matching the `inArray` usage already established in `sso.ts` and `authorization.ts`.

Edge case: If `rawNodes` is empty, the function returns early on line 42 (`if (rawNodes.length === 0) return`), so the delete step will never run with an empty list (which would incorrectly delete all nodes).
  </action>
  <verify>
    <automated>cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm --filter api exec tsc --noEmit --pretty 2>&1 | tail -5</automated>
  </verify>
  <done>
- `syncNodes()` deletes DB rows for nodes not in WatchManager's current list
- `notInArray` import added to drizzle-orm import line
- Delete runs after all upserts complete (not interleaved)
- Empty node list early-return prevents accidental full-table delete
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `pnpm --filter api exec tsc --noEmit` passes with zero errors
2. `pnpm build` succeeds
3. After deploying/restarting API: `nodes.list` query returns only nodes that exist in the live cluster (matching `kubectl get nodes` count)
</verification>

<success_criteria>
- The `syncNodes()` function in `watch-db-writer.ts` deletes stale node rows after upserting current ones
- DB `nodes` table count matches WatchManager in-memory node count for each cluster
- No phantom nodes persist across sync cycles
- TypeScript builds cleanly
</success_criteria>
