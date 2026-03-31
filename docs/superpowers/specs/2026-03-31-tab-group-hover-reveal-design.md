# Tab Group Hover Reveal — Design Spec

**Date:** 2026-03-31
**Component:** `apps/web/src/components/clusters/GroupedTabBar.tsx`
**Related:** `apps/web/src/lib/animation-constants.ts`, `apps/web/src/components/clusters/cluster-tabs-config.ts`

---

## Summary

Convert group tab dropdowns from click-to-toggle to hover-to-reveal with an OS-style menu bar interaction model. Hovering a group tab (e.g., "Workloads", "Config") instantly shows its sub-tabs in a dropdown. Clicking the group tab navigates to its first child.

## Behavior Specification

| Interaction | Result |
|---|---|
| **Hover** group tab | Dropdown appears with existing spring animation (`dropdownVariants`) |
| **Mouse leaves** tab + dropdown region | Dropdown closes instantly |
| **Click** group tab label | Navigates to first child tab via `router.push()` (e.g., "Workloads" → `/pods`) |
| **Click** dropdown item | Navigates to that tab (unchanged) |
| **Hover** from one group to another | First dropdown exits, second enters (mutual exclusion via shared `openGroupId`) |
| **Escape** key | Closes dropdown (unchanged) |
| **Click** outside | Closes dropdown (unchanged) |
| **Reduced motion** | All behavior identical, animations suppressed via `useReducedMotion()` (unchanged) |

## Implementation Plan

### 1. Parent component (`GroupedTabBar`) — callback changes

Replace `onToggle` prop with `onOpen` / `onClose`:

- `onOpen(groupId)` — sets `openGroupId` to the given group
- `onClose()` — clears `openGroupId`

The parent retains ownership of `openGroupId` state. This ensures mutual exclusion — entering a new group replaces the previous one, and `AnimatePresence` handles the exit/enter transition.

### 2. `GroupTabItem` — hover handlers

Attach `onMouseEnter` and `onMouseLeave` to the wrapper `<div ref={setRef}>`:

- `onMouseEnter` → calls `onOpen(group.id)`
- `onMouseLeave` → calls `onClose()`

The wrapper div must contain both the button and the dropdown in the DOM tree for `mouseleave` to work correctly across both elements.

### 3. `GroupTabItem` — click navigates

Change button `onClick` from `onToggle` to:

```tsx
const router = useRouter()
// ...
onClick={() => router.push(`${basePath}${group.children[0].path}`)}
```

This navigates to the first child of the group (e.g., "Workloads" → Pods, "Config" → ConfigMaps).

### 4. Invisible bridge element

The dropdown uses `position: fixed` with a 4px gap below the button (`rect.bottom + 4`). When the cursor travels from the button to the dropdown, it briefly leaves both elements, triggering `onMouseLeave`.

Solution: render an invisible bridge `<div>` that spans the gap:

```tsx
{isOpen && (
  <div
    style={{
      position: 'fixed',
      top: dropdownPos.top - 4,
      left: dropdownPos.left,
      width: dropdownWidth,  // match dropdown min-width
      height: 4,
    }}
    aria-hidden="true"
  />
)}
```

This bridge is a child of the wrapper div, so the cursor stays within the `onMouseLeave` boundary while crossing the gap. It has no visual presence (`aria-hidden`, no background).

**Important:** The bridge must be a sibling of the dropdown inside the wrapper div, NOT inside the `AnimatePresence` block (it shouldn't animate).

### 5. What stays the same

- Dropdown animation: `dropdownVariants` (spring scale-in from top)
- Dropdown positioning: `position: fixed` + `getBoundingClientRect()`
- Dropdown styling: all classes unchanged
- Staggered item entrance: `dropdownItemVariants` with `STAGGER.fast`
- `useReducedMotion` checks
- Escape key handler
- Click-outside handler (still useful for touch devices / edge cases)
- `StandaloneTabItem` — completely untouched
- `cluster-tabs-config.ts` — no changes
- `animation-constants.ts` — no changes

## Edge Cases

### Fast mouse sweep across groups
Cursor moves from "Workloads" → "Networking" quickly. `onMouseLeave` fires on Workloads, `onMouseEnter` fires on Networking. Parent updates `openGroupId` from `workloads` to `networking`. `AnimatePresence` handles the crossfade. No flicker.

### Cursor overshoots dropdown
User hovers the tab, then moves mouse past the dropdown. `onMouseLeave` fires on wrapper, dropdown closes instantly. Expected behavior.

### Dropdown taller than viewport
Not an issue — current dropdown items are short lists (max 6 items in Workloads). No scrolling needed.

### Touch devices
Hover events don't fire on touch. The click-outside and Escape handlers remain as fallback. On touch, tapping the group tab navigates to first child. Users can still reach other children via the first child's page or URL.

### Keyboard accessibility
After this change, pressing Enter on a focused group tab navigates to the first child instead of toggling the dropdown. Keyboard-only users lose the ability to open the dropdown. Acceptable trade-off for this dashboard — the child tabs are all reachable via direct URL navigation. If needed later, an `onKeyDown` handler for ArrowDown could open the dropdown.

### Fixed positioning caveat
The bridge element uses `position: fixed` inside a static-positioned wrapper. This works correctly unless an ancestor has `transform`, `filter`, or `will-change` — which would create a new containing block. This is the same exposure the existing dropdown already has (not a new risk introduced by this change).

## Files Modified

| File | Change |
|---|---|
| `apps/web/src/components/clusters/GroupedTabBar.tsx` | Hover handlers, click→navigate, bridge element, callback refactor |

**No other files modified.** No new dependencies. No config changes.

## Skills

| Skill | Purpose |
|---|---|
| `ui-ux-pro-max` | UX guidelines for hover interactions, animation timing, accessibility patterns |
| `frontend-design` | Production-grade implementation quality, polished interaction design |

## Testing Checklist

- [ ] Hover group tab → dropdown appears with spring animation
- [ ] Move cursor into dropdown → stays open
- [ ] Click dropdown item → navigates, dropdown closes
- [ ] Click group tab label → navigates to first child
- [ ] Mouse leave tab+dropdown → closes instantly
- [ ] Hover from one group to another → smooth transition
- [ ] Escape closes dropdown
- [ ] Click outside closes dropdown
- [ ] Reduced motion → no animation, behavior intact
- [ ] Tab bar scroll position preserved (no overflow changes)
- [ ] Both dark and light themes
- [ ] Console: 0 errors
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes

## QA Validation

After implementation, run full QA using the `functional-qa` skill:

1. Restart dev servers (`pnpm dev`)
2. Navigate to any cluster detail page
3. Verify all 7 group tabs respond to hover (Workloads, Networking, Config, Storage, Scaling, Cluster Ops)
4. Verify dropdown items navigate correctly
5. Verify click on group label navigates to first child
6. Verify fast sweep between groups — no flicker, smooth transitions
7. Verify standalone tabs (Overview, Nodes, Events, Logs, Metrics) are unaffected
8. Test both dark and light themes
9. Check browser console — 0 errors
10. Screenshot each group dropdown open state for QA record
