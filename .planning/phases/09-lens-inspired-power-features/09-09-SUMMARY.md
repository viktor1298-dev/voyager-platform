---
phase: 09-lens-inspired-power-features
plan: 09
subsystem: ui
tags: [react-flow, dagre, topology, network-policy, graph-visualization, xyflow]

requires:
  - phase: 09-01
    provides: "Phase 9 foundation, GroupedTabBar, cluster-tabs-config"
  - phase: 09-08
    provides: "Networking tab group structure"
provides:
  - "Resource topology map with Ingress->Service->Deployment->Pod->Node graph"
  - "Network policy graph with allow/deny edge visualization"
  - "Network policies tRPC router and page"
  - "React Flow + dagre pattern for graph visualization"
affects: [ui, api, resource-explorer]

tech-stack:
  added: ["@xyflow/react", "@dagrejs/dagre"]
  patterns: ["React Flow graph with dagre auto-layout", "Custom node/edge types defined outside component"]

key-files:
  created:
    - "apps/api/src/routers/topology.ts"
    - "apps/api/src/routers/network-policies.ts"
    - "apps/web/src/components/topology/TopologyMap.tsx"
    - "apps/web/src/components/topology/TopologyNode.tsx"
    - "apps/web/src/components/topology/TopologyEdge.tsx"
    - "apps/web/src/components/network/NetworkPolicyGraph.tsx"
    - "apps/web/src/components/network/NetworkPolicyNode.tsx"
    - "apps/web/src/components/network/NetworkPolicyEdge.tsx"
    - "apps/web/src/app/clusters/[id]/network-policies/page.tsx"
  modified:
    - "apps/api/src/routers/index.ts"
    - "apps/api/src/lib/cache-keys.ts"
    - "apps/web/src/app/clusters/[id]/page.tsx"
    - "apps/web/src/components/clusters/cluster-tabs-config.ts"
    - "apps/web/package.json"

key-decisions:
  - "Installed @xyflow/react + @dagrejs/dagre for graph visualization instead of custom SVG"
  - "nodeTypes/edgeTypes defined as module-level constants (React Flow Pitfall 4)"
  - "Topology shows individual pods below 200 nodes, groups by deployment above"
  - "Network policies router added as deviation (missing from prior plans)"
  - "K8s client uses _from for ingress rules (JS reserved keyword)"

patterns-established:
  - "React Flow graph pattern: dagre layout, custom node/edge types outside component, fitView"
  - "Graph data interface: extends Record<string, unknown> for React Flow v12 compatibility"
  - "Network policy visualization: allow=solid green, deny=dashed red, pod click highlights affected edges"

requirements-completed: [LENS-11]

duration: 10min
completed: 2026-03-28
---

# Phase 9 Plan 09: Resource Topology Map and Network Policy Graph Summary

**Interactive React Flow graphs for cluster resource topology (Ingress->Service->Deployment->Pod->Node) and network policy visualization (allow/deny flows) with dagre auto-layout**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-28T21:49:40Z
- **Completed:** 2026-03-28T22:00:04Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Resource topology map renders cluster resources as a directed graph with automatic dagre layout, namespace filtering, search, minimap, and zoom/pan controls
- Every topology node is clickable and navigates to the corresponding resource tab with highlight parameter
- Network policy graph shows pods/namespaces as nodes with allow (solid green) and deny (dashed red) edges
- Network policies page with Graph/List toggle added to Networking tab group

## Task Commits

Each task was committed atomically:

1. **Task 1: Create topology backend router and TopologyMap frontend component** - `77e570d` (feat)
2. **Task 2: Create NetworkPolicyGraph and integrate with Network Policies page** - `3afd8c8` (feat)

