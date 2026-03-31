# Helm Revision Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add side-by-side diff view for comparing Helm values between revisions.

**Architecture:** A "Compare" button in the Revisions tab switches to diff mode. Two revision dropdowns let the user pick any pair. Both values fetched in parallel via existing `helm.revisionValues`, converted to YAML, diffed client-side by `react-diff-viewer-continued`. No backend changes.

**Tech Stack:** react-diff-viewer-continued, yaml, next-themes, tRPC, Motion

**Spec:** `docs/superpowers/specs/2026-03-31-helm-revision-diff-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/app/globals.css` | Modify | Add diff color CSS tokens (dark + light) |
| `apps/web/src/components/helm/HelmRevisionDiff.tsx` | Create | Side-by-side diff component |
| `apps/web/src/components/helm/HelmReleaseDetail.tsx` | Modify | Export RevisionData type, add diffMode state + Compare button |

No backend changes.

---

### Task 1: Add diff color CSS tokens

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add dark theme diff tokens**

In `apps/web/src/app/globals.css`, inside the `:root {` block (after the terminal tokens around line 279), add:

```css
  /* Diff viewer colors */
  --color-diff-added-bg: rgba(16, 185, 129, 0.08);
  --color-diff-added-text: #86efac;
  --color-diff-removed-bg: rgba(248, 113, 113, 0.08);
  --color-diff-removed-text: #fca5a5;
  --color-diff-modified-bg: rgba(96, 165, 250, 0.08);
```

- [ ] **Step 2: Add light theme diff tokens**

In the `html.light {` block (after the existing light theme overrides), add:

```css
  /* Diff viewer colors */
  --color-diff-added-bg: rgba(16, 185, 129, 0.1);
  --color-diff-added-text: #059669;
  --color-diff-removed-bg: rgba(239, 68, 68, 0.1);
  --color-diff-removed-text: #dc2626;
  --color-diff-modified-bg: rgba(59, 130, 246, 0.1);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: add diff color CSS tokens for dark and light themes"
```

---

### Task 2: Create HelmRevisionDiff component

**Files:**
- Create: `apps/web/src/components/helm/HelmRevisionDiff.tsx`

- [ ] **Step 1: Create the component file**

Create `apps/web/src/components/helm/HelmRevisionDiff.tsx` with the complete component:

