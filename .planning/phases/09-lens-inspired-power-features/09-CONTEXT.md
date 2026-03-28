# Phase 9: Lens-Inspired Power Features - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform Voyager Platform from a read-only K8s dashboard into a full Lens-alternative with interactive operational capabilities. This phase adds 14 features: pod exec terminal, live log streaming, YAML viewer, workload management (restart/scale), Helm releases, events timeline, resource topology map, resource diff, CRD browser, RBAC viewer, network policy visualization, resource quotas dashboard, port-forward command copy, and universal YAML/Diff/Action enhancements to all existing tabs.

**In scope:** All 14 success criteria from ROADMAP.md. Per-resource actions (exec, YAML, diff, restart/scale). Cluster-level features (Helm, CRDs, RBAC, network policies, resource quotas). New visualizations (topology map, events timeline, network policy graph). Enhancements to all existing tabs (YAML tab, Diff tab, action toolbar, live data).

**Out of scope:** Helm upgrade/rollback mutations (read-only first). Actual port forwarding proxy (copy kubectl command only). Dashboard layout customization. AI-powered insights (future phase).

</domain>

<decisions>
## Implementation Decisions

### D-01: Tab Organization — Extend Existing GroupedTabBar
Extend the current GroupedTabBar with one new group and additions to existing groups:
- **Networking group**: Add Network Policies (alongside Services, Ingresses)
- **Config group**: Add Resource Quotas (alongside ConfigMaps, Secrets, Namespaces)
- **NEW "Cluster Ops" group**: Helm, CRDs, RBAC — new group with gear/wrench icon
- **Events tab**: Enhanced with timeline visualization (no new tab, upgrade existing)
- **Per-resource features**: Exec, YAML, Diff, actions live inside ExpandableCard DetailTabs — no new navigation tabs needed

### D-02: Pod Exec Terminal — VS Code-Style Bottom Drawer
- **Presentation**: Bottom drawer panel (like VS Code terminal), slides up from bottom with resizable drag handle
- **Multi-terminal**: Tabbed terminals — each pod exec session gets its own tab. Switch between without losing sessions
- **Trigger**: "Exec" button in pod detail panel action toolbar
- **Tech**: xterm.js for terminal rendering + WebSocket connection to backend → kubectl exec
- **Container selection**: Dropdown to pick container when pod has multiple containers
- **Session lifecycle**: Stays open while navigating between pods. Manual close or disconnect

### D-03: YAML Viewer — Universal DetailTab
- **Every ExpandableCard** gets a "YAML" tab in its detail panel
- **Read-only** syntax-highlighted YAML with copy button
- **Consistent** across all resource types: pods, deployments, services, configmaps — everything
- **Copy**: Copy full YAML to clipboard with one click
- **Implementation**: Fetch raw resource JSON from K8s API, render with syntax highlighting using CSS custom properties for theme support

### D-04: Live Log Streaming — Enhance Existing Logs Tab
- **Upgrade** the Phase 8 LogViewer with SSE-based real-time streaming
- **"Follow" toggle**: When enabled, new log lines stream via SSE (not polling). Auto-scroll to bottom
- **Pause-on-hover**: Auto-scroll freezes while user inspects a log line, resumes on mouse leave
- **Same beautifier**: Phase 8 log formatting (JSON pretty-print, log level badges, timestamp parsing, search) applies to streamed lines
- **No separate tab**: Enhanced existing Logs tab, not a new "Stream" tab

### D-05: Workload Actions — Action Toolbar in Detail Panel
- **Location**: Action buttons in the detail panel header, right-aligned alongside DetailTabs
- **Actions by resource type**:
  - Deployments: Restart, Scale, Delete
  - StatefulSets: Restart, Scale, Delete
  - DaemonSets: Restart, Delete
  - Pods: Exec (opens terminal), Delete, Copy Port-Forward Command
- **Visibility**: Actions only visible when card is expanded (keeps card summary clean)
- **Admin-only**: Actions gated behind `adminProcedure` or `authorizedProcedure` with appropriate permission checks

### D-06: Tiered Confirmation for Destructive Actions
- **Delete**: Type resource name to confirm (GitHub-style). Red-themed dialog.
- **Restart**: Single "Are you sure?" dialog showing impact (e.g., "This will trigger a rolling restart of 3 pods")
- **Scale**: Inline number input with "Apply" button — no dialog. Shows current → new replica count.
- **Rationale**: Match confirmation friction to action severity

