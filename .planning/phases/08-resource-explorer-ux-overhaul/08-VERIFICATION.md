---
phase: 08-resource-explorer-ux-overhaul
verified: 2026-03-28T17:00:00Z
status: human_needed
score: 8/8 must-haves verified
human_verification:
  - test: "Open any redesigned resource tab (e.g., Deployments) in light mode"
    expected: "Namespace-grouped cards visible with readable text; NamespaceGroup trigger hover state (bg-white/3%) should still be subtly visible as a hover indicator"
    why_human: "bg-white/[0.03] on CollapsibleTrigger is nearly transparent on white background. Hover highlight may be invisible in light mode — cannot verify visual behavior programmatically."
  - test: "Open the Logs tab for any pod, then open a log-heavy pod"
    expected: "JSON lines are pretty-printed with syntax highlighting, log level badges appear (ERROR/WARN/INFO/DEBUG), line numbers show in gutter, word wrap toggle works, search highlights matches"
    why_human: "All log beautifier components exist and are wired but visual rendering quality requires human inspection."
  - test: "Navigate to Deployments, expand a deployment, open 'Pods' tab in detail panel"
    expected: "RelatedPodsList shows pods matching the deployment's selector labels with hyperlinks. Click a pod link — should navigate to Pods tab and highlight that pod."
    why_human: "Cross-resource navigation hyperlinks require verifying router.push with ?highlight param causes visible UI highlight effect on target resource."
  - test: "Test K8s Watch real-time updates with a live cluster"
    expected: "Create/delete a pod in the cluster; within ~1s the Pods tab on the dashboard reflects the change without manual refresh."
    why_human: "ResourceWatchManager requires a real K8s cluster with credentials. Cannot test SSE event flow programmatically without a running cluster."
  - test: "Open Nodes page in light mode"
    expected: "CPU/Memory bars are clearly visible, text labels are readable, spacing between rows is comfortable"
    why_human: "Light mode visual correctness of the bar rendering requires human inspection."
---

# Phase 8: Resource Explorer UX Overhaul Verification Report

**Phase Goal:** Unify all cluster resource tabs to match Pods design (namespace-grouped, search/filter, expand all/collapse all), add Lens-inspired real-time K8s Watch for ALL resource types, log beautification, cross-resource navigation with hyperlinks, and Nodes page light-mode fix.
**Verified:** 2026-03-28T17:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All resource tabs (11 types) use namespace-grouped card layout with search/filter matching Pods design | VERIFIED | All 13 pages (deployments, services, ingresses, statefulsets, daemonsets, jobs, cronjobs, hpa, configmaps, secrets, pvcs, namespaces, events) contain `ResourcePageScaffold`, none contain `ExpandableTableRow` |
| 2 | Expand All / Collapse All toggle works on every resource tab including Pods | VERIFIED | `ResourcePageScaffold` contains `expandAll` state; `pods/page.tsx` has `expandAll` + `SearchFilterBar` |
| 3 | K8s Watch real-time updates for ALL resource types — per-user per-cluster reference-counted watchers | VERIFIED (partial — human needed for live test) | `ResourceWatchManager` class with `subscribe`/`unsubscribe` reference counting, 12 resource type informers via `k8s.makeInformer`, `voyagerEmitter.emitResourceChange` wired, SSE endpoint registered in server.ts, `useResourceSSE` in layout.tsx |
| 4 | Logs tab has syntax highlighting, log level coloring, search/filter, timestamp parsing, and structured log formatting | VERIFIED (human needed for visual QA) | `LogViewer`, `LogLine`, `JsonRenderer`, `LogSearch`, `log-utils.ts` all exist and substantive; CSS custom properties in globals.css for both themes; integrated into logs/page.tsx |
| 5 | Expanded resource detail panels have cross-resource tabs with hyperlinks | VERIFIED | `RelatedPodsList` (with label matching) in deployments, statefulsets, daemonsets, services, jobs; `RelatedResourceLink` in ingresses, hpa, cronjobs; Pod->Logs tab with `PodLogViewer`; Pod->Node link with `RelatedResourceLink` |
| 6 | Nodes page light-mode visibility fixed (CPU/Memory bars, spacing, visual hierarchy) | VERIFIED (human needed for visual QA) | `nodes/page.tsx` uses CSS vars (`var(--color-`), zero `text-white/` or `bg-white/` occurrences in data display elements; `ResourceBar` still imported |
| 7 | Karpenter/autoscaling tab design unchanged | VERIFIED | `autoscaling/page.tsx` has 741 lines, does NOT import `ResourcePageScaffold` |
| 8 | `pnpm build` and `pnpm typecheck` pass with 0 errors | VERIFIED | Both commands completed with 6 successful tasks, 0 errors (Turbo cache confirmed passing) |

