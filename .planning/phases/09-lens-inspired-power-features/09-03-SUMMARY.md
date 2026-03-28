---
phase: 09-lens-inspired-power-features
plan: 03
subsystem: ui
tags: [diff-viewer, yaml, react-diff-viewer-continued, resource-detail, detail-tabs]

requires:
  - phase: 09-lens-inspired-power-features
    provides: YamlViewer component, universal YAML tRPC router, CSS diff tokens, react-diff-viewer-continued package
  - phase: 08-resource-explorer-ux-overhaul
    provides: ExpandableCard, DetailTabs, ResourcePageScaffold for all 13 resource pages
provides:
  - ResourceDiff component for side-by-side YAML diff with theme-aware styling
  - YAML and Diff tabs in all 13 resource page ExpandableCard detail panels
  - Barrel exports for YamlViewer and ResourceDiff from @/components/resource
affects: [09-07]

tech-stack:
  added: []
  patterns: [ResourceDiff with annotation extraction, cleanResourceForDiff helper, clusterId prop threading for expanded details]

key-files:
  created:
    - apps/web/src/components/resource/ResourceDiff.tsx
  modified:
    - apps/web/src/components/resource/index.ts
    - apps/web/src/app/clusters/[id]/pods/page.tsx
    - apps/web/src/app/clusters/[id]/deployments/page.tsx
    - apps/web/src/app/clusters/[id]/services/page.tsx
    - apps/web/src/app/clusters/[id]/statefulsets/page.tsx
    - apps/web/src/app/clusters/[id]/daemonsets/page.tsx
    - apps/web/src/app/clusters/[id]/jobs/page.tsx
    - apps/web/src/app/clusters/[id]/cronjobs/page.tsx
    - apps/web/src/app/clusters/[id]/hpa/page.tsx
    - apps/web/src/app/clusters/[id]/configmaps/page.tsx
    - apps/web/src/app/clusters/[id]/secrets/page.tsx
    - apps/web/src/app/clusters/[id]/pvcs/page.tsx
    - apps/web/src/app/clusters/[id]/ingresses/page.tsx
    - apps/web/src/app/clusters/[id]/namespaces/page.tsx

key-decisions:
  - "cleanResourceForDiff strips managedFields, uid, resourceVersion, generation, creationTimestamp, status for meaningful diffs"
  - "ResourceDiff removes last-applied-configuration annotation from current side to avoid self-referential noise in diff"
  - "CronJobs, HPA, ConfigMaps, Secrets, PVCs, Ingresses, Namespaces expanded detail components gained clusterId prop for YAML/Diff support"

patterns-established:
  - "ResourceDiff extracts kubectl.kubernetes.io/last-applied-configuration, parses JSON, converts both sides to YAML, renders with react-diff-viewer-continued"
  - "YAML and Diff tabs appended at end of existing tabs arrays, preserving all original content"

requirements-completed: [LENS-07]

duration: 11min
completed: 2026-03-28
---

# Phase 9 Plan 03: YAML/Diff Tabs Summary

**ResourceDiff component with side-by-side YAML diff viewer, integrated as YAML + Diff tabs across all 13 resource detail panels**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-28T21:21:34Z
- **Completed:** 2026-03-28T21:32:37Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Created ResourceDiff component with side-by-side diff viewer using react-diff-viewer-continued, extracting kubectl.kubernetes.io/last-applied-configuration annotation and rendering theme-aware color-coded diffs
- Added YAML and Diff tabs to all 13 resource pages (pods, deployments, services, statefulsets, daemonsets, jobs, cronjobs, hpa, configmaps, secrets, pvcs, ingresses, namespaces) with all existing tabs preserved
- Added YamlViewer and ResourceDiff to the resource barrel exports for clean import paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ResourceDiff component** - `34131f5` (feat)
2. **Task 2: Add YAML and Diff tabs to all 13 resource pages** - `ce87fd4` (feat)

## Files Created/Modified
- `apps/web/src/components/resource/ResourceDiff.tsx` - Side-by-side diff viewer: fetches resource, extracts last-applied annotation, strips noise fields, renders with react-diff-viewer-continued split view
- `apps/web/src/components/resource/index.ts` - Added YamlViewer and ResourceDiff barrel exports
- `apps/web/src/app/clusters/[id]/pods/page.tsx` - Added YAML + Diff tabs after Logs tab
- `apps/web/src/app/clusters/[id]/deployments/page.tsx` - Added YAML + Diff tabs after Conditions tab
- `apps/web/src/app/clusters/[id]/services/page.tsx` - Added YAML + Diff tabs after Config tab
- `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` - Added YAML + Diff tabs after Conditions tab
- `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` - Added YAML + Diff tabs after Conditions tab
- `apps/web/src/app/clusters/[id]/jobs/page.tsx` - Added YAML + Diff tabs after Conditions tab
- `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` - Added clusterId prop + YAML + Diff tabs
- `apps/web/src/app/clusters/[id]/hpa/page.tsx` - Added clusterId prop + YAML + Diff tabs
- `apps/web/src/app/clusters/[id]/configmaps/page.tsx` - Added clusterId prop + YAML + Diff tabs
- `apps/web/src/app/clusters/[id]/secrets/page.tsx` - Added clusterId prop + YAML + Diff tabs
- `apps/web/src/app/clusters/[id]/pvcs/page.tsx` - Added clusterId prop + YAML + Diff tabs
- `apps/web/src/app/clusters/[id]/ingresses/page.tsx` - Added clusterId prop + YAML + Diff tabs
- `apps/web/src/app/clusters/[id]/namespaces/page.tsx` - Added clusterId prop + YAML + Diff tabs

## Decisions Made
- ResourceDiff strips managedFields, uid, resourceVersion, generation, creationTimestamp, status, and selfLink from both sides of the diff for meaningful comparison (these fields always differ and add noise)
- The last-applied-configuration annotation itself is removed from the "current" side to prevent self-referential noise in the diff output
- Seven expanded detail components (CronJobs, HPA, ConfigMaps, Secrets, PVCs, Ingresses, Namespaces) gained a `clusterId` prop to support the new tabs -- previously they didn't need it since they had no cluster-aware child components

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added clusterId prop threading to 7 expanded detail components**
- **Found during:** Task 2 (adding tabs to resource pages)
- **Issue:** CronJobExpandedDetail, HPAExpandedDetail, ConfigMapExpandedDetail, SecretExpandedDetail, PVCExpandedDetail, IngressExpandedDetail, NamespaceExpandedDetail did not receive `clusterId` as a prop, which is required by YamlViewer and ResourceDiff
- **Fix:** Added `clusterId: string` to each function signature and passed `resolvedId` from the parent renderDetail callback
- **Files modified:** All 7 affected page.tsx files
- **Verification:** pnpm typecheck and pnpm build pass with 0 errors
- **Committed in:** ce87fd4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** Prop threading was necessary to make YAML/Diff tabs functional. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 13 resource pages now have YAML and Diff tabs in their expanded detail panels
- ResourceDiff component handles all edge cases: missing annotation, no diff detected, Helm-managed resources
- Ready for Plan 07 (Helm revision diff) to wire the Helm revision comparison placeholder

## Self-Check: PASSED

All created files verified on disk. All task commit hashes verified in git log.

---
*Phase: 09-lens-inspired-power-features*
*Completed: 2026-03-28*