## Files Created/Modified
- `apps/api/src/routers/topology.ts` - tRPC router aggregating K8s resources into graph nodes/edges with relationship mapping
- `apps/api/src/routers/network-policies.ts` - tRPC router for K8s NetworkPolicy resources
- `apps/web/src/components/topology/TopologyMap.tsx` - React Flow topology graph with dagre layout, filters, minimap
- `apps/web/src/components/topology/TopologyNode.tsx` - Custom node with type-specific shapes and click-to-navigate
- `apps/web/src/components/topology/TopologyEdge.tsx` - Bezier edge with arrow markers
- `apps/web/src/components/network/NetworkPolicyGraph.tsx` - React Flow network policy visualization
- `apps/web/src/components/network/NetworkPolicyNode.tsx` - Pod/namespace/external node types
- `apps/web/src/components/network/NetworkPolicyEdge.tsx` - Allow (solid green) / deny (dashed red) edge styles
- `apps/web/src/app/clusters/[id]/network-policies/page.tsx` - Network policies page with Graph/List toggle
- `apps/api/src/routers/index.ts` - Registered topology and networkPolicies routers
- `apps/api/src/lib/cache-keys.ts` - Added k8sTopology and k8sNetworkPolicies cache keys
- `apps/web/src/app/clusters/[id]/page.tsx` - Added TopologyMap to Overview page
- `apps/web/src/components/clusters/cluster-tabs-config.ts` - Added Network Policies to Networking group
- `apps/web/package.json` - Added @xyflow/react and @dagrejs/dagre dependencies

## Decisions Made
- Installed @xyflow/react (v12) + @dagrejs/dagre (v3) for professional graph visualization instead of custom SVG
- nodeTypes/edgeTypes defined as module-level constants to avoid React Flow re-render issues (Pitfall 4 from plan)
- Topology graph limits to 200 nodes total -- above that, pods are grouped by deployment with count badges
- Data interfaces extend Record<string, unknown> for React Flow v12 TypeScript compatibility
- K8s client V1NetworkPolicyIngressRule uses `_from` property (JavaScript reserved word `from` is prefixed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created missing networkPolicies tRPC router**
- **Found during:** Task 2
- **Issue:** Plan referenced `trpc.networkPolicies.list.useQuery` but no networkPolicies router existed
- **Fix:** Created `apps/api/src/routers/network-policies.ts` with list procedure, registered in index.ts, added cache key
- **Files modified:** apps/api/src/routers/network-policies.ts, apps/api/src/routers/index.ts, apps/api/src/lib/cache-keys.ts
- **Verification:** pnpm build passes
- **Committed in:** 3afd8c8 (Task 2 commit)

**2. [Rule 3 - Blocking] Created missing network-policies page**
- **Found during:** Task 2
- **Issue:** Plan referenced "existing ExpandableCard list from Plan 08" but no network-policies page existed
- **Fix:** Created full page with list view and Graph/List toggle, added to GroupedTabBar Networking group
- **Files modified:** apps/web/src/app/clusters/[id]/network-policies/page.tsx, apps/web/src/components/clusters/cluster-tabs-config.ts
- **Verification:** pnpm build shows /clusters/[id]/network-policies route
- **Committed in:** 3afd8c8 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed K8s _from property name**
- **Found during:** Task 2
- **Issue:** V1NetworkPolicyIngressRule uses `_from` not `from` (JS reserved word)
- **Fix:** Changed `rule.from` to `rule._from` in network-policies router
- **Files modified:** apps/api/src/routers/network-policies.ts
- **Verification:** pnpm build passes
- **Committed in:** 3afd8c8 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. Network policies router and page were prerequisites the plan assumed existed from Plan 08.

## Issues Encountered
None - build and typecheck pass cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both graph visualization components are complete and integrated
- React Flow + dagre pattern established for any future graph features
- Network policies now have full CRUD-ready router for future enhancements

---
*Phase: 09-lens-inspired-power-features*
*Completed: 2026-03-28*

## Self-Check: PASSED
- All 9 created files verified on disk
- Both task commits (77e570d, 3afd8c8) found in git log