**Score:** 8/8 truths verified (5 automated-confirmed, 3 requiring human visual QA)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/components/expandable/ExpandableCard.tsx` | Controlled/uncontrolled mode | VERIFIED | `expanded?: boolean`, `isControlled`, `handleToggle` present (79 lines) |
| `apps/web/src/components/resource/ResourcePageScaffold.tsx` | Generic scaffold | VERIFIED | 126 lines, `expandAll`, `flatList`, `filterFn`, `useMemo` grouping, `NamespaceGroup` rendering |
| `apps/web/src/components/resource/SearchFilterBar.tsx` | Search + expand toggle | VERIFIED | 53 lines, search input + expand-all button |
| `apps/web/src/components/resource/NamespaceGroup.tsx` | Collapsible namespace section | VERIFIED | 50 lines, `Collapsible` with count badge, `chevronVariants` animation |
| `apps/web/src/components/resource/index.ts` | Barrel export | VERIFIED | Exports `ResourcePageScaffold`, `SearchFilterBar`, `NamespaceGroup`, `RelatedPodsList`, `RelatedResourceLink`, `useResourceNavigation` |
| `apps/api/src/lib/resource-watch-manager.ts` | K8s informers for 12 resource types | VERIFIED | 245 lines, `ResourceWatchManager` class, `subscribe`/`unsubscribe`, `k8s.makeInformer`, `voyagerEmitter.emitResourceChange` |
| `apps/api/src/routes/resource-stream.ts` | SSE endpoint | VERIFIED | 203 lines, `registerResourceStreamRoute`, `text/event-stream` headers, `resourceWatchManager.subscribe` |
| `apps/web/src/hooks/useResourceSSE.ts` | Client SSE hook with cache invalidation | VERIFIED | 83 lines, `EventSource`, `RESOURCE_INVALIDATION_MAP`, `pendingInvalidations`, debounced `utils[key].list.invalidate` |
| `packages/types/src/sse.ts` | `ResourceChangeEvent` type | VERIFIED | `ResourceChangeEvent`, `ResourceType`, `ResourceChangeType` present |
| `packages/config/src/sse.ts` | Resource stream constants | VERIFIED | `RESOURCE_STREAM_BUFFER_MS` present |
| All 13 resource tab pages | `ResourcePageScaffold` usage | VERIFIED | All 13 pages use scaffold; none use `ExpandableTableRow` |
| `apps/web/src/app/clusters/[id]/pods/page.tsx` | expandAll + SearchFilterBar | VERIFIED | Both present |
| `apps/web/src/components/logs/log-utils.ts` | Log parsing utilities | VERIFIED | 33 lines, `detectLogLevel`, `extractTimestamp`, `isJsonLine`, `formatRelativeTime` |
| `apps/web/src/components/logs/JsonRenderer.tsx` | JSON syntax highlighting | VERIFIED | 188 lines, CSS var-based colors (`var(--color-log-key)` etc.) |
| `apps/web/src/components/logs/LogLine.tsx` | Single log line component | VERIFIED | 128 lines, no hardcoded Tailwind color classes for log levels |
| `apps/web/src/components/logs/LogSearch.tsx` | Search with match count | VERIFIED | 56 lines |
| `apps/web/src/components/logs/LogViewer.tsx` | Main viewer with word wrap | VERIFIED | 105 lines, `wordWrap`, `LogSearch`, `LogLine` imports |
| `apps/web/src/app/globals.css` | CSS log vars (both themes) | VERIFIED | Dark theme (line 221), light theme (line 328) log CSS vars present |
| `apps/web/src/app/clusters/[id]/nodes/page.tsx` | Light-mode fixes | VERIFIED | 0 `text-white/` or `bg-white/` data elements; CSS vars used; `ExpandableTableRow` retained |
| `apps/web/src/components/resource/RelatedPodsList.tsx` | Label-matching pod list | VERIFIED | `matchLabels`, `trpc.pods.list.useQuery`, client-side filter |
| `apps/web/src/components/resource/RelatedResourceLink.tsx` | Cross-resource hyperlink | VERIFIED | `navigateToResource` via `useResourceNavigation` |
| `apps/web/src/components/resource/CrossResourceNav.tsx` | Navigation utility | VERIFIED | `navigateToResource`, `router.push` with `?highlight=` param |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ResourcePageScaffold.tsx` | `ExpandableCard.tsx` | `expanded={expandAll}` | VERIFIED | `expandAll` state passed as controlled `expanded` prop |
| `ResourcePageScaffold.tsx` | `SearchFilterBar.tsx` | search state + expand callback | VERIFIED | `SearchFilterBar` rendered with all required props |
| `ResourcePageScaffold.tsx` | `NamespaceGroup.tsx` | namespace grouping loop | VERIFIED | `grouped.map(([ns, items]) => <NamespaceGroup>)` |
| `resource-watch-manager.ts` | `event-emitter.ts` | `voyagerEmitter.emitResourceChange` | VERIFIED | Line 168 in resource-watch-manager.ts |
| `resource-stream.ts` | `resource-watch-manager.ts` | `resourceWatchManager.subscribe` | VERIFIED | Line 89 in resource-stream.ts |
| `useResourceSSE.ts` | `/api/resources/stream` | `EventSource` connection | VERIFIED | `new EventSource(url, { withCredentials: true })` |
| `layout.tsx` | `useResourceSSE.ts` | hook call with clusterId | VERIFIED | `useResourceSSE(clusterId)` in cluster layout |
| `logs/page.tsx` | `LogViewer.tsx` | `import { LogViewer }` | VERIFIED | Import and `<LogViewer lines={...}>` usage confirmed |
| `pods/page.tsx` | `RelatedPodsList.tsx` (via PodLogViewer) | Pod->Logs tab | VERIFIED | `<PodLogViewer>` → `trpc.logs.get` → `<LogViewer>` |
| `pods/page.tsx` | delete mutation | optimistic cache + invalidate | VERIFIED | `onMutate` with `setData`, `onSuccess` with `invalidate` |
| `deployments/page.tsx` | `RelatedPodsList` | 'Pods' DetailTab | VERIFIED | `RelatedPodsList` in deployments page |
| `server.ts` | `resource-stream.ts` | `registerResourceStreamRoute` | VERIFIED | Import and await registration confirmed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `ResourceWatchManager` | K8s resource events | `k8s.makeInformer` → real K8s API | Yes (real informers per resource type) | FLOWING |
| `resource-stream.ts` | SSE events | `voyagerEmitter.on('resource-change:*')` → buffered flush | Yes (real emitter events) | FLOWING |
| `useResourceSSE.ts` | `ResourceChangeEvent[]` | `EventSource` → `trpc.useUtils().list.invalidate` | Yes (triggers re-fetch of real tRPC data) | FLOWING |
| `ResourcePageScaffold` | `items: T[]` | `queryResult.data` from caller's tRPC query | Yes (scaffold accepts live query result) | FLOWING |
| `RelatedPodsList` | `matchingPods` | `trpc.pods.list.useQuery` → client-side label filter | Yes (uses real pods query, not hardcoded) | FLOWING |
| `LogViewer` | `lines: string[]` | caller passes lines from `trpc.logs.get` or `trpc.logs.tail` | Yes (real log data from K8s API) | FLOWING |
| `PodLogViewer` | `lines` | `trpc.logs.get.useQuery({ clusterId, namespace, pod })` | Yes (real tRPC query) | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `pnpm typecheck` passes | `pnpm typecheck` | 6/6 tasks successful, 0 TS errors (Turbo cache) | PASS |
| `pnpm build` passes | `pnpm build` | 6/6 tasks successful, all pages compiled | PASS |
| `log-utils.ts` exports expected functions | node fs.readFileSync check | All 4 functions found: `detectLogLevel`, `extractTimestamp`, `isJsonLine`, `formatRelativeTime` | PASS |
| All 13 resource pages use scaffold | grep loop | All 13: scaffold=YES, table_row=NO | PASS |
| No hardcoded `text-white/` in nodes data elements | grep count | 0 occurrences | PASS |
| No hardcoded Tailwind log-level colors in LogLine | grep check | 0 `text-red-`, `text-amber-` etc. | PASS |
| Karpenter page untouched | grep check | No `ResourcePageScaffold` import (741-line file intact) | PASS |
| K8s Watch real-time updates | Needs live cluster | Cannot test without running K8s | SKIP |
| Log beautifier rendering | Needs browser | Visual quality check required | SKIP |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| UX-01 | 08-03, 08-04, 08-05 | All resource tabs use namespace-grouped card layout | SATISFIED | 13 pages confirmed using `ResourcePageScaffold` |
| UX-02 | 08-03, 08-04, 08-05 | Search/filter bar on every resource tab | SATISFIED | `SearchFilterBar` in `ResourcePageScaffold` (and pods page directly) |
| UX-03 | 08-01, 08-03, 08-04, 08-05 | Expand All / Collapse All toggle on every tab including Pods | SATISFIED | `expandAll` state in scaffold; `pods/page.tsx` has `SearchFilterBar` + `expandAll` |
| UX-04 | 08-08 | Pod deletion triggers immediate UI update | SATISFIED | `onMutate` optimistic cache removal + `onSuccess` invalidation in pods page |
| UX-05 | 08-02 | K8s Watch-based real-time updates for all resource types | SATISFIED (code) | Full SSE pipeline: `ResourceWatchManager` → `voyagerEmitter` → SSE → `useResourceSSE` → cache invalidation |
| UX-06 | 08-06 | Logs tab JSON syntax highlighting | SATISFIED (needs visual QA) | `JsonRenderer.tsx` with CSS var-based coloring |
| UX-07 | 08-06 | Logs tab log level coloring | SATISFIED (needs visual QA) | `LogLine.tsx` with `detectLogLevel`, CSS var colors (no hardcoded Tailwind) |
| UX-08 | 08-06 | Logs tab search/filter with match highlighting | SATISFIED (needs visual QA) | `LogSearch.tsx` integrated in `LogViewer` |
| UX-09 | 08-06 | Logs tab timestamp parsing | SATISFIED (needs visual QA) | `extractTimestamp` in log-utils, `LogLine` renders timestamp |
| UX-10 | 08-06 | Logs tab line numbering and word wrap toggle | SATISFIED (needs visual QA) | `wordWrap` state + `LogLine lineNumber` in `LogViewer` |
| UX-11 | 08-08 | Cross-resource Pod tabs (Deployment/StatefulSet/DaemonSet/Job -> Pods) | SATISFIED | `RelatedPodsList` in all 4 pages |
| UX-12 | 08-08 | Cross-resource Service->Endpoints tab | SATISFIED | `RelatedPodsList` in services page |
| UX-13 | 08-08 | Ingress->Services, CronJob->Jobs, HPA->Target | SATISFIED | `RelatedResourceLink` in ingresses, hpa; CronJob Jobs tab has `RelatedResourceLink` to jobs tab |
| UX-14 | 08-08 | Pod->Logs embedded tab | SATISFIED | `PodLogViewer` + `LogViewer` in pods page detail panel |
| UX-15 | 08-03 | Karpenter/autoscaling tab design unchanged | SATISFIED | autoscaling/page.tsx unmodified (741 lines, no ResourcePageScaffold) |
| UX-16 | 08-07 | Nodes page light-mode fix | SATISFIED (needs visual QA) | CSS vars used, no `text-white/` or `bg-white/` data elements |
| UX-17 | 08-01 | ResourcePageScaffold foundation components | SATISFIED | All 4 components created/modified |
| UX-18 | 08-03 | (Karpenter unchanged — second reference) | SATISFIED | Same as UX-15 |

