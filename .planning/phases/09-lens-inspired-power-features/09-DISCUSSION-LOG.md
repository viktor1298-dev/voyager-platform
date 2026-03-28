# Phase 9: Lens-Inspired Power Features - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 09-lens-inspired-power-features
**Areas discussed:** Feature Organization & Tab Architecture, Terminal & Live Interaction UX, Workload Actions & Safety Design, Advanced Visualizations

---

## Feature Organization & Tab Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing groups | Networking: + Network Policies. Config: + Resource Quotas. New 'Cluster Ops' group: Helm, CRDs, RBAC. | ✓ |
| Two-tier nav with Operations section | Keep GroupedTabBar for resources. Add second row for operational tools. | |
| Command palette + contextual | No new tabs. Helm/RBAC/CRDs accessible via Cmd+K and contextual links. | |
| Lens-style tree sidebar | Replace GroupedTabBar with collapsible tree sidebar inside cluster view. | |

**User's choice:** Extend existing groups — minimal disruption, familiar structure
**Notes:** None

---

## Pod Exec Terminal UX

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom drawer (VS Code style) | Terminal slides up from bottom as resizable panel. | ✓ |
| Side panel (split view) | Terminal opens as right-side panel. | |
| Full-page overlay | Terminal takes over entire content area. | |
| Inline in detail panel | Terminal as a DetailTab inside ExpandableCard. | |

**User's choice:** Bottom drawer (VS Code style)
**Notes:** None

## Multi-Terminal Support

| Option | Description | Selected |
|--------|-------------|----------|
| Tabbed terminals | Multiple terminal tabs in drawer. Switch between sessions. | ✓ |
| Single terminal only | One terminal at a time. | |
| Multi-pane split | Bottom drawer split into 2-3 side-by-side terminals. | |

**User's choice:** Tabbed terminals
**Notes:** None

## YAML Viewer

| Option | Description | Selected |
|--------|-------------|----------|
| DetailTab 'YAML' on every resource | Every ExpandableCard gets a YAML tab. Read-only, copy button. | ✓ |
| Slide-over panel | YAML opens as right-side slide-over drawer. | |
| Full-page code view | Navigate to dedicated YAML page with Monaco-style editor. | |

**User's choice:** DetailTab 'YAML' on every resource
**Notes:** None

## Live Log Streaming

| Option | Description | Selected |
|--------|-------------|----------|
| Enhance existing Logs tab with SSE streaming | Add Follow toggle, SSE streaming, auto-scroll. Same beautifier. | ✓ |
| Separate 'Stream' tab alongside Logs | New tab for real-time, keep Logs for historical. | |
| Bottom drawer like terminal | Live logs in same bottom drawer as terminal. | |

**User's choice:** Enhance existing Logs tab with SSE streaming
**Notes:** None

---

## Workload Actions UX

| Option | Description | Selected |
|--------|-------------|----------|
| Action toolbar in detail panel | Icon buttons in detail panel header: Restart, Scale, Delete. | ✓ |
| Kebab menu (⋮) on card summary | Three-dot menu on card summary row. | |
| Hover-reveal action icons | Action icons appear on hover over card. | |
| Command palette only (⌘K) | All actions via command palette. No visible buttons. | |

**User's choice:** Action toolbar in detail panel
**Notes:** None

## Confirmation Safety Level

| Option | Description | Selected |
|--------|-------------|----------|
| Tiered confirmation | Delete=type name, Restart=dialog, Scale=inline apply. | ✓ |
| Confirm everything | Every action gets a confirmation dialog. | |
| Trust the user — minimal confirmations | Only delete gets confirmation. Restart/scale immediate with undo toast. | |

**User's choice:** Tiered confirmation
**Notes:** None

## Helm Release Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only first, mutations later | List, view values, revision history. No upgrade/rollback. | ✓ |
| Full CRUD from day one | Include upgrade and rollback. | |
| View + rollback only | Read-only + rollback to previous revision. | |

**User's choice:** Read-only first, mutations later
**Notes:** None

---

## Events Timeline

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal timeline with swim lanes | Scrollable timeline with resource type swim lanes. Color-coded. | ✓ |
| Vertical activity feed | GitHub-style vertical feed grouped by time. | |
| Calendar heatmap | GitHub contribution grid showing event density. | |

**User's choice:** Horizontal timeline with swim lanes
**Notes:** None

## Differentiator Feature