```tsx
'use client'

import { ArrowLeft, Check, GitCompare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { stringify } from 'yaml'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'

export interface RevisionData {
  revision: number
  status: string
  updatedAt: string | null
  description: string
}

interface HelmRevisionDiffProps {
  clusterId: string
  releaseName: string
  namespace: string
  revisions: RevisionData[]
  onBack: () => void
}

export function HelmRevisionDiff({
  clusterId,
  releaseName,
  namespace,
  revisions,
  onBack,
}: HelmRevisionDiffProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Default: compare two most recent (revisions are sorted descending)
  // Parent guarantees revisions.length >= 2, so these are always defined
  const [fromRev, setFromRev] = useState(revisions[1]!.revision)
  const [toRev, setToRev] = useState(revisions[0]!.revision)
  const [splitView, setSplitView] = useState(true)

  const fromQuery = trpc.helm.revisionValues.useQuery(
    { clusterId, releaseName, namespace, revision: fromRev },
    { staleTime: 30_000 },
  )
  const toQuery = trpc.helm.revisionValues.useQuery(
    { clusterId, releaseName, namespace, revision: toRev },
    { staleTime: 30_000 },
  )

  const { fromYaml, toYaml } = useMemo(() => {
    const fromValues = (fromQuery.data?.values as Record<string, unknown>) ?? {}
    const toValues = (toQuery.data?.values as Record<string, unknown>) ?? {}
    return {
      fromYaml: stringify(fromValues, { indent: 2, lineWidth: 120 }),
      toYaml: stringify(toValues, { indent: 2, lineWidth: 120 }),
    }
  }, [fromQuery.data, toQuery.data])

  const isLoading = fromQuery.isLoading || toQuery.isLoading
  const isError = fromQuery.isError || toQuery.isError
  const hasDiff = fromYaml !== toYaml

  const fromInfo = revisions.find((r) => r.revision === fromRev)
  const toInfo = revisions.find((r) => r.revision === toRev)

  const diffStyles = {
    variables: {
      dark: {
        diffViewerBackground: 'transparent',
        diffViewerTitleBackground: 'var(--color-bg-card)',
        diffViewerTitleColor: 'var(--color-text-secondary)',
        diffViewerTitleBorderColor: 'var(--color-border)',
        diffViewerColor: 'var(--color-text-primary)',
        addedBackground: 'var(--color-diff-added-bg)',
        addedColor: 'var(--color-diff-added-text)',
        removedBackground: 'var(--color-diff-removed-bg)',
        removedColor: 'var(--color-diff-removed-text)',
        changedBackground: 'var(--color-diff-modified-bg)',
        wordAddedBackground: 'rgba(16, 185, 129, 0.25)',
        wordRemovedBackground: 'rgba(239, 68, 68, 0.25)',
        addedGutterBackground: 'rgba(16, 185, 129, 0.08)',
        removedGutterBackground: 'rgba(239, 68, 68, 0.08)',
        gutterBackground: 'transparent',
        gutterBackgroundDark: 'transparent',
        codeFoldBackground: 'var(--color-bg-card-hover)',
        codeFoldGutterBackground: 'var(--color-bg-card-hover)',
        codeFoldContentColor: 'var(--color-text-muted)',
      },
      light: {
        diffViewerBackground: 'transparent',
        diffViewerTitleBackground: 'var(--color-bg-card)',
        diffViewerTitleColor: 'var(--color-text-secondary)',
        diffViewerTitleBorderColor: 'var(--color-border)',
        diffViewerColor: 'var(--color-text-primary)',
        addedBackground: 'var(--color-diff-added-bg)',
        addedColor: 'var(--color-diff-added-text)',
        removedBackground: 'var(--color-diff-removed-bg)',
        removedColor: 'var(--color-diff-removed-text)',
        changedBackground: 'var(--color-diff-modified-bg)',
        wordAddedBackground: 'rgba(5, 150, 105, 0.2)',
        wordRemovedBackground: 'rgba(220, 38, 38, 0.2)',
        addedGutterBackground: 'rgba(5, 150, 105, 0.06)',
        removedGutterBackground: 'rgba(220, 38, 38, 0.06)',
        gutterBackground: 'transparent',
        gutterBackgroundDark: 'transparent',
        codeFoldBackground: 'var(--color-bg-card-hover)',
        codeFoldGutterBackground: 'var(--color-bg-card-hover)',
        codeFoldContentColor: 'var(--color-text-muted)',
      },
    },
    contentText: {
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '12px',
      lineHeight: '1.5',
    },
    lineNumber: {
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '12px',
      color: 'var(--color-text-dim)',
    },
    diffContainer: {
      borderRadius: '0.375rem',
      overflow: 'hidden',
    },
    titleBlock: {
      padding: '8px 12px',
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '11px',
      fontWeight: 600,
    },
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
              bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-muted)]
              hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent)]/40 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to list
          </button>
          <div className="h-4 w-px bg-[var(--color-border)]/40" />
          <div className="flex items-center gap-2">
            <select
              value={fromRev}
              onChange={(e) => setFromRev(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono
                bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-secondary)]
                hover:border-[var(--color-accent)]/40 transition-colors cursor-pointer"
            >
              {revisions
                .filter((r) => r.revision !== toRev)
                .map((r) => (
                  <option key={r.revision} value={r.revision}>
                    #{r.revision} {r.status}
                  </option>
                ))}
            </select>
            <span className="text-[var(--color-text-dim)] text-xs">→</span>
            <select
              value={toRev}
              onChange={(e) => setToRev(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono
                bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-secondary)]
                hover:border-[var(--color-accent)]/40 transition-colors cursor-pointer"
            >
              {revisions
                .filter((r) => r.revision !== fromRev)
                .map((r) => (
                  <option key={r.revision} value={r.revision}>
                    #{r.revision} {r.status}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[var(--color-border)]/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setSplitView(true)}
              className={`px-3 py-1 text-[10px] font-medium transition-colors ${
                splitView
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => setSplitView(false)}
              className={`px-3 py-1 text-[10px] font-medium transition-colors border-l border-[var(--color-border)]/40 ${
                !splitView
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              Unified
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          <div className="h-4 w-3/4 rounded bg-white/[0.06] animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-white/[0.04] animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-white/[0.04] animate-pulse" />
        </div>
      ) : isError ? (
        <div className="p-4 flex flex-col items-center justify-center gap-3">
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Failed to load revision values for comparison.
          </p>
        </div>
      ) : !hasDiff ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="rounded-full bg-emerald-500/10 p-3">
            <Check className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            Values are identical
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Revisions #{fromRev} and #{toRev} have the same values.
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-[var(--color-border)]/40" style={{ maxHeight: 500 }}>
          <ReactDiffViewer
            oldValue={fromYaml}
            newValue={toYaml}
            splitView={splitView}
            leftTitle={`Revision #${fromRev} — ${fromInfo?.status ?? ''} ${fromInfo?.updatedAt ? `(${timeAgo(fromInfo.updatedAt)})` : ''}`}
            rightTitle={`Revision #${toRev} — ${toInfo?.status ?? ''} ${toInfo?.updatedAt ? `(${timeAgo(toInfo.updatedAt)})` : ''}`}
            useDarkTheme={isDark}
            styles={diffStyles}
            showDiffOnly={false}
            extraLinesSurroundingDiff={3}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/helm/HelmRevisionDiff.tsx
git commit -m "feat: add HelmRevisionDiff component for side-by-side values comparison"
```

---

### Task 3: Add Compare button and diffMode to HelmReleaseDetail

**Files:**
- Modify: `apps/web/src/components/helm/HelmReleaseDetail.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, add `GitCompare` to the lucide-react import (line 3):

```typescript
import { ChevronDown, Clock, Copy, FileText, GitBranch, GitCompare, Info, Package } from 'lucide-react'
```

Add after the animation imports (after line 11):

```typescript
import { HelmRevisionDiff } from './HelmRevisionDiff'
```

- [ ] **Step 2: Replace inline RevisionData type with import**

The `RevisionData` type is currently defined inline inside the component (lines 169-174). Since `HelmRevisionDiff.tsx` exports it, replace the inline definition. Remove lines 169-174:

```typescript
  type RevisionData = {
    revision: number
    status: string
    updatedAt: string | null
    description: string
  }
```

And add this import at the top of the file (alongside the `HelmRevisionDiff` import):

```typescript
import { HelmRevisionDiff, type RevisionData } from './HelmRevisionDiff'
```

- [ ] **Step 3: Add diffMode state**

Inside the `HelmReleaseDetail` component, after the `expandedRevision` state (line 177), add:

```typescript
const [diffMode, setDiffMode] = useState(false)
```

- [ ] **Step 4: Add Compare button and diffMode toggle to Revisions tab**

Replace the revisions tab content block (the `content: (...)` of the revisions tab, starting at line 266). Wrap the existing content with a diffMode conditional and add the Compare button:

```tsx
      content: diffMode ? (
        <HelmRevisionDiff
          clusterId={clusterId}
          releaseName={releaseName}
          namespace={namespace}
          revisions={revisions}
          onBack={() => setDiffMode(false)}
        />
      ) : (
        <div className="space-y-1.5">
          {revisionsQuery.isLoading ? (
            <div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" />
          ) : revisions.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">No revision history.</p>
          ) : (
            <>
              {revisions.length >= 2 && (
                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    onClick={() => setDiffMode(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                      bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-muted)]
                      hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/40 transition-colors"
                  >
                    <GitCompare className="h-3 w-3" />
                    Compare
                  </button>
                </div>
              )}
              {revisions.map((rev) => (
                <div key={rev.revision}>
                  {/* ... existing expandable row code stays exactly as-is ... */}
                </div>
              ))}
            </>
          )}
        </div>
      ),
```

**Important:** The existing `revisions.map((rev) => (...))` block with the expandable rows stays exactly as-is. Only wrap it with the `<>` fragment and add the Compare button before it.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/helm/HelmReleaseDetail.tsx
git commit -m "feat: add Compare button to Revisions tab with diffMode toggle"
```

---

### Task 4: Build and verify

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: All pages compile, 0 errors

- [ ] **Step 2: Verify visually**

Navigate to a cluster's Helm tab, expand a release with multiple revisions (e.g., nginx-ingress with 6 revisions). Go to the Revisions tab. Verify:
- "Compare" button appears at top-right of the revisions list
- Clicking Compare shows the diff view with revision dropdowns
- Dropdowns default to the two most recent revisions
- Diff shows side-by-side with red/green highlighting
- Split/Unified toggle works
- "Back to list" returns to the expandable revision rows
- Changing dropdown selections updates the diff
- Selecting same revision on both sides is prevented (filtered out)
- 0 console errors

- [ ] **Step 3: Final commit if any cleanup needed**