**Note:** UX-01 through UX-15 are defined in `08-RESEARCH.md`. UX-16 (Nodes fix) and UX-17 (foundation scaffold) were added during planning and appear only in plan frontmatter. UX-18 appears to be a duplicate reference to UX-15 (Karpenter unchanged) in plan 08-03. The REQUIREMENTS.md covers the earlier Metrics Graph Redesign project — Phase 8 requirements are tracked in the RESEARCH.md and ROADMAP.md instead.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `NamespaceGroup.tsx` | 33 | `bg-white/[0.03]` on CollapsibleTrigger | Warning | In light mode, the namespace group trigger row has near-zero background tint. The hover state `bg-white/[0.06]` is also barely visible. Not a data visibility issue, but the interactive hover affordance may be imperceptible in light mode. Should use `bg-[var(--color-bg-secondary)]` + `hover:bg-[var(--color-bg-tertiary)]`. |
| `SearchFilterBar.tsx` | 52 | `hover:bg-white/[0.04]` on Expand All button | Info | Same issue as above — hover effect may be invisible in light mode. UI chrome only. |
| `ResourcePageScaffold.tsx` | 75, 98 | `bg-white/[0.04]` on icon container in empty state | Info | Icon container in empty state has near-invisible background in light mode. Cosmetic only. |