### D-07: Helm Releases — Read-Only with Namespace Cards
- **Scope**: Read-only in Phase 9. List, view values, revision history, managed resources. No upgrade/rollback.
- **Page**: New tab under "Cluster Ops" group → `/clusters/[id]/helm`
- **Layout**: ExpandableCard pattern with search/filter. Namespace-grouped if many releases.
- **Card summary**: Release name, chart version, app version, status (Deployed/Failed/Pending), revision number
- **Expanded detail**: DetailTabs with [Info] [Values] [Revisions] [Resources]
  - Values: Syntax-highlighted YAML (read-only), copy button
  - Revisions: Revision history list with timestamps, status
  - Resources: List of K8s resources managed by this release, hyperlinked to their tabs
- **Backend**: New `helm` tRPC router using K8s Helm storage (secrets with label `owner=helm`)

### D-08: Events Timeline — Horizontal Swim Lane Visualization
- **Enhancement**: Upgrade existing Events tab, not a separate page
- **Layout**: Horizontal timeline (left-to-right scrollable). Time axis at top.
- **Swim lanes**: Group by resource type (Pods, Deployments, Nodes, etc.). Toggle lanes on/off.
- **Event dots**: Color-coded by type — Normal (blue/green), Warning (amber), Error (red)
- **Interaction**: Hover dot → popover with full event details. Drag to select time range → zoom in/out.
- **Fallback**: Toggle between timeline view and existing table/card view
- **Data**: Uses existing events tRPC router (live + DB dual source)

### D-09: Resource Topology Map — Differentiator Feature
- **Page**: Enhanced Overview page or dedicated visualization accessible from Overview
- **Tech**: React Flow library (reactflow.dev) — React-native graph rendering
- **Node graph**: Shows relationships: Ingress → Service → Pod → Node. Namespace grouping.
- **Node styling**: Color-coded by health (green=healthy, yellow=warning, red=error). Custom node shapes per resource type.
- **Interaction**: Click any node → navigate to that resource's tab (hyperlink with highlight). Drag to rearrange. Zoom/pan. Minimap.
- **Filter**: Filter by namespace. Search by resource name.
- **CRITICAL**: Every node MUST be clickable and hyperlink to the actual resource. This must be tested for each resource type — verify that clicking opens the correct tab and highlights the correct resource.

### D-10: Network Policy Graph — Flow Visualization
- **Page**: New tab under Networking group → `/clusters/[id]/network-policies`
- **Tech**: React Flow (same engine as topology map — shared components)
- **Layout**: Pods/namespaces as nodes, network policies as directed edges
- **Edge styling**: Green arrows for allow rules, red X for deny rules. Ingress vs egress distinguished by arrow direction.
- **Interaction**: Click a pod → highlight all its policies. Click a policy edge → show rule details.
- **Filter**: By namespace. By policy name.

### D-11: RBAC Viewer — Permission Matrix
- **Page**: New tab under "Cluster Ops" group → `/clusters/[id]/rbac`
- **Layout**: Matrix grid — rows are users/service accounts, columns are resources
- **Cell content**: CRUD letters (C=create, R=read, U=update, D=delete). Color-coded: green=allowed, gray=not.
- **Click cell**: Shows the full binding chain (ClusterRole → ClusterRoleBinding → Subject)
- **Filters**: By namespace, by user/service account name
- **Data**: Aggregate from ClusterRoles, ClusterRoleBindings, Roles, RoleBindings

### D-12: Resource Quotas — Gauge Dashboard
- **Page**: New tab under Config group → `/clusters/[id]/resource-quotas`
- **Layout**: Per-namespace cards showing resource bars (reuse existing ResourceBar component pattern)
- **Metrics**: CPU, Memory, Pods, PVCs — usage vs quota limit
- **Color coding**: Green → Yellow → Red as utilization increases (same thresholds as metric charts)
- **Data**: K8s ResourceQuota API objects