| Option | Description | Selected |
|--------|-------------|----------|
| Resource topology map | Interactive node graph showing resource relationships. | ✓ |
| AI-powered insights panel | Intelligent suggestions using existing AI service. | |
| Live resource diff viewer | Side-by-side diff of current vs last-applied. | |
| Cluster health dashboard with gauges | Ring gauges for CPU/Memory/Pod capacity. | |

**User's choice:** Resource topology map
**Notes:** Also with hyperlink to each object, must be tested for each object that it works and opens the object that was chosen.

## Network Policy Visualization

| Option | Description | Selected |
|--------|-------------|----------|
| Flow graph with allow/deny arrows | Interactive graph: pods as nodes, policies as arrows. | ✓ |
| Matrix table view | Grid showing source vs destination with allow/deny cells. | |
| Rule list with visual indicators | List of policies with visual ingress/egress breakdowns. | |

**User's choice:** Flow graph with allow/deny arrows
**Notes:** None

## RBAC Viewer

| Option | Description | Selected |
|--------|-------------|----------|
| Permission matrix | Grid: users as rows, resources as columns, CRUD as cells. | ✓ |
| Tree diagram | Hierarchical tree: ClusterRole → Binding → Subjects. | |
| Search-first interface | 'Can user X do Y?' question interface. | |

**User's choice:** Permission matrix
**Notes:** None

## Resource Quotas

| Option | Description | Selected |
|--------|-------------|----------|
| Gauge dashboard with bars | Per-namespace cards with resource utilization bars. | ✓ |
| Treemap visualization | Nested rectangles showing usage by namespace/type. | |
| Simple table with progress bars | Sortable table with inline progress bars. | |

**User's choice:** Gauge dashboard with bars
**Notes:** None

## CRD Browser

| Option | Description | Selected |
|--------|-------------|----------|
| Two-level browse: CRD list → instances | CRD cards, expand to see instances. Search. YAML viewer. | ✓ |
| Flat resource list with CRD type filter | Single list with CRD type dropdown filter. | |
| API explorer style | Tree view of API groups/resources. | |

**User's choice:** Two-level browse: CRD list → instances
**Notes:** None

## Resource Diff

| Option | Description | Selected |
|--------|-------------|----------|
| Current vs last-applied annotation | Compare live state vs kubectl annotation. | |
| Revision comparison (Helm) | Compare between Helm revisions. | |
| Both options above | Both current vs last-applied AND Helm revision comparison. | ✓ |

**User's choice:** Both options
**Notes:** With the option for the user to copy values if he wants to.

## Port Forwarding

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to future phase | Too complex for Phase 9. | |
| Include in Phase 9 | Build server-side proxy. | |
| Provide kubectl command instead | Copy port-forward command button. | ✓ |

**User's choice:** Provide kubectl command instead
**Notes:** No need real port-forward from app. Only command is enough, with small copy icon for the user to copy.

## Graph Visualization Engine

| Option | Description | Selected |
|--------|-------------|----------|
| React Flow | React-native graph library. Built-in zoom/pan/minimap. MIT. | ✓ |
| D3.js force graph | Maximum customization, manual implementation. | |
| Cytoscape.js | Purpose-built for network graphs. Heavier (~100KB). | |
| Custom SVG | Full control, zero dependency. High effort. | |

**User's choice:** React Flow
**Notes:** None

## Existing Tab Update Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Add YAML + actions to existing tabs | YAML tab, Diff tab, action toolbar where applicable. | ✓ |
| Full Lens-style polish pass | Status icons, age formatting, owner references display. | |
| Skip — Phase 8 covered this | Focus entirely on new features. | |

**User's choice:** Add YAML + actions to existing tabs
**Notes:** And live data of course for all the tabs like Lens have.

---

## Claude's Discretion

- Graph layout algorithms (dagre, elk, or custom)
- xterm.js theme/color scheme
- YAML syntax highlighting color tokens
- Events timeline time range presets
- CRD schema rendering approach
- Helm hooks/tests display
- Animation details for new components

## Deferred Ideas

- Helm upgrade/rollback mutations → future phase
- Actual port forwarding proxy → future phase
- AI-powered cluster insights → future phase
- Resource topology as default Overview → evaluate after built
- Real-time graph animation → future enhancement

## Design Quality Directive

User explicitly requested: **use `ui-ux-pro-max` and `frontend-design` skills** for all plans with frontend work.