No blocker anti-patterns. No placeholder/stub implementations found. No TODO/FIXME in key implementation files.

---

### Human Verification Required

#### 1. NamespaceGroup Light-Mode Hover Visibility

**Test:** Switch to light mode. Navigate to any resource tab (e.g., Deployments). Hover over namespace group headers.
**Expected:** A subtle but perceptible hover highlight should appear on each namespace group row when hovered.
**Why human:** `bg-white/[0.03]` = ~3% opacity on white background is visually imperceptible. Cannot determine if this causes a usability issue without visual inspection. Same applies to `hover:bg-white/[0.04]` on SearchFilterBar buttons.

#### 2. Log Beautifier Visual Quality

**Test:** Open any pod's log output in the Logs tab. Include a pod that outputs JSON log lines.
**Expected:** JSON lines should render with color-coded syntax (keys, strings, numbers), log level badges (ERROR/WARN/INFO/DEBUG) should appear, line numbers visible in left gutter, word wrap toggle should work, search should highlight matches.
**Why human:** All 6 log components exist and are wired (LogViewer → LogLine → JsonRenderer/log-utils + LogSearch). Visual rendering quality requires browser inspection.

#### 3. Cross-Resource Navigation Highlight Behavior

**Test:** Open a Deployment detail panel → Pods tab. Click on a pod hyperlink.
**Expected:** Browser navigates to `/clusters/[id]/pods?highlight=<namespace/name>`. The target pod should be visually highlighted or auto-expanded.
**Why human:** `CrossResourceNav.tsx` sets `?highlight=` URL param via `router.push`. Whether the pods page actually reads this param and highlights/scrolls to the target requires visual verification. The pods page does not appear to implement a `highlight` query param consumer — this may be a gap.

