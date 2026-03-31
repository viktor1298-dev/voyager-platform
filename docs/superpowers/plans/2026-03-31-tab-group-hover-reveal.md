# Tab Group Hover Reveal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also use @ui-ux-pro-max and @frontend-design skills during implementation.

**Goal:** Convert GroupedTabBar group tabs from click-to-toggle to hover-to-reveal with OS-style menu bar interaction.

**Architecture:** Single file change to `GroupedTabBar.tsx`. Replace click toggle with `onMouseEnter`/`onMouseLeave` on the wrapper div. Add invisible bridge element to cover the 4px gap between button and `position: fixed` dropdown. Change click to navigate to first child via `router.push()`.

**Tech Stack:** React 19, Next.js 16 (useRouter), Motion 12 (existing dropdownVariants), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-31-tab-group-hover-reveal-design.md`

**Parallel Agent Strategy:** Agent 1 implements → Agent 2 (reviewer) + Agent 3 (QA runner) in parallel → fix loop until 100% QA pass.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/components/clusters/GroupedTabBar.tsx` | Modify | All changes — hover handlers, click→navigate, bridge element |

No new files. No new dependencies. No config changes.

---

## Task 1: Refactor callbacks + click→navigate + hover handlers

**Files:**
- Modify: `apps/web/src/components/clusters/GroupedTabBar.tsx`

This task merges the callback refactor, click→navigate, and hover handlers into one atomic change to avoid intermediate typecheck failures.

- [ ] **Step 1: Add `useRouter` import**

Add to the existing imports at the top of the file:

```tsx
import { useRouter } from 'next/navigation'
```

- [ ] **Step 2: Update GroupedTabBar to pass `onOpen`/`onClose` instead of `onToggle`**

In `GroupedTabBar`, replace the `onToggle` and `onClose` props on `GroupTabItem` with two callbacks:

```tsx
<GroupTabItem
  key={entry.id}
  group={entry}
  basePath={basePath}
  activeChild={getActiveChild(entry)}
  isOpen={openGroupId === entry.id}
  onOpen={() => setOpenGroupId(entry.id)}
  onClose={() => setOpenGroupId(null)}
  setRef={(el) => setGroupRef(entry.id, el)}
  reduced={reduced}
/>
```

- [ ] **Step 3: Update GroupTabItem — props, hover handlers, click→navigate**

Replace the full `GroupTabItem` function signature and body. Changes:
1. Props: replace `onToggle`/`onClose` with `onOpen`/`onClose`
2. Add `const router = useRouter()`
3. Wrapper div: add `onMouseEnter={onOpen}` and `onMouseLeave={onClose}`
4. Button `onClick`: change from `onToggle` to `router.push(basePath + group.children[0].path)`
5. Dropdown Link `onClick`: change from `onClose` to `onClose` (unchanged, same prop name)

```tsx
function GroupTabItem({
  group,
  basePath,
  activeChild,
  isOpen,
  onOpen,
  onClose,
  setRef,
  reduced,
}: {
  group: TabGroup
  basePath: string
  activeChild: { id: string; label: string; path: string } | null
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  setRef: (el: HTMLDivElement | null) => void
  reduced: boolean
}) {
  const Icon = group.icon
  const isActive = !!activeChild
  const displayLabel = activeChild ? activeChild.label : group.label
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const router = useRouter()

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [isOpen])

  return (
    <div
      ref={setRef}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => router.push(`${basePath}${group.children[0].path}`)}
        data-testid={`cluster-tab-group-${group.id}`}
        className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
          isActive
            ? 'text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
      >
        {/* ... icon, label, chevron, underline — all unchanged */}
      </button>
      {/* bridge + AnimatePresence added in Task 2 */}
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/clusters/GroupedTabBar.tsx
git commit -m "feat: hover-to-reveal with click→navigate for group tabs"
```

---

## Task 2: Add invisible bridge element

**Files:**
- Modify: `apps/web/src/components/clusters/GroupedTabBar.tsx`

- [ ] **Step 1: Add bridge div between the button and AnimatePresence**

Inside the `GroupTabItem` return, after the `</button>` and before `<AnimatePresence>`, add the bridge element. It must be a sibling of the dropdown, NOT inside `AnimatePresence`:

```tsx
{isOpen && (
  <div
    style={{
      position: 'fixed',
      top: dropdownPos.top - 4,
      left: dropdownPos.left,
      width: 180,
      height: 4,
    }}
    aria-hidden="true"
  />
)}
```

