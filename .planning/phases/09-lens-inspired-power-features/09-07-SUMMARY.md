---
phase: 09-lens-inspired-power-features
plan: 07
subsystem: api, ui
tags: [helm, crds, kubernetes, tRPC, expandable-cards, grouped-tab-bar]

requires:
  - phase: 09-01
    provides: ResourcePageScaffold, ExpandableCard, SearchFilterBar patterns
  - phase: 09-02
    provides: DetailTabs, DetailGrid expandable component library

provides:
  - Helm releases tRPC router with gzip+base64 decode pipeline (list/get/revisions)
  - CRD browser tRPC router with ApiextensionsV1Api and CustomObjectsApi (list/instances/instanceYaml)
  - Helm releases page at /clusters/[id]/helm
  - CRD browser page at /clusters/[id]/crds
  - Cluster Ops group in GroupedTabBar

affects: [cluster-detail, grouped-tab-bar, router-registry]

tech-stack:
  added: [node:zlib gunzipSync for Helm decode]
  patterns: [helm-secret-decode, crd-custom-objects-api, two-level-navigation]

key-files:
  created:
    - apps/api/src/routers/helm.ts
    - apps/api/src/routers/crds.ts
    - apps/web/src/app/clusters/[id]/helm/page.tsx
    - apps/web/src/app/clusters/[id]/crds/page.tsx
    - apps/web/src/components/helm/HelmReleaseDetail.tsx
    - apps/web/src/components/crds/CrdBrowser.tsx
    - apps/web/src/components/crds/CrdInstanceList.tsx
  modified:
    - apps/api/src/routers/index.ts
    - apps/api/src/lib/cache-keys.ts
    - apps/web/src/components/clusters/cluster-tabs-config.ts

key-decisions:
  - "JSON.stringify for Helm values display instead of adding yaml dependency (avoids new dep, values are JSON objects)"
  - "listClusterCustomObject for both Namespaced and Cluster scope CRDs (covers all namespaces without namespace enumeration)"
  - "Decode Helm release in list view for accurate chart metadata (labels alone lack chart name/version)"

patterns-established:
  - "Helm secret decode: base64 -> gunzip -> JSON parse pipeline for release data"
  - "CRD two-level navigation: CRD list expandable cards -> instance list expandable cards -> YAML viewer"
  - "Cluster Ops tab group for non-workload K8s management features"

requirements-completed: [LENS-05, LENS-09]

duration: 6min
completed: 2026-03-28
---

# Phase 09 Plan 07: Helm Releases & CRD Browser Summary

**Helm releases viewer with gzip+base64 decode pipeline and CRD browser with two-level navigation, both accessible from new Cluster Ops tab group**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T21:36:48Z
- **Completed:** 2026-03-28T21:43:44Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Helm router decodes release secrets (base64+gzip) with list/get/revisions procedures and 30s cache
- CRD router lists definitions via ApiextensionsV1Api and instances via CustomObjectsApi with YAML fetch
- Helm page with searchable expandable cards, 4-tab detail (Info, Values, Revisions, Resources with hyperlinks)
- CRD browser with two-level navigation: CRD list -> instance list -> JSON/YAML viewer
- New "Cluster Ops" group added to GroupedTabBar with Helm and CRDs tabs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Helm and CRDs backend routers** - `9c594b1` (feat)
2. **Task 2: Create Helm releases and CRD browser frontend pages** - `9d6922f` (feat)

## Files Created/Modified
- `apps/api/src/routers/helm.ts` - Helm releases tRPC router with gzip+base64 decode, list/get/revisions procedures
- `apps/api/src/routers/crds.ts` - CRD browser tRPC router with list/instances/instanceYaml via CustomObjectsApi
- `apps/api/src/routers/index.ts` - Registered helmRouter and crdsRouter
- `apps/api/src/lib/cache-keys.ts` - Added k8sHelmReleases, k8sHelmRelease, k8sHelmRevisions, k8sCrds, k8sCrdInstances keys
- `apps/web/src/app/clusters/[id]/helm/page.tsx` - Helm releases page with search, expandable cards, status badges
- `apps/web/src/app/clusters/[id]/crds/page.tsx` - CRD browser page
- `apps/web/src/components/helm/HelmReleaseDetail.tsx` - Detail with Info, Values (JSON viewer), Revisions, Resources tabs
- `apps/web/src/components/crds/CrdBrowser.tsx` - CRD list with search, scope badges, expandable cards
- `apps/web/src/components/crds/CrdInstanceList.tsx` - Instance list with YAML viewer per instance
- `apps/web/src/components/clusters/cluster-tabs-config.ts` - Added Cluster Ops group with Helm and CRDs

## Decisions Made
- Used JSON.stringify for Helm values display instead of adding a yaml npm dependency — values are JSON objects and JSON display is clear and functional
- Used listClusterCustomObject for both Namespaced and Cluster scope CRDs — this lists across all namespaces without namespace enumeration
- Decode full Helm release in list view (not just labels) because labels lack chart name/version metadata

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Helm and CRD pages are fully functional and accessible from the Cluster Ops tab group
- Both use existing patterns (ExpandableCard, DetailTabs, SearchFilterBar) for consistent UX
- Ready for visual QA and any additional Cluster Ops features

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (9c594b1, 9d6922f) verified in git log.

---
*Phase: 09-lens-inspired-power-features*
*Completed: 2026-03-28*
