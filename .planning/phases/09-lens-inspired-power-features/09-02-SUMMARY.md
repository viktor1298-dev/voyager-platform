---
phase: 09-lens-inspired-power-features
plan: 02
subsystem: ui
tags: [react, shadcn, lucide, popover, dialog, action-toolbar, grouped-tabs]

requires:
  - phase: 08-resource-explorer-ux-overhaul
    provides: ExpandableCard, DetailTabs, GroupedTabBar, ResourcePageScaffold component library
provides:
  - ActionToolbar component for right-aligned action buttons in detail panels
  - DeleteConfirmDialog with type-name-to-confirm pattern
  - RestartConfirmDialog with pod count impact display
  - ScaleInput with inline current-to-new replica count
  - PortForwardCopy popover with copyable kubectl port-forward commands
  - Extended GroupedTabBar config with Cluster Ops group, Network Policies, Resource Quotas
  - DetailTabs actions prop for right-aligned toolbar integration
affects: [09-03, 09-04, 09-05, 09-06, 09-07, 09-08, 09-09, 09-10]

tech-stack:
  added: [radix-ui/popover (via shadcn)]
  patterns: [ActionButton interface with variant styling, type-name-to-confirm delete pattern, inline scale input pattern]

key-files:
  created:
    - apps/web/src/components/resource/ActionToolbar.tsx
    - apps/web/src/components/resource/DeleteConfirmDialog.tsx
    - apps/web/src/components/resource/RestartConfirmDialog.tsx
    - apps/web/src/components/resource/ScaleInput.tsx
    - apps/web/src/components/resource/PortForwardCopy.tsx
    - apps/web/src/components/ui/popover.tsx
  modified:
    - apps/web/src/components/clusters/cluster-tabs-config.ts
    - apps/web/src/components/expandable/DetailTabs.tsx

key-decisions:
  - "ActionButton interface includes optional render prop for components like PortForwardCopy that wrap the button in a Popover trigger"
  - "Dialog components use the existing custom Dialog component (not shadcn Dialog) for consistent animation with dialogVariants/overlayVariants"
  - "ScaleInput is an inline component with no dialog wrapper per D-06 tiered confirmation design"

patterns-established:
  - "ActionButton render prop: allows action buttons to be wrapped in custom components (e.g., Popover triggers) while maintaining toolbar layout"
  - "Tiered confirmation: destructive=type-name, restart=single-confirm, scale=inline (no dialog)"

requirements-completed: [LENS-08, LENS-13]

duration: 4min
completed: 2026-03-28
---

# Phase 9 Plan 02: Navigation & Action Components Summary

**Extended GroupedTabBar with Cluster Ops group (Helm/CRDs/RBAC), created ActionToolbar, DeleteConfirmDialog, RestartConfirmDialog, ScaleInput, and PortForwardCopy components**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T21:12:22Z
- **Completed:** 2026-03-28T21:16:59Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extended GroupedTabBar config with 5 new tab entries: Network Policies (Networking), Resource Quotas (Config), Helm/CRDs/RBAC (new Cluster Ops group)
- Created ActionToolbar with variant-styled buttons (default/accent/destructive) and optional render prop for custom wrapping
- Created all confirmation dialog/input components: DeleteConfirmDialog (type-name-to-confirm), RestartConfirmDialog (pod impact count), ScaleInput (inline replica change)
- Created PortForwardCopy with popover showing copyable kubectl port-forward commands per container port
- Added actions prop to DetailTabs for right-aligned toolbar in tab header row

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend GroupedTabBar config and create ActionToolbar with PortForwardCopy** - `88111bc` (feat)
2. **Task 2: Create confirmation dialogs -- Delete, Restart, Scale** - `e18e4e9` (feat)

## Files Created/Modified
- `apps/web/src/components/clusters/cluster-tabs-config.ts` - Added Wrench import, Cluster Ops group, Network Policies, Resource Quotas
- `apps/web/src/components/expandable/DetailTabs.tsx` - Added optional actions prop rendered right-aligned in tab header
- `apps/web/src/components/resource/ActionToolbar.tsx` - Configurable action buttons with variant styling
- `apps/web/src/components/resource/DeleteConfirmDialog.tsx` - GitHub-style type-name-to-confirm delete dialog
- `apps/web/src/components/resource/RestartConfirmDialog.tsx` - Impact-aware restart confirmation with pod count
- `apps/web/src/components/resource/ScaleInput.tsx` - Inline replica count input with current->new display
- `apps/web/src/components/resource/PortForwardCopy.tsx` - Popover with copyable kubectl port-forward commands
- `apps/web/src/components/ui/popover.tsx` - shadcn Popover component (new install)

## Decisions Made
- Used existing custom Dialog component (with dialogVariants/overlayVariants animation) rather than shadcn Dialog for consistency with project patterns
- Added render prop to ActionButton interface to support PortForwardCopy's Popover trigger wrapping without breaking toolbar layout
- ScaleInput is purely inline (no dialog) per D-06 tiered confirmation spec -- destructive actions get the most friction, scale gets the least

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed shadcn Popover component**
- **Found during:** Task 1 (PortForwardCopy requires Popover)
- **Issue:** Popover component was not in the shadcn registry
- **Fix:** Ran `npx shadcn@latest add popover`
- **Files modified:** apps/web/src/components/ui/popover.tsx, apps/web/package.json, pnpm-lock.yaml
- **Verification:** Build and typecheck pass
- **Committed in:** 88111bc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Popover is a standard shadcn component needed for PortForwardCopy. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 action components ready for integration into resource detail panels
- Tab config extended for all new pages (Helm, CRDs, RBAC, Network Policies, Resource Quotas)
- DetailTabs actions prop ready to receive ActionToolbar instances
- Components are standalone and type-safe -- ready for wiring in subsequent plans

---
*Phase: 09-lens-inspired-power-features*
*Completed: 2026-03-28*
