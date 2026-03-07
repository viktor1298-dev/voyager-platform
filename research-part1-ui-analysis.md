# Part 1: Current UI Analysis

> **Date:** 2026-03-07  
> **Analyst:** UX Subagent (source code analysis)  
> **Scope:** Sidebar navigation, cluster detail page, duplication map, redesign recommendations

---

## Sidebar Navigation Inventory

The sidebar contains **20 navigation items** across **4 collapsible groups**, plus a dynamic **Clusters** quick-access section (up to 6 clusters listed at the bottom).

| # | Item | Icon | Path | Group | Admin Only | Classification |
|---|------|------|------|-------|------------|----------------|
| 1 | Dashboard | `LayoutDashboard` | `/` | Observability | No | **GLOBAL** — cross-cluster overview |
| 2 | Health | `HeartPulse` | `/system-health` | Observability | No | **CLUSTER-SPECIFIC** — shows per-cluster health status table |
| 3 | Anomalies | `AlertTriangle` | `/anomalies` | Observability | No | **HYBRID** — lists anomalies across clusters, but each anomaly belongs to a cluster |
| 4 | Events | `Activity` | `/events` | Observability | No | **CLUSTER-SPECIFIC** — uses `useClusterContext`, shows events for selected cluster |
| 5 | Alerts | `Bell` | `/alerts` | Observability | No | **GLOBAL** — cross-cluster alert rules & notifications |
| 6 | Shared Dashboards | `LayoutGrid` | `/dashboards` | Observability | No | **GLOBAL** — user-created custom dashboards |
| 7 | Clusters | `Server` | `/clusters` | Infrastructure | No | **GLOBAL** — cluster list/management |
| 8 | Services | `Layers` | `/services` | Infrastructure | No | **CLUSTER-SPECIFIC** — has cluster selector dropdown, shows services for one cluster |
| 9 | Deployments | `Box` | `/deployments` | Infrastructure | No | **CLUSTER-SPECIFIC** — uses `useClusterContext`, shows deployments for selected cluster |
| 10 | Namespaces | `FolderTree` | `/namespaces` | Infrastructure | No | **CLUSTER-SPECIFIC** — has cluster selector, shows namespaces for one cluster |
| 11 | Logs | `FileText` | `/logs` | Infrastructure | No | **CLUSTER-SPECIFIC** — uses `useClusterContext`, streams logs for selected cluster |
| 12 | AI Assistant | `Bot` | `/ai` | Platform | No | **GLOBAL** — cross-cluster AI chat |
| 13 | Webhooks | `Webhook` | `/webhooks` | Platform | Yes | **GLOBAL** — webhook configuration |
| 14 | Autoscaling | `Wind` | `/karpenter` | Platform | No | **GLOBAL** — Karpenter autoscaling config |
| 15 | Settings | `Settings` | `/settings` | Admin | No | **GLOBAL** — app settings |
| 16 | Feature Flags | `Flag` | `/features` | Admin | Yes | **GLOBAL** — feature flag management |
| 17 | Teams | `UsersRound` | `/teams` | Admin | Yes | **GLOBAL** — team management |
| 18 | Permissions | `Shield` | `/permissions` | Admin | Yes | **GLOBAL** — RBAC permissions |
| 19 | Users | `Users` | `/users` | Admin | Yes | **GLOBAL** — user management |
| 20 | Audit Log | `ClipboardList` | `/audit` | Admin | Yes | **GLOBAL** — audit trail |

### Sidebar Bottom Section: Cluster Quick-Access
- Shows up to **6 clusters** from `trpc.clusters.list`
- Each cluster links to `/clusters` (NOT to `/clusters/{id}` — missed opportunity)
- Colored dot based on environment detection (prod/staging/dev)

---

## Cluster Detail Page — Current Tabs

**Route:** `/clusters/[id]/page.tsx`

The cluster detail page has a rich header card and **7 tabs**:

