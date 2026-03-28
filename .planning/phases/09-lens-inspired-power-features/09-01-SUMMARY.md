---
phase: 09-lens-inspired-power-features
plan: 01
subsystem: ui, api
tags: [yaml, xterm, react-flow, dagre, diff-viewer, websocket, css-tokens, animation]

requires:
  - phase: 08-resource-explorer-ux-overhaul
    provides: ExpandableCard, DetailTabs, ResourcePageScaffold, GroupedTabBar, K8s Watch SSE
provides:
  - 8 new npm dependencies (7 frontend + 1 backend) for all Phase 9 features
  - 30+ CSS custom properties for terminal, diff, YAML, graph, timeline, Helm, RBAC, network policy
  - 4 new animation variants (drawerSlideUp, graphNode, swimLane, matrixCell)
  - Universal YAML tRPC router serving 16 K8s resource types
  - YamlViewer component with syntax highlighting, copy, loading/error states
affects: [09-02, 09-03, 09-04, 09-05, 09-06, 09-07, 09-08, 09-09, 09-10]

tech-stack:
  added: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links", "@xyflow/react", "@dagrejs/dagre", "react-diff-viewer-continued", "yaml", "@fastify/websocket"]
  patterns: [YAML tokenizer with CSS custom properties, universal K8s resource fetcher pattern]

key-files:
  created:
    - apps/api/src/routers/yaml.ts
    - apps/web/src/components/resource/YamlViewer.tsx
  modified:
    - apps/web/src/app/globals.css
    - apps/web/src/lib/animation-constants.ts
    - apps/api/src/routers/index.ts
    - apps/api/src/lib/cache-keys.ts
    - apps/web/next.config.ts
    - apps/web/package.json
    - apps/api/package.json
    - pnpm-lock.yaml

key-decisions:
  - "YAML tokenizer uses CSS custom properties (--color-yaml-*) aliased to existing --color-log-* tokens for theme consistency"
  - "YamlViewer accepts resourceType as string prop with internal cast to enum type for flexibility across all resource detail panels"
  - "Universal YAML router uses RESOURCE_API_MAP switch pattern with exhaustive check for type safety"

patterns-established:
  - "YAML CSS token aliases: --color-yaml-key maps to --color-log-key (reuse existing syntax colors)"
  - "Universal K8s resource fetcher: single router handles 16 resource types via switch dispatch"

requirements-completed: [LENS-03, LENS-14]

duration: 5min
completed: 2026-03-28
---

# Phase 9 Plan 01: Foundation Summary

**Phase 9 shared foundation: 8 npm packages, 30+ CSS color tokens, 4 animation variants, universal YAML viewer with syntax highlighting and K8s resource fetcher**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T21:12:06Z
- **Completed:** 2026-03-28T21:17:09Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Installed all Phase 9 npm dependencies (xterm.js, React Flow, dagre, diff viewer, yaml, Fastify WebSocket)
- Added 30+ CSS custom properties for terminal, diff, graph, network policy, RBAC, timeline, Helm, and YAML in both dark and light themes
- Created universal YAML tRPC router serving raw K8s resource JSON for 16 resource types with caching and error handling
- Created YamlViewer component with line-numbered syntax-highlighted YAML, copy-to-clipboard, loading skeleton, and error state with retry

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, add CSS tokens and animation variants** - `8ea2cca` (feat)
2. **Task 2: Create YamlViewer component and universal YAML tRPC router** - `de4c83c` (feat)

## Files Created/Modified
- `apps/api/src/routers/yaml.ts` - Universal K8s resource YAML fetcher tRPC router (16 resource types)
- `apps/web/src/components/resource/YamlViewer.tsx` - Syntax-highlighted YAML viewer with copy, loading, error states
- `apps/web/src/app/globals.css` - Phase 9 CSS custom properties (terminal, diff, graph, timeline, Helm, RBAC, network policy, YAML) in both themes
- `apps/web/src/lib/animation-constants.ts` - 4 new animation variants (drawerSlideUp, graphNode, swimLane, matrixCell)
- `apps/api/src/routers/index.ts` - Registered yamlRouter
- `apps/api/src/lib/cache-keys.ts` - Added k8sYaml cache key builder
- `apps/web/next.config.ts` - Added @xyflow/react to optimizePackageImports
- `apps/web/package.json` - 7 new frontend dependencies
- `apps/api/package.json` - 1 new backend dependency (@fastify/websocket)
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- YAML syntax highlighting reuses existing --color-log-* tokens via CSS aliases (--color-yaml-key: var(--color-log-key)) for visual consistency with log viewer
- YamlViewer accepts resourceType as generic string prop with internal cast to the tRPC enum type, enabling flexible usage from any resource detail panel
- Universal YAML router uses exhaustive switch pattern with TypeScript never check for compile-time safety when adding new resource types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript enum type mismatch in YamlViewer**
- **Found during:** Task 2 (YamlViewer component)
- **Issue:** resourceType prop typed as `string` but tRPC query expects the specific enum union type, causing TS2769 error
- **Fix:** Added YAML_RESOURCE_TYPES const and YamlResourceType type locally, cast resourceType prop in the useQuery call
- **Files modified:** apps/web/src/components/resource/YamlViewer.tsx
- **Verification:** pnpm typecheck passes with 0 errors
- **Committed in:** de4c83c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type fix necessary for build. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All npm packages installed for terminal, graph visualization, diff viewer, YAML processing, and WebSocket support
- CSS tokens ready for every Phase 9 feature category
- Animation variants ready for drawer, graph, timeline, and RBAC matrix components
- YamlViewer component ready to be added as a DetailTab in all existing ExpandableCard detail panels
- Universal YAML router ready to serve any K8s resource type

## Self-Check: PASSED

All created files verified on disk. All task commit hashes verified in git log.

---
*Phase: 09-lens-inspired-power-features*
*Completed: 2026-03-28*