Note: `width: 180` matches the dropdown's `min-w-[180px]` class.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/clusters/GroupedTabBar.tsx
git commit -m "feat: add invisible bridge for hover gap"
```

---

## Task 3: Clean up — remove unused `onToggle` references

**Files:**
- Modify: `apps/web/src/components/clusters/GroupedTabBar.tsx`

- [ ] **Step 1: Verify no remaining `onToggle` references**

Search the file for `onToggle`. If any remain from old code, remove them. The only interaction handlers should be:
- `onMouseEnter={onOpen}` on wrapper div
- `onMouseLeave={onClose}` on wrapper div
- `onClick={() => router.push(...)}` on button
- `onClick={onClose}` on dropdown Link items (unchanged)

- [ ] **Step 2: Verify typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors on both

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/clusters/GroupedTabBar.tsx
git commit -m "refactor: remove unused onToggle references"
```

---

## Task 4: QA Validation (Loop Until 100% Pass)

**Skills:** @functional-qa

**IMPORTANT:** This task loops. If any check fails, fix the issue, then restart from step 1. Repeat until all checks pass.

```
┌─────────────────────────────────┐
│     RESTART DEV SERVERS         │
│     pnpm dev                    │
└────────────┬────────────────────┘
             ▼
┌─────────────────────────────────┐
│     RUN FULL QA CHECKLIST       │
└────────────┬────────────────────┘
             ▼
        ┌────────────┐
        │ ALL PASSED? │
        └─┬────────┬─┘
      YES │        │ NO
          ▼        ▼
     ┌────────┐  ┌──────────────────┐
     │  DONE  │  │  FIX THE ISSUE   │
     └────────┘  └───────┬──────────┘
                         │
                         ▼
                 (loop back to RESTART)
```

- [ ] **Step 1: Restart dev servers**

```bash
pkill -f "tsx watch"; pkill -f "next dev"
pnpm dev
```

Wait for both API and Web to be ready.

- [ ] **Step 2: Navigate to a cluster detail page**

Open a cluster page in the browser (e.g., `/clusters/<any-cluster-id>`).

- [ ] **Step 3: Verify all 7 group tabs respond to hover**

Hover each group tab and confirm the dropdown appears with spring animation:
- Workloads (6 children: Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs)
- Networking (3 children: Services, Ingresses, Net Policies)
- Config (4 children: ConfigMaps, Secrets, Namespaces, Quotas)
- Storage (1 child: PVCs)
- Scaling (2 children: HPA, Karpenter)
- Cluster Ops (3 children: Helm, CRDs, RBAC)

- [ ] **Step 4: Verify dropdown items navigate correctly**

Click a dropdown item (e.g., "Pods" under Workloads). Confirm navigation to `/clusters/<id>/pods`.

- [ ] **Step 5: Verify click on group label navigates to first child**

Click the "Workloads" group label directly (not the dropdown). Confirm it navigates to `/clusters/<id>/pods`.

- [ ] **Step 6: Verify fast sweep between groups**

Move cursor quickly from one group to another. Confirm smooth transition — no flicker, no stuck dropdowns.

- [ ] **Step 7: Verify standalone tabs unaffected**

Click Overview, Nodes, Events, Logs, Metrics. Confirm they still work as normal links with no hover dropdown.

- [ ] **Step 8: Test both dark and light themes**

Toggle theme. Re-test hover on at least 2 group tabs in each theme.

- [ ] **Step 9: Check browser console**

Open DevTools → Console. Confirm 0 errors after navigating through tabs.

- [ ] **Step 10: Verify Escape key closes dropdown**

Hover a group tab to open dropdown, press Escape. Confirm it closes.

- [ ] **Step 11: Verify click outside closes dropdown**

Hover a group tab to open dropdown, click on empty page area. Confirm it closes.

- [ ] **Step 12: Verify tab bar scroll position preserved**

On narrow viewport, scroll the tab bar right. Hover a group tab. Confirm scroll position does NOT reset to 0.

- [ ] **Step 13: Verify reduced motion**

Enable `prefers-reduced-motion: reduce` in browser DevTools. Hover group tabs. Confirm behavior works identically but without animations.

- [ ] **Step 14: Screenshot each group dropdown**

Take a screenshot of at least one group dropdown in open state for QA record.

**Exit condition:** 14/14 checks pass. No partial passes. No skips. If ANY check fails → fix → restart from step 1.

---

## Parallel Agent Execution Strategy

| Phase | Agent | Task | Dependencies |
|---|---|---|---|
| 1 | **Implementer** | Tasks 1-3 (all code changes) | None |
| 2 | **Reviewer** | Review implementation against spec + DESIGN.md | Phase 1 complete |
| 2 | **QA Runner** | Task 4 (full QA loop — 14 checks) | Phase 1 complete |

- Phase 2 agents launch in parallel after Phase 1 completes
- If either Phase 2 agent finds issues → fix → re-run both Phase 2 agents
- Loop continues until both Reviewer approves AND QA passes 14/14

---

## Final Commit

After QA passes 100%:

```bash
git add -A
git commit -m "feat: hover-to-reveal group tab dropdowns with OS-style menu bar interaction"
```