| Tab | Content | Data Source | Completeness |
|-----|---------|-------------|--------------|
| **Overview** | Stats grid (Nodes, Pods, Namespaces, Version) + MetricsTimeSeriesPanel + Recent Events (last 5) | Live or stored | ✅ Full implementation |
| **Nodes** | DataTable with Name, Status, Role, Kubelet, OS, CPU, CPU%, Memory, Mem% | Live or DB nodes | ✅ Full implementation |
| **Pods** | Grouped by namespace, collapsible, pod detail sheet, delete action | Live only | ✅ Full (live clusters only) |
| **Services** | ⚠️ **Placeholder only** — empty state linking to `/services` page | None | ❌ Stub |
| **Deployments** | ⚠️ **Placeholder only** — empty state linking to `/deployments` page | None | ❌ Stub |
| **Events** | DataTable with Time, Type, Reason, Message, search + pagination | Live or DB events | ✅ Full implementation |
| **Metrics** | MetricsTimeSeriesPanel (CPU, Memory time-series charts) | Live metrics | ✅ Full implementation |

### Header Card Features:
- Provider icon (AWS/GCP/Azure/minikube auto-detected)
- Health status dot + badge (healthy/degraded/error)
- Connectivity indicator (connected/last seen/disconnected)
- Live Data / Stored Data toggle
- Provider badge
- K8s version + endpoint
- Stats grid: Nodes, Pods, Namespaces, Version

### Special Components:
- **AiContextCard** — appears for unhealthy clusters (error/degraded)
- **AiInsightBanner** — appears when anomalies detected for this cluster
- **PodDetailSheet** — slide-over panel for pod inspection
- **DeletePodDialog** — modal for pod deletion (admin only)

---

## Duplication Map

These items appear **both** as top-level sidebar pages **and** inside the cluster detail page:

| Data Type | Sidebar Path | Cluster Detail Tab | Duplication Type |
|-----------|-------------|-------------------|-----------------|
| **Events** | `/events` (global page with cluster selector) | Events tab (cluster-scoped) | 🔴 **Full duplication** — identical data, different container |
| **Services** | `/services` (global page with cluster selector) | Services tab (placeholder → links to `/services`) | 🟡 **Stub duplication** — tab exists but redirects |
| **Deployments** | `/deployments` (global page with cluster selector) | Deployments tab (placeholder → links to `/deployments`) | 🟡 **Stub duplication** — tab exists but redirects |
| **Nodes** | N/A (no global nodes page) | Nodes tab | ✅ No duplication |
| **Pods** | N/A (no global pods page) | Pods tab | ✅ No duplication |
| **Health** | `/system-health` (all clusters health table) | Header health dot + AiContextCard | 🟠 **Partial duplication** — global aggregated vs. cluster-specific detail |
| **Anomalies** | `/anomalies` (all clusters anomaly list) | AiInsightBanner (count only) | 🟠 **Partial duplication** — global list vs. cluster chip count |
| **Logs** | `/logs` (global page with cluster selector) | N/A (no logs tab) | ⚪ **Missing from cluster detail** — should be there |
| **Namespaces** | `/namespaces` (global page with cluster selector) | Overview count only | ⚪ **Missing from cluster detail** — should be a tab |
| **Metrics** | N/A (no global metrics page) | Metrics tab | ✅ No duplication |

### Key Observation: "Ghost Cluster Selector" Pattern
Services, Deployments, Namespaces, Logs, and Events pages all use `useClusterContext` or have a manual cluster selector. They are **inherently cluster-scoped data forced into global navigation**. The user must:
1. Click sidebar item → go to global page
2. Select a cluster from a dropdown
3. See the data

This is 3 steps for what should be 1 click from the cluster context.

---

## Screenshot Observations

**Screenshots unavailable** — sandbox browser not enabled. Analysis performed entirely from source code.

Key visual patterns identified from code:
- **Dark theme** with CSS custom properties (`--color-bg-card`, `--color-border`, etc.)
- **12px/48px sidebar** (collapsed/expanded) — compact but dense when expanded
- **Top bar** at 56px height (fixed)
- **Collapsible nav groups** with chevron toggle + uppercase monospace labels
- **Alerts badge** — red pill badge on Alerts item showing unacknowledged count
- **Version number** shown at sidebar bottom
- **Mobile-responsive** — sidebar becomes slide-over drawer on <768px

---

## Recommended: Global Sidebar (keep)

Maximum **7 items** that genuinely represent cross-cluster or platform-wide concerns:

