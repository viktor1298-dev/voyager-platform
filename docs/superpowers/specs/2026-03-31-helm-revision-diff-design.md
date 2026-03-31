# Helm Revision Values Diff — Side-by-Side

**Date:** 2026-03-31
**Status:** Approved

## Problem

Operators need to compare Helm values between revisions to understand what changed during upgrades — especially when debugging failed deployments. The Revisions tab shows per-revision values (just added), but there's no way to see the diff between two revisions side by side.

## Solution

Add a "Compare" mode to the Revisions tab. Clicking "Compare" switches from the revision list to a side-by-side diff view showing YAML value differences between two selected revisions. Uses `react-diff-viewer-continued` (already in deps, used by `ResourceDiff.tsx`).

## UX Flow

1. User is in the Revisions tab of an expanded Helm release
2. A **"Compare"** button appears at the top of the revisions list
3. Clicking "Compare" enters diff mode:
   - Revision list is replaced by the diff view
   - Two dropdown selectors: "From" (older) and "To" (newer), defaulting to the two most recent revisions
   - "Back to list" button returns to the normal revisions view
4. Both revision values are fetched in parallel via existing `helm.revisionValues` endpoint
5. Values converted to YAML strings, diffed client-side by `react-diff-viewer-continued`
6. Split (side-by-side) and Unified toggle
7. Change count summary shown in toolbar

## Backend Changes

**None.** The existing `helm.revisionValues` endpoint handles fetching values for any revision. Two parallel calls fetch both sides.

## Frontend Changes

### New file: `apps/web/src/components/helm/HelmRevisionDiff.tsx`

New component. `RevisionData` type must be extracted from `HelmReleaseDetail.tsx` (currently inline) and exported so both files can import it.

Props: `{ clusterId: string, releaseName: string, namespace: string, revisions: RevisionData[], onBack: () => void }`

- **Toolbar:** "Back to list" button, two `<select>` dropdowns for From/To revision, Split/Unified toggle, change count
- **State:** `fromRevision: number`, `toRevision: number` (default to two most recent), `splitView: boolean` (default true)
- **Data fetching:** Two parallel `trpc.helm.revisionValues.useQuery()` calls, one per selected revision, with `enabled: true` and `staleTime: 30_000`
- **Diff rendering:** Convert both values objects to YAML via `stringify()` from `yaml` package. Pass to `ReactDiffViewer` from `react-diff-viewer-continued` with:
  - `splitView` prop controlled by toggle
  - `useDarkTheme={resolvedTheme === 'dark'}` via `useTheme()` from `next-themes` (same pattern as `ResourceDiff.tsx`)
  - Custom `styles` object using CSS custom properties for diff colors
  - `compareMethod: DiffMethod.WORDS` for word-level highlighting
- **Loading state:** Skeleton shimmer while either query is loading
- **Error state:** If either query fails, show error message with retry (same pattern as `ResourceDiff.tsx`)
- **No differences state:** Green checkmark with "Values are identical" message (also shown if user selects same revision for both sides)
- **Column headers:** "Revision #N — status (Xd ago)" for each side
- **Same-revision guard:** Dropdown options for "To" exclude the currently selected "From" revision (and vice versa) to prevent selecting the same revision on both sides

### Modify: `apps/web/src/components/helm/HelmReleaseDetail.tsx`

- Add `diffMode: boolean` state (default false)
- Add "Compare" button at the top of the revisions tab content (only shown when `!diffMode` and `revisions.length >= 2`)
- When `diffMode` is true, render `<HelmRevisionDiff>` instead of the revision list
- Pass `onBack={() => setDiffMode(false)}` to the diff component

### Modify: `apps/web/src/app/globals.css`

Add diff color tokens for both dark and light themes (currently referenced by `ResourceDiff.tsx` but not defined):

```css
/* Dark theme */
--color-diff-added-bg: rgba(16, 185, 129, 0.08);
--color-diff-added-text: #86efac;
--color-diff-removed-bg: rgba(248, 113, 113, 0.08);
--color-diff-removed-text: #fca5a5;
--color-diff-modified-bg: rgba(96, 165, 250, 0.08);

/* Light theme */
--color-diff-added-bg: rgba(16, 185, 129, 0.1);
--color-diff-added-text: #059669;
--color-diff-removed-bg: rgba(239, 68, 68, 0.1);
--color-diff-removed-text: #dc2626;
--color-diff-modified-bg: rgba(59, 130, 246, 0.1);
```

## What stays the same

- Expandable revision rows with per-revision values (just built — unchanged)
- Backend endpoints (no changes)
- `ResourceDiff.tsx` component (not modified, but benefits from new CSS tokens)
- `react-diff-viewer-continued` library (already installed)

## Estimated scope

- New file: `HelmRevisionDiff.tsx` (~150 lines — includes theme detection, two queries, dropdowns, toggle, diff viewer styling, loading/error/empty states)
- Modify: `HelmReleaseDetail.tsx` (~20 lines — extract RevisionData type, diffMode state, Compare button)
- Modify: `globals.css` (~10 lines — diff color tokens under existing dark/light theme selectors)