### D-13: CRD Browser — Two-Level Navigation
- **Page**: New tab under "Cluster Ops" group → `/clusters/[id]/crds`
- **Level 1**: List of installed CRDs as ExpandableCards. Card summary: CRD name (group.resource), instance count, scope (Namespaced/Cluster).
- **Level 2**: Expanded CRD shows instances as nested list. Each instance expandable with YAML viewer.
- **Search**: Across CRD names and instance names
- **DetailTabs**: [Schema] [Instances] [YAML] for each CRD

### D-14: Resource Diff — Dual Comparison with Copy
- **Location**: "Diff" DetailTab on every resource (alongside YAML tab)
- **Comparison 1**: Current live state vs `kubectl.kubernetes.io/last-applied-configuration` annotation. Shows what changed since last `kubectl apply`.
- **Comparison 2**: For Helm-managed resources, also offer revision-to-revision diff (compare Helm revision N vs N-1)
- **UI**: Side-by-side diff with syntax highlighting. Changed lines highlighted. Added (green) / Removed (red) / Modified (yellow).
- **Copy**: User can copy values from either side of the diff

### D-15: Port Forward — Copy kubectl Command
- **No actual port forwarding proxy** from the web app
- **"Copy Port-Forward Command" button** on pod detail panel — generates the correct `kubectl port-forward` command
- **Small copy icon** next to the command for one-click clipboard copy
- **Command format**: `kubectl port-forward pod/<pod-name> <localPort>:<containerPort> -n <namespace> --context <context>`

### D-16: Existing Tab Enhancements
All existing resource tabs (from Phase 8) gain:
- **[YAML] tab** in every ExpandableCard detail panel
- **[Diff] tab** in every ExpandableCard detail panel (current vs last-applied)
- **Action toolbar** where applicable (restart/scale/delete for workloads)
- **Live data** — all tabs show real-time data via K8s Watch (Phase 8 SSE infrastructure), matching Lens behavior

### Claude's Discretion
- Graph layout algorithms for topology map and network policy graph (dagre, elk, or custom)
- xterm.js theme and color scheme (should match existing dark/light mode)
- Exact YAML syntax highlighting color tokens (follow existing log syntax color patterns with CSS custom properties)
- Events timeline time range presets and zoom levels
- CRD schema rendering approach (JSON Schema display)
- Whether to show Helm hooks/tests in release details
- Animation details for new drawer/panel components (follow B-style animation constants)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Animation Standards
- `docs/DESIGN.md` — Animation & interaction design source of truth (B-style: Confident & Expressive). Read before ANY UI change.
- `apps/web/src/lib/animation-constants.ts` — Motion v12 timing/easing/variant constants
- **Use `ui-ux-pro-max` and `frontend-design` skills** when planning frontend-heavy plans — the user explicitly requires professional design quality for all UI work in this phase.

### Reference Implementations
- `apps/web/src/app/clusters/[id]/pods/page.tsx` — Gold standard for namespace-grouped card layout
- `apps/web/src/app/clusters/[id]/autoscaling/page.tsx` — Karpenter design (do NOT change)
- `apps/web/src/app/clusters/[id]/logs/page.tsx` — Current logs viewer (to be enhanced with SSE streaming)
- `apps/web/src/app/clusters/[id]/events/page.tsx` — Current events page (to be enhanced with timeline)

### Component Library
- `apps/web/src/components/expandable/` — ExpandableCard, DetailTabs, ResourceBar, ConditionsList, TagPills, DetailRow, DetailGrid
- `apps/web/src/components/logs/` — LogViewer, LogLine, JsonRenderer, LogSearch (Phase 8 log beautifier)
- `apps/web/src/components/resource/` — RelatedResourceLink, SearchFilterBar
- `apps/web/src/components/clusters/GroupedTabBar.tsx` — Tab navigation (needs new "Cluster Ops" group)
- `apps/web/src/components/clusters/cluster-tabs-config.ts` — Tab configuration (needs new entries)

### Backend Routers
- `apps/api/src/routers/index.ts` — Router registry (needs new routers: helm, crds, rbac, networkPolicies, resourceQuotas)
- `apps/api/src/routers/pods.ts` — Pod router (needs exec WebSocket endpoint)
- `apps/api/src/routers/logs.ts` — Logs router (needs SSE streaming procedure)
- `apps/api/src/routers/deployments.ts` — Deployments (needs restart/scale mutations)
- `apps/api/src/routers/statefulsets.ts` — StatefulSets (needs restart/scale mutations)
- `apps/api/src/routers/daemonsets.ts` — DaemonSets (needs restart mutation)