| # | Item | Path | Rationale |
|---|------|------|-----------|
| 1 | **Dashboard** | `/` | Primary landing — cross-cluster overview |
| 2 | **Clusters** | `/clusters` | Core navigation hub — entry point to all cluster data |
| 3 | **Alerts** | `/alerts` | Cross-cluster alert rules — genuinely global |
| 4 | **AI Assistant** | `/ai` | Platform capability — not cluster-bound |
| 5 | **Shared Dashboards** | `/dashboards` | User-created views — genuinely global |
| 6 | **Settings** | `/settings` | Platform configuration — genuinely global |
| 7 | **Admin** | (group) | Collapsed group: Users, Teams, Permissions, Audit, Feature Flags, Webhooks |

### Why these stay:
- Dashboard, Clusters, and Alerts are the core operational workflow
- AI Assistant is a platform-wide tool
- Shared Dashboards are cross-cluster by nature
- Admin items are platform management, not cluster-scoped

---

## Recommended: Move to Cluster Detail

These items should be **removed from the global sidebar** and become tabs/sections within the cluster detail page:

| Item | Current Path | Target Location | Rationale |
|------|-------------|-----------------|-----------|
| **Health** | `/system-health` | Cluster Detail → Health tab or header expansion | Per-cluster health; global view becomes a Dashboard widget |
| **Anomalies** | `/anomalies` | Cluster Detail → Anomalies tab | Each anomaly belongs to a cluster; global count stays on Dashboard |
| **Events** | `/events` | Cluster Detail → Events tab (already exists) | Currently duplicated; remove the global page |
| **Services** | `/services` | Cluster Detail → Services tab (upgrade from placeholder) | Currently uses cluster selector anyway — embed directly |
| **Deployments** | `/deployments` | Cluster Detail → Deployments tab (upgrade from placeholder) | Currently uses cluster selector anyway — embed directly |
| **Namespaces** | `/namespaces` | Cluster Detail → Namespaces tab (new) | Currently uses cluster selector anyway — embed directly |
| **Logs** | `/logs` | Cluster Detail → Logs tab (new) | Currently uses cluster selector anyway — embed directly |
| **Autoscaling** | `/karpenter` | Cluster Detail → Autoscaling tab (new) | Karpenter config is per-cluster |

### Impact:
- Sidebar shrinks from **20 items** → **~10 items** (7 core + admin group)
- Cluster detail grows from **7 tabs** → **~12 tabs** (or grouped sub-nav)
- Eliminates the "ghost cluster selector" anti-pattern
- Users navigate: Dashboard → Cluster → Everything about that cluster

---

## Architecture Issues Identified

### 1. Missing Deep Links
Cluster quick-access in sidebar links to `/clusters` not `/clusters/{id}` — defeats the purpose of showing individual clusters.

### 2. Service/Deployment Tab Placeholders
The cluster detail page has Services and Deployments tabs that are just empty states linking back to global pages. This creates a circular navigation: cluster → services tab → "go to services page" → select cluster again.

### 3. No Cluster Context Persistence
Multiple pages (`/services`, `/deployments`, `/logs`, `/events`) use `useClusterContext` store, but navigating between them may lose the selected cluster depending on store persistence.

### 4. Sidebar Density
20 items across 4 groups is too many. Enterprise K8s dashboards (Lens, Rancher, Grafana) typically have 5-8 primary nav items with cluster-scoped content inside the cluster context.

### 5. Admin Items Visibility
6 admin-only items (Users, Teams, Permissions, Audit, Feature Flags, Webhooks) are visible to admins but create noise. These should be under a single "Admin" or "Settings" subsection.

---

## Competitive Reference Points

| Platform | Global Sidebar Items | Cluster-Scoped Inside |
|----------|---------------------|----------------------|
| Lens (K8s IDE) | ~6 (Catalog, Browse, Hotbar) | Workloads, Config, Network, Storage, Namespaces, Events |
| Rancher | ~5 (Home, Clusters, Users, Tools, Settings) | Workloads, Services, Storage, Projects, Members, Events, Logs |
| Grafana Cloud K8s | ~4 (Home, Dashboards, Alerting, Admin) | Cluster-specific views embedded |
| **Voyager (current)** | **20 (!)** | 7 tabs (2 are placeholders) |
| **Voyager (proposed)** | **~10** | **~12 tabs** (all functional) |

---

*Report generated from source code analysis of `/apps/web/src/`. Browser screenshots were unavailable (sandbox browser disabled).*
