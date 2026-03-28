---
phase: 08-resource-explorer-ux-overhaul
plan: 07
subsystem: ui
tags: [tailwind, css-custom-properties, light-mode, theme, nodes, table]

requires:
  - phase: 08-resource-explorer-ux-overhaul
    provides: Nodes page with ExpandableTableRow, ResourceBar, and expandable detail panels

provides:
  - Nodes page fully usable in light mode with theme-aware CSS custom properties
  - Improved table spacing and visual hierarchy for both themes

affects: [resource-explorer-ux-overhaul, visual-qa]

tech-stack:
  added: []
  patterns: [CSS custom property theming for all colors, text-shadow with var() for bar label readability]

key-files:
  created: []
  modified:
    - apps/web/src/app/clusters/[id]/nodes/page.tsx

key-decisions:
  - "Used text-shadow with var(--color-bg-card) instead of rgba drop-shadow for theme-aware bar label readability"
  - "Replaced all bg-white/[X] with var(--color-track) for consistent theme-aware backgrounds"

patterns-established:
  - "InlineBar text readability: use [text-shadow:0_0_Xpx_var(--color-bg-card)] for percentage labels over colored bars"

requirements-completed: [UX-16]

duration: 4min
completed: 2026-03-28
---

# Phase 08 Plan 07: Nodes Page Light-Mode Fix Summary

**Nodes page light-mode visibility fix: replaced all hardcoded white/dark-only colors with CSS custom properties, improved table spacing and visual hierarchy**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T18:08:59Z
- **Completed:** 2026-03-28T18:13:01Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Eliminated all `bg-white/[X]` and `text-white/[X]` classes from the nodes page, replacing with CSS custom properties that work in both themes
- Fixed InlineBar percentage text readability by switching from rgba black drop-shadow to theme-aware text-shadow using var(--color-bg-card)
- Improved table spacing: header and body rows increased from py-2.5 to py-3, header border made full opacity for clearer separation
- Fixed taint effect badge colors from hardcoded amber to theme-aware var(--color-status-warning)
- DB fallback row hover changed from invisible `bg-white/[0.02]` to visible `var(--color-bg-card-hover)` with smooth transition

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Nodes page light-mode visibility, spacing, and visual hierarchy** - `0681c7e` (feat)

## Files Created/Modified
- `apps/web/src/app/clusters/[id]/nodes/page.tsx` - Fixed all light-mode visibility issues: bar colors, text shadows, spacing, hover states, taint badges, empty state backgrounds

## Decisions Made
- Used `[text-shadow:0_0_3px_var(--color-bg-card),0_0_6px_var(--color-bg-card)]` for InlineBar percentage label readability -- creates a halo effect using the card background color, which adapts to both dark (#14141f) and light (#ffffff) themes
- Replaced `bg-white/[0.03]` taint container with `bg-[var(--color-track)]` which resolves to rgba(255,255,255,0.08) in dark and rgba(0,0,0,0.08) in light

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing typecheck errors in `@voyager/api` package (missing `ResourceChangeEvent` type exports from `@voyager/types`) -- unrelated to this plan's changes. Web build passes cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Nodes page is fully light-mode compatible with zero hardcoded dark-only colors
- All visual elements use CSS custom properties from globals.css theme definitions
- Page structure unchanged -- still table layout with ExpandableTableRow, ready for further QA validation

---
*Phase: 08-resource-explorer-ux-overhaul*
*Completed: 2026-03-28*