### Real-Time Infrastructure
- `apps/api/src/lib/event-emitter.ts` — VoyagerEventEmitter (pod/deployment/node events)
- `apps/api/src/lib/cluster-watch-manager.ts` — K8s informers for real-time updates
- `apps/api/src/routes/metrics-stream.ts` — SSE endpoint pattern (reference for new log streaming)
- `apps/api/src/lib/cluster-client-pool.ts` — Per-cluster K8s client management

### Phase 8 Context (carry forward)
- `.planning/phases/08-resource-explorer-ux-overhaul/08-CONTEXT.md` — Prior decisions: namespace grouping, ExpandableCard pattern, K8s Watch SSE, cross-resource navigation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ExpandableCard** + **DetailTabs**: Core UI pattern — all new per-resource features (YAML, Diff, Actions) go as DetailTabs
- **ResourceBar**: Reuse for resource quotas gauge bars
- **LogViewer** components: Enhance with SSE follow mode for live streaming
- **SearchFilterBar**: Reuse for Helm, CRDs, RBAC pages
- **RelatedResourceLink**: Reuse for topology map hyperlinks and Helm managed resources
- **react-resizable-panels** (already installed): Use for terminal bottom drawer split
- **GroupedTabBar**: Extend with new group, proven dropdown pattern

### Established Patterns
- **K8s router pattern**: `authorizedProcedure` + `clusterClientPool.getClient()` + `cached()` — follow for all new routers
- **SSE streaming**: Existing metrics-stream route pattern — follow for log streaming
- **K8s Watch**: Phase 8 ResourceWatchManager pattern — extend for new resource types
- **CSS custom properties**: All colors use `--color-*` variables for theme support — follow for YAML syntax, graph nodes
- **handleK8sError**: Standardized error handling — use for all new K8s API calls

### Integration Points
- **cluster-tabs-config.ts**: Add new tabs (Network Policies, Resource Quotas, Helm, CRDs, RBAC)
- **router registry (index.ts)**: Register new tRPC routers (helm, crds, rbac, networkPolicies, resourceQuotas)
- **server.ts**: WebSocket upgrade handler needed for pod exec terminal
- **package.json**: New dependencies: `xterm` + `@xterm/addon-fit` (terminal), `@xyflow/react` (React Flow graphs)

### New Technology Decisions
- **React Flow** (`@xyflow/react`): For topology map and network policy graph. ~45KB gzipped, MIT license.
- **xterm.js** (`@xterm/xterm`): For pod exec terminal. Industry standard web terminal.
- **WebSocket**: Needed for pod exec (bidirectional). First WebSocket in the codebase — everything else uses SSE.

</code_context>

<specifics>
## Specific Ideas

- Resource topology map **MUST** have every node clickable as a hyperlink to the actual resource — user explicitly required this to be tested for each resource type
- Resource diff must allow user to **copy values** from either side of the diff
- Port forwarding = **copy kubectl command only** with small copy icon — no actual proxy. Command format: `kubectl port-forward pod/<name> <port>:<port> -n <ns> --context <ctx>`
- All existing tabs get live data "like Lens" — real-time updates via K8s Watch for every resource type
- User wants professional design quality — **use ui-ux-pro-max and frontend-design skills** for all frontend-heavy plans
- Terminal should feel like VS Code's integrated terminal — familiar to developers, not a custom invention
- Events timeline should support toggling between timeline view and existing table/card view

</specifics>

<deferred>
## Deferred Ideas

- **Helm upgrade/rollback mutations** — Complex (needs chart repo access, value editing, dry-run). Future phase after read-only Helm viewer proves useful.
- **Actual port forwarding proxy** — Requires server-side TCP proxy + security review. Copy kubectl command sufficient for now.
- **AI-powered cluster insights** — Anomaly detection, resource optimization suggestions. Future phase leveraging existing AI service.
- **Resource topology as default Overview** — May replace or augment current Overview page. Evaluate after topology map is built.
- **Real-time graph updates** — Topology map could animate as resources change. Future enhancement after static graph works.

</deferred>

---

*Phase: 09-lens-inspired-power-features*
*Context gathered: 2026-03-28*