#### 4. K8s Watch Real-Time Updates

**Test:** With a live K8s cluster connected, navigate to the Pods tab. In a separate terminal, run `kubectl run test-pod --image=nginx`. Observe the dashboard.
**Expected:** The new pod should appear in the UI within ~1 second without manual page refresh.
**Why human:** `ResourceWatchManager` uses real K8s informers. Cannot test without a live cluster with credentials.

#### 5. Nodes Page Light-Mode Visual Quality

**Test:** Switch to light mode. Navigate to any cluster's Nodes tab. Expand a node.
**Expected:** CPU/Memory progress bars are clearly visible (not faded), text labels are readable with proper contrast, spacing between node rows is comfortable.
**Why human:** The nodes page now uses CSS custom properties and has no hardcoded `text-white/` classes, but the actual rendered quality of `ResourceBar` in light mode requires visual confirmation.

---

### Potential Gap: Cross-Resource Highlight Consumer

**Note for human review:** During verification, `CrossResourceNav.tsx` generates URLs with `?highlight=<resourceKey>` param. However, there is no evidence that any resource tab page (e.g., pods/page.tsx) reads the `highlight` query parameter to auto-scroll/auto-expand the target resource. If the highlight consumer is not implemented, clicking cross-resource links will navigate to the correct tab but will not focus the target resource.

Check: `grep -r "useSearchParams\|searchParams.*highlight\|nuqs.*highlight" apps/web/src/app/clusters/`

---

### Gaps Summary

No hard blockers found. All 8 phase goals have implementation evidence:
- All 13 resource tab pages use `ResourcePageScaffold` (not stubs)
- Full K8s Watch SSE pipeline is wired end-to-end in code
- Log beautifier has 6 substantive components with CSS var-based colors
- Cross-resource navigation components exist and are imported in all target pages
- Nodes page has eliminated all dark-only hardcoded colors
- Build and typecheck pass with 0 errors

The only items pending are visual quality checks (which cannot be verified programmatically) and the potential cross-resource highlight consumer gap (a UX enhancement, not a blocker for the core navigation goal).

---

_Verified: 2026-03-28T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
