# Helm Revision Values — Inline Accordion

**Date:** 2026-03-31
**Status:** Approved

## Problem

The Helm Revisions tab shows revision metadata (number, status, timestamp, description) but provides no way to view the values for each revision. The existing Values tab only shows the latest revision's values. Operators need to see what values were used for any specific revision — for debugging failed upgrades or comparing configuration changes between revisions.

## Solution

Make revision rows clickable. Clicking a row expands an inline accordion below it showing the YAML values for that revision. Only one revision expanded at a time. Values are fetched on demand from a new backend endpoint.

## Backend Changes

### New endpoint: `helm.revisionValues`

Add to `apps/api/src/routers/helm.ts`:

- **Input:** `{ clusterId: z.string().uuid(), releaseName: z.string(), namespace: z.string(), revision: z.number().int().min(1) }`
- **Returns:** `{ values: Record<string, unknown> }`
- **Implementation:**
  1. Find the specific revision's secret using label selector `owner=helm,name={releaseName},version={revision}`
  2. Decode using existing `decodeHelmRelease()` function
  3. Return `(release.config as Record<string, unknown>) ?? {}` — empty object if no custom values
- **Cache:** `cached(key, 30, fn)` — TTL is 30 **seconds** (not `30_000` — `cached()` passes TTL directly to `redis.setEx()` which expects seconds)
- **Cache key:** `k8sHelmRevisionValues(clusterId, releaseName, namespace, revision)` in `cache-keys.ts`
- **Error handling:** Use `handleK8sError()`. If label selector returns zero secrets (revision pruned), throw `TRPCError({ code: 'NOT_FOUND' })`. Decode failures caught by existing try/catch in `decodeHelmRelease()`.

## Frontend Changes

### `apps/web/src/components/helm/HelmReleaseDetail.tsx`

Modify the Revisions tab (lines ~250-290):

1. **State:** `expandedRevision: number | null` — tracks which revision is expanded
2. **Click handler:** Toggle `expandedRevision` on row click. Clicking already-expanded row collapses it.
3. **Chevron indicator:** Right-aligned chevron per row — `▶` collapsed, `▼` expanded. Rotates with CSS transition.
4. **Row styling:** Add `cursor-pointer` and `hover:bg-white/[0.02]` with `transition-colors duration-150`
5. **Expanded content block** (below clicked row):
   - Wrap in `AnimatePresence` + `motion.div` from `motion/react`. Reuse existing expand variants from `@/lib/animation-constants.ts` if available, or use `initial={{ height: 0, opacity: 0 }}` / `animate={{ height: 'auto', opacity: 1 }}` / `exit={{ height: 0, opacity: 0 }}` with ~200ms ease-out
   - Left border: `border-l-2 border-emerald-500`
   - Background: `bg-black/20 rounded-r-lg`
   - Header: "Values — Revision #N" label + "Copy YAML" button
   - Body: Reuse existing `ValuesViewer` component (already handles YAML stringify + copy)
   - Max height: `max-h-[400px] overflow-y-auto` (matches existing Values tab pattern)
6. **Loading state:** While tRPC fetches, show a pulse skeleton placeholder inside the expanded area
7. **tRPC query:** Use `skipToken` (tRPC v11 pattern) when no revision is expanded: `trpc.helm.revisionValues.useQuery(expandedRevision !== null ? { clusterId, releaseName, namespace, revision: expandedRevision } : skipToken)`

### `apps/api/src/lib/cache-keys.ts`

Add cache key builder: `k8sHelmRevisionValues(clusterId: string, releaseName: string, namespace: string, revision: number)`

## What stays the same

- Revision row layout (number, status badge, timestamp, description) — just becomes clickable
- Existing Values tab (shows latest revision values — unchanged)
- Backend `helm.revisions` endpoint (unchanged)
- `ValuesViewer` component reused as-is

## Data flow

```
User clicks revision row
        |
expandedRevision state set
        |
tRPC helm.revisionValues query fires (enabled when expandedRevision !== null)
        |
Backend finds secret by label version={revision}
        |
decodeHelmRelease() → release.config
        |
ValuesViewer renders YAML with copy button
```

## Estimated scope

- Backend: ~30 lines (new procedure + cache key)
- Frontend: ~60 lines (expandable state, query, expanded content block)
