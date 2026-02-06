# Voyager Platform — UI Design System & Specification

> **Version:** 1.0  
> **Date:** February 4, 2026  
> **Author:** Atlas Design System  
> **Stack:** Next.js 15 + React 19 + Shadcn/ui + Tailwind CSS + Recharts  
> **Design Philosophy:** Dark-first, data-dense, operationally focused

---

## Table of Contents

1. [Color Palette](#1-color-palette)
2. [Typography](#2-typography)
3. [Component Patterns](#3-component-patterns)
4. [Page Layouts](#4-page-layouts)
5. [Tailwind CSS Token Configuration](#5-tailwind-css-token-configuration)
6. [Recommended Libraries](#6-recommended-libraries)

---

## 1. Color Palette

Voyager is a dark-mode-first platform. DevOps engineers, SREs, and platform teams spend hours staring at dashboards — dark mode reduces eye strain, improves chart readability, and is the industry standard for infrastructure tools (Datadog, Grafana, Komodor all default to dark).

### 1.1 Dark Mode — Core Palette (Primary)

| Token | Role | Hex | HSL | Usage |
|-------|------|-----|-----|-------|
| `background` | Page background | `#09090B` | `240 10% 3.9%` | Root background, full-page canvas |
| `background-deep` | Deepest layer | `#050507` | `240 12% 2%` | Sidebar background, inset panels |
| `surface` | Card / panel surface | `#111113` | `240 8% 7%` | Cards, modals, dropdown menus, table rows |
| `surface-raised` | Elevated surface | `#1A1A1F` | `240 8% 11%` | Hover states, active table rows, selected items |
| `surface-overlay` | Modal overlay | `#27272A` | `240 4% 16%` | Dialog backgrounds, popover panels |
| `border` | Default border | `#27272A` | `240 4% 16%` | Card borders, dividers, table grid lines |
| `border-subtle` | Subtle divider | `#1E1E22` | `240 6% 12%` | Soft separators within cards, secondary borders |
| `border-focus` | Focus ring | `#6366F1` | `239 84% 67%` | Keyboard focus indicators, active input borders |
| `text-primary` | Primary text | `#FAFAFA` | `0 0% 98%` | Headings, metric values, primary labels |
| `text-secondary` | Secondary text | `#A1A1AA` | `240 5% 65%` | Descriptions, timestamps, table cell text |
| `text-muted` | Muted text | `#71717A` | `240 4% 46%` | Placeholders, disabled labels, helper text |
| `text-disabled` | Disabled text | `#52525B` | `240 4% 34%` | Disabled buttons, inactive nav items |

### 1.2 Light Mode (Secondary — User Toggle)

| Token | Role | Hex | Usage |
|-------|------|-----|-------|
| `background` | Page background | `#FFFFFF` | Root background |
| `surface` | Card surface | `#F9FAFB` | Cards, panels |
| `surface-raised` | Elevated | `#F3F4F6` | Hover states |
| `border` | Default border | `#E5E7EB` | Card borders |
| `text-primary` | Primary text | `#111827` | Headings |
| `text-secondary` | Secondary text | `#6B7280` | Descriptions |
| `text-muted` | Muted text | `#9CA3AF` | Placeholders |

### 1.3 Status Colors — Operational Semantics

These colors are the language of infrastructure health. They must be instantly recognizable and consistent everywhere — badges, charts, borders, backgrounds.

| Status | Token | Hex | Background (10% opacity) | Usage |
|--------|-------|-----|--------------------------|-------|
| 🟢 **Healthy / Running** | `status-healthy` | `#22C55E` | `#22C55E1A` | Pods running, nodes ready, checks passing, uptime |
| 🟡 **Warning / Degraded** | `status-warning` | `#EAB308` | `#EAB3081A` | High resource usage, budget approaching, pending events |
| 🔴 **Critical / Error** | `status-critical` | `#EF4444` | `#EF44441A` | Pod crashes, node down, security breach, budget exceeded |
| 🔵 **Info / Neutral** | `status-info` | `#3B82F6` | `#3B82F61A` | Informational alerts, scaling events, deployments |
| ⚪ **Unknown / Pending** | `status-unknown` | `#71717A` | `#71717A1A` | Status unavailable, connection lost, pending state |
| 🟣 **AI / Insight** | `status-ai` | `#A855F7` | `#A855F71A` | AI-generated recommendations, investigation results |

### 1.4 Brand & Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-primary` | `#6366F1` | Primary CTA buttons, active nav indicators, logo accent, links |
| `brand-primary-hover` | `#818CF8` | Hover state for primary actions |
| `brand-primary-active` | `#4F46E5` | Active/pressed state |
| `brand-secondary` | `#8B5CF6` | Secondary accents, AI features, premium indicators |
| `brand-gradient-from` | `#6366F1` | Gradient start (indigo) — used in hero elements, brand moments |
| `brand-gradient-to` | `#8B5CF6` | Gradient end (violet) — subtle brand identity |

### 1.5 Chart Colors — Data Visualization Palette

Optimized for colorblind accessibility (deuteranopia, protanopia) and dark backgrounds:

| Index | Name | Hex | Usage |
|-------|------|-----|-------|
| 1 | Indigo | `#6366F1` | Primary series, current period |
| 2 | Cyan | `#06B6D4` | Secondary series, comparison |
| 3 | Emerald | `#10B981` | Positive/growth metrics |
| 4 | Amber | `#F59E0B` | Warning-related data |
| 5 | Rose | `#F43F5E` | Critical/negative metrics |
| 6 | Violet | `#8B5CF6` | AI predictions, forecasts |
| 7 | Teal | `#14B8A6` | Tertiary series |
| 8 | Orange | `#F97316` | Additional series |

---

## 2. Typography

Inter is the industry-standard font for data-dense dashboards. It was specifically designed for computer screens with tall x-height, optimized for legibility at small sizes, and includes tabular number support — critical for metric displays where digits must align vertically.

### 2.1 Font Family Stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
```

| Family | Usage |
|--------|-------|
| **Inter** | All headings, body text, labels, navigation, metric values |
| **JetBrains Mono** | Log viewer, code snippets, YAML/JSON display, terminal output, resource names (pod names, namespace names) |

### 2.2 Type Scale

Using a modular scale with 1.25 ratio, base 14px (optimized for data-dense dashboard readability):

| Token | Size (px) | Size (rem) | Line Height | Letter Spacing | Usage |
|-------|-----------|------------|-------------|----------------|-------|
| `text-xs` | 11px | 0.6875rem | 1.45 (16px) | +0.01em | Timestamps, chart axis labels, fine print, badge labels |
| `text-sm` | 12px | 0.75rem | 1.5 (18px) | +0.005em | Table cell text, secondary labels, tooltips, sidebar nav items |
| `text-base` | 14px | 0.875rem | 1.57 (22px) | 0 | Body text, form labels, button text, primary table cells |
| `text-lg` | 16px | 1rem | 1.5 (24px) | -0.005em | Card titles, section subheadings, nav group headers |
| `text-xl` | 20px | 1.25rem | 1.4 (28px) | -0.01em | Page section titles, dialog titles |
| `text-2xl` | 24px | 1.5rem | 1.33 (32px) | -0.015em | Page headings, cluster names in detail views |
| `text-3xl` | 30px | 1.875rem | 1.27 (38px) | -0.02em | Primary metric values (cost totals, health scores) |
| `text-4xl` | 36px | 2.25rem | 1.22 (44px) | -0.025em | Hero metrics on dashboard home (overall health %, total cost) |

### 2.3 Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| **Regular** | 400 | Body text, descriptions, table cells, log output |
| **Medium** | 500 | Labels, nav items, badge text, form field labels, button text |
| **Semibold** | 600 | Card titles, table headers, section headings, active nav items |
| **Bold** | 700 | Page headings, hero metrics, metric card primary values, critical alerts |

### 2.4 Metric Display — Tabular Numbers

For all numeric displays (costs, percentages, counts, resource values), use `font-variant-numeric: tabular-nums` to ensure digit alignment in tables and metric cards:

```css
.metric-value {
  font-family: 'Inter', sans-serif;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.02em;
}
```

### 2.5 Monospace Context

Log viewers, YAML editors, and resource identifiers use JetBrains Mono at reduced sizes:

| Context | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Log lines | 12px | 400 | 1.6 (19px) — generous for scanability |
| Code blocks | 13px | 400 | 1.5 (20px) |
| Resource names in tables | 12px | 500 | 1.5 (18px) |
| Terminal / shell output | 13px | 400 | 1.5 (20px) |

---

## 3. Component Patterns

All components are built on **Shadcn/ui** primitives (Radix UI headless components + Tailwind CSS styling). This gives us accessible, composable, unstyled primitives that we own and customize — no vendor lock-in to a component library.

### 3.1 Sidebar Navigation

The primary navigation pattern. Collapsible sidebar with icon + label layout, supporting multi-level grouping for Voyager's four major domains.

**Structure:**

```
┌──────────────────────────────────────────────────────┐
│ ┌──────────┐                                         │
│ │ ◆ Voyager│  [← collapse]                           │
│ │          │                                         │
│ ├──────────┤                                         │
│ │ 🏠 Home  │  ┌──────────────────────────────────┐  │
│ │          │  │                                    │  │
│ │ CLUSTERS │  │         Main Content Area          │  │
│ │ 📊 Overview│ │                                    │  │
│ │ 🖥 Nodes  │  │                                    │  │
│ │ 📦 Workloads│                                    │  │
│ │ 📋 Pods   │  │                                    │  │
│ │          │  │                                    │  │
│ │ FINOPS   │  │                                    │  │
│ │ 💰 Costs  │  │                                    │  │
│ │ 📈 Optimize│ │                                    │  │
│ │          │  │                                    │  │
│ │ SECURITY │  │                                    │  │
│ │ 🛡 Vulns  │  │                                    │  │
│ │ 🔒 Runtime│  │                                    │  │
│ │ ✅ Compliance│                                   │  │
│ │          │  │                                    │  │
│ │ PLATFORM │  │                                    │  │
│ │ 🔔 Alerts │  │                                    │  │
│ │ 🤖 AI Assist│                                    │  │
│ │ ⚙ Settings│ │                                    │  │
│ │          │  └──────────────────────────────────┘  │
│ ├──────────┤                                         │
│ │ 👤 Viktor │                                        │
│ │ Cluster ▼│                                        │
│ └──────────┘                                         │
└──────────────────────────────────────────────────────┘
```

**Specifications:**

| Property | Expanded | Collapsed |
|----------|----------|-----------|
| Width | 256px (16rem) | 64px (4rem) |
| Background | `background-deep` (#050507) | Same |
| Border-right | 1px solid `border-subtle` | Same |
| Transition | 200ms ease-in-out | Same |
| Nav item height | 36px | 40px (icon only, centered) |
| Nav item padding | 8px 12px | 8px (centered) |
| Active indicator | 3px left border `brand-primary` + `surface-raised` bg | Dot indicator on icon |
| Group labels | Uppercase, `text-xs`, `text-muted`, 500 weight | Hidden |
| Icons | 18px Lucide icons, `text-secondary` | 20px, centered |
| Active icon color | `brand-primary` (#6366F1) | Same |
| Hover state | `surface-raised` background, 150ms transition | Same |

**Behavior:**
- Persists collapse state in localStorage
- Keyboard shortcut: `Cmd/Ctrl + B` to toggle
- Bottom section: cluster selector dropdown + user avatar/menu
- Scroll: vertical scroll within nav groups if content overflows
- Mobile (< 1024px): off-canvas drawer with backdrop overlay

### 3.2 Data Tables

The workhorse component. Used for pod lists, node inventory, vulnerability tables, cost breakdowns, and alert lists. Must handle 1,000+ rows efficiently.

**Built with:** Shadcn `<Table>` + TanStack Table v8

**Anatomy:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Search pods...    [Status ▼] [Namespace ▼]    ↓ Export     │  ← Toolbar
├─────────────────────────────────────────────────────────────────┤
│  ☐  Name ↑↓        Namespace   Status    CPU     Mem    Age    │  ← Header
├─────────────────────────────────────────────────────────────────┤
│  ☐  api-server-7d..  default    🟢 Running  45%    320Mi  3d   │  ← Row
│  ☐  worker-abc12..   prod       🟡 Pending  --     --     12s  │
│  ☐  redis-cache-0    cache      🔴 CrashLoop 89%   512Mi  1h   │  ← Critical row
│  ...                                                            │
├─────────────────────────────────────────────────────────────────┤
│  Showing 1-50 of 1,247 pods      [< 1 2 3 ... 25 >]           │  ← Footer
└─────────────────────────────────────────────────────────────────┘
```

**Specifications:**

| Property | Value |
|----------|-------|
| Header background | `surface` (#111113) — sticky on scroll |
| Header text | `text-xs` uppercase, `text-muted`, font-weight 500 |
| Row height | 44px (comfortable click target) |
| Row background | transparent (odd) / `surface` subtle alternate |
| Row hover | `surface-raised` (#1A1A1F) |
| Row border | 1px solid `border-subtle` (#1E1E22) |
| Critical row | Left 3px border `status-critical` + `status-critical` 5% bg tint |
| Warning row | Left 3px border `status-warning` |
| Cell padding | 12px horizontal, 8px vertical |
| Sort indicators | Lucide `ArrowUpDown` icon, `text-muted` → `text-primary` when active |
| Selection | Checkbox column, `brand-primary` color when checked |
| Virtualization | `@tanstack/react-virtual` for lists > 100 rows |
| Resize | Column resize handles, min-width per column type |
| Empty state | Centered illustration + "No pods match your filters" message |

**Filter Toolbar:**
- Search: debounced (300ms), searches across name + namespace + labels
- Facet filters: dropdown multi-select for Status, Namespace, Node
- Active filters shown as removable pills below the search bar
- "Clear all" link when any filters active

### 3.3 Metric Cards

The primary data display unit for dashboards. Shows a KPI with contextual trend information.

**Anatomy:**

```
┌────────────────────────────┐
│  Total Pods          ℹ️    │  ← Title + tooltip icon
│                            │
│  1,247                     │  ← Primary value (text-3xl bold)
│  ▲ 12% vs last week       │  ← Trend indicator
│                            │
│  ╱╲╱╲╱╲_╱╲╱╲▓▓            │  ← Sparkline (last 24h)
└────────────────────────────┘
```

**Specifications:**

| Property | Value |
|----------|-------|
| Card background | `surface` (#111113) |
| Card border | 1px solid `border` (#27272A) |
| Border radius | 12px (rounded-xl) |
| Card padding | 20px (p-5) |
| Card min-width | 240px |
| Card shadow | none (flat design, borders define edges in dark mode) |
| Title | `text-sm`, `text-secondary`, font-weight 500 |
| Value | `text-3xl`, `text-primary`, font-weight 700, tabular-nums |
| Trend up | `status-healthy` (#22C55E), Lucide `TrendingUp` 14px |
| Trend down | `status-critical` (#EF4444), Lucide `TrendingDown` 14px |
| Trend neutral | `text-muted` (#71717A), Lucide `Minus` 14px |
| Sparkline | 64px height, 2px stroke, `brand-primary` with 10% fill gradient |
| Hover | `surface-raised` bg, 150ms transition, cursor pointer (navigates to detail) |

**Variants:**

| Variant | Visual Difference |
|---------|-------------------|
| **Standard** | Number + trend + sparkline (as above) |
| **Compact** | Number + trend only, no sparkline. For dense grids. |
| **Status** | Number + colored left border matching status. For health summaries. |
| **Cost** | Number with `$` prefix, trend shows dollar delta, green = saving |
| **Progress** | Number + circular progress ring (e.g., budget utilization %) |

### 3.4 Status Badges

Consistent status indicators used across all tables, cards, and detail views.

**Anatomy:** `● Status Label`

**Specifications:**

| Status | Dot Color | Background | Text Color | Border |
|--------|-----------|------------|------------|--------|
| Running / Healthy | `#22C55E` | `#22C55E15` | `#4ADE80` | `#22C55E30` |
| Warning / Degraded | `#EAB308` | `#EAB30815` | `#FACC15` | `#EAB30830` |
| Critical / Error | `#EF4444` | `#EF444415` | `#F87171` | `#EF444430` |
| Info / Scaling | `#3B82F6` | `#3B82F615` | `#60A5FA` | `#3B82F630` |
| Unknown / Pending | `#71717A` | `#71717A15` | `#A1A1AA` | `#71717A30` |

| Property | Value |
|----------|-------|
| Height | 24px |
| Padding | 4px 10px |
| Border radius | 9999px (fully round / pill shape) |
| Dot size | 6px, with subtle `pulse` animation on Critical |
| Font | `text-xs`, font-weight 500 |
| Border | 1px solid (color-specific, see table above) |

**Critical pulse animation:**
```css
@keyframes pulse-critical {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.status-dot-critical {
  animation: pulse-critical 2s ease-in-out infinite;
}
```

### 3.5 Charts — Data Visualization

All charts use **Recharts** with a consistent theme layer. The chart system supports three primary chart types optimized for infrastructure data.

#### 3.5.1 Area Charts (Time-Series)

The default chart for any metric over time: CPU usage, memory, request rates, cost trends, error rates.

```
  100% ┤
       │         ╱╲
   75% ┤    ╱╲  ╱  ╲   ╱╲
       │   ╱  ╲╱    ╲ ╱  ╲
   50% ┤  ╱         ╲╱    ╲▓▓▓▓▓▓  ← Gradient fill
       │ ╱                  ╲
   25% ┤╱                    ╲
       │
    0% ┼──────────────────────────
       12:00  14:00  16:00  18:00
```

| Property | Value |
|----------|-------|
| Stroke width | 2px |
| Stroke color | Chart palette color (series-dependent) |
| Fill | Linear gradient: series color 20% opacity → 0% opacity |
| Grid lines | Horizontal only, `border-subtle` (#1E1E22), dashed |
| Axis labels | `text-xs`, `text-muted`, Inter |
| Axis tick color | `border-subtle` |
| Tooltip | `surface-overlay` bg, `border` border, 8px radius, shadow-lg |
| Tooltip text | `text-sm`, `text-primary` for value, `text-secondary` for label |
| Active dot | 6px radius, white stroke 2px, fill = series color |
| Animation | 300ms ease-out on mount |
| Responsive | Container-query based, min-height 200px |
| Time formats | HH:mm (hours), MMM DD (days), MMM (months) — auto-selected |

#### 3.5.2 Bar Charts (Comparisons)

Used for namespace cost comparisons, resource usage by team, vulnerability counts by severity.

| Property | Value |
|----------|-------|
| Bar radius | 4px top corners (rounded-t) |
| Bar width | Auto-calculated, max 48px, min 12px |
| Bar gap | 4px between grouped bars |
| Category gap | 20% of available space |
| Hover | Bar brightness increases 20%, tooltip appears |
| Horizontal variant | For ranked lists (top 10 expensive namespaces) |

#### 3.5.3 Donut Charts (Distribution)

Used for vulnerability severity breakdown, resource allocation %, pod status distribution.

| Property | Value |
|----------|-------|
| Inner radius | 60% of outer radius |
| Outer radius | Container-responsive, max 120px |
| Center content | Primary metric (e.g., "247 Total") in `text-xl` bold |
| Segment stroke | 2px `background` (#09090B) — creates separation |
| Legend | Right-aligned, vertical list with colored dots + label + value |
| Hover | Segment expands 4px outward, tooltip shows detail |
| Colors | Follow status colors for severity data; chart palette for general data |

### 3.6 Command Palette (AI Quick Access)

Global keyboard shortcut `Cmd/Ctrl + K` opens a command palette that doubles as the AI assistant entry point.

```
┌─────────────────────────────────────────────────┐
│  🔍 Search or ask AI...                         │
├─────────────────────────────────────────────────┤
│  RECENT                                         │
│  📊  production/api-server pod detail            │
│  💰  FinOps overview                             │
│  🛡  Security dashboard                          │
│                                                  │
│  QUICK ACTIONS                                   │
│  🤖  Ask Voyager AI "Why is checkout slow?"      │
│  📋  View all critical alerts (3)                │
│  🔄  Compare clusters                            │
│                                                  │
│  NAVIGATION                                      │
│  🏠  Dashboard Home                              │
│  📊  Cluster Overview                            │
│  💰  Cost Explorer                               │
└─────────────────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Overlay | `#000000` 60% opacity backdrop |
| Panel width | 640px max, centered vertically (top 20%) |
| Panel bg | `surface-overlay` (#27272A) |
| Border | 1px solid `border` + shadow-2xl |
| Border radius | 16px |
| Input height | 48px, `text-lg`, no visible border |
| Result items | 40px height, 12px padding, `surface-raised` on hover |
| Keyboard nav | Arrow keys to navigate, Enter to select, Esc to close |

---

## 4. Page Layouts

Each page follows a consistent layout shell: **Sidebar (left) + Header Bar (top) + Content Area (scrollable)**. The header bar contains breadcrumbs, page title, cluster context selector, and global actions (notifications bell, AI assistant, user menu).

**Layout Grid:** 12-column CSS Grid within the content area, with 16px (1rem) gutters. Content max-width: 1440px, centered on ultra-wide screens.

### 4.a Dashboard Home

**Purpose:** The "mission control" — first thing operators see. At-a-glance health across all clusters, surfacing what needs attention immediately.

**URL:** `/dashboard`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sidebar │  Dashboard Home           [prod-cluster ▼]  🔔3  👤     │
│          ├──────────────────────────────────────────────────────────┤
│          │                                                          │
│          │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│          │  │ Health Score│ │ Total Pods  │ │ Monthly Cost│       │
│          │  │    97%      │ │   1,247     │ │  $12,450    │       │
│          │  │ 🟢 ▲ 2%    │ │ ▲ 34 today  │ │ ▼ 8% saved │       │
│          │  │  ~~~graph~~  │ │  ~~~graph~~ │ │  ~~~graph~~ │       │
│          │  └─────────────┘ └─────────────┘ └─────────────┘       │
│          │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│          │  │ Active Alerts│ │ Vulnerabs   │ │ Waste       │       │
│          │  │     7       │ │    23 crit  │ │  $1,200/mo  │       │
│          │  │ 🔴 2 crit   │ │ 🔴 ▲ 5 new │ │  📈 3 recs  │       │
│          │  │  ~~~graph~~  │ │  ~~~graph~~ │ │  ~~~graph~~ │       │
│          │  └─────────────┘ └─────────────┘ └─────────────┘       │
│          │                                                          │
│          │  CLUSTER FLEET                                           │
│          │  ┌──────────────────┐ ┌──────────────────┐              │
│          │  │ 🟢 prod-eks-us   │ │ 🟢 prod-aks-eu   │              │
│          │  │ 12 nodes │ 340 pods│ 8 nodes │ 210 pods│              │
│          │  │ CPU: 67% │ Mem: 72%│ CPU: 45% │ Mem: 58%│             │
│          │  │ Cost: $5,200/mo   │ │ Cost: $3,800/mo   │              │
│          │  │ 🔴 1 alert        │ │ 🟢 All healthy     │              │
│          │  └──────────────────┘ └──────────────────┘              │
│          │  ┌──────────────────┐ ┌──────────────────┐              │
│          │  │ 🟡 staging-eks   │ │ 🟢 dev-kind       │              │
│          │  │ 4 nodes │ 89 pods │ │ 1 node │ 23 pods  │              │
│          │  │ CPU: 82% │ Mem: 91%│ CPU: 12% │ Mem: 20%│             │
│          │  │ Cost: $2,100/mo   │ │ Cost: $350/mo     │              │
│          │  │ 🟡 High mem usage │ │ 🟢 All healthy     │              │
│          │  └──────────────────┘ └──────────────────┘              │
│          │                                                          │
│          │  RECENT ALERTS                     [View All →]          │
│          │  ┌───────────────────────────────────────────────┐      │
│          │  │ 🔴 14:23  CrashLoopBackOff — api-server-7d    │      │
│          │  │ 🔴 14:15  Node NotReady — node-worker-3        │      │
│          │  │ 🟡 13:50  Memory > 90% — staging-eks/worker-1  │      │
│          │  │ 🔵 13:30  Deployment scaled — checkout 3→5     │      │
│          │  │ 🟡 12:00  Budget 85% — team-frontend namespace │      │
│          │  └───────────────────────────────────────────────┘      │
│          │                                                          │
│          │  COST SUMMARY                      [View FinOps →]      │
│          │  ┌───────────────────────────────────────────────┐      │
│          │  │  [====== Area chart: 30-day cost trend ======] │      │
│          │  │  This month: $12,450  │  Forecast: $13,200    │      │
│          │  │  Budget: $15,000      │  Savings found: $1,200│      │
│          │  └───────────────────────────────────────────────┘      │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Grid Layout:**
- **Row 1 — KPI Cards:** 6 metric cards in a 3×2 responsive grid (3 cols on desktop, 2 on tablet, 1 on mobile)
- **Row 2 — Cluster Fleet:** Cards in auto-fill grid, `minmax(320px, 1fr)`. Each cluster card shows: name, provider icon, node/pod counts, CPU/memory bars, monthly cost, alert badge
- **Row 3 — Two-column split:** Recent Alerts feed (left, 60%) + Cost Summary chart (right, 40%)

**Interactions:**
- Cluster cards: click navigates to Cluster Detail
- Alert items: click navigates to alert detail / pod detail
- Metric cards: click navigates to relevant domain page
- Auto-refresh: every 30 seconds for metrics, WebSocket for alerts (real-time)

### 4.b Cluster Detail

**Purpose:** Deep dive into a single cluster. Everything about this cluster's health, resources, and activity.

**URL:** `/clusters/:clusterId`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sidebar │  ← Back │ prod-eks-us-east-1      🟢 Healthy    ⚙️     │
│          ├──────────────────────────────────────────────────────────┤
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │  Provider: AWS EKS  │  Region: us-east-1        │   │
│          │  │  K8s Version: 1.29  │  Nodes: 12  │  Pods: 340  │   │
│          │  │  Created: 2024-03-15 │  Cost: $5,200/mo          │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  ┌─────────┬────────────┬───────────┬──────────┐       │
│          │  │  Nodes  │ Namespaces │ Workloads │ Events   │       │
│          │  └─────────┴────────────┴───────────┴──────────┘       │
│          │  ╔═══════════════════════════════════════════════╗       │
│          │  ║  [Active Tab Content — see below]             ║       │
│          │  ╚═══════════════════════════════════════════════╝       │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Header Section:**
- Cluster name with provider icon (AWS/Azure/GCP)
- Status badge (large variant)
- Key metadata in a horizontal info bar: provider, region, K8s version, node count, pod count, creation date, monthly cost
- Action menu: Edit labels, Cordon node, View YAML, Delete cluster

**Tab: Nodes**
- Data table: Name, Status, Role (control-plane/worker), CPU %, Memory %, Pods count, Age, Conditions
- Click row → expands inline detail with CPU/memory area charts (last 1h)
- Sort by any column; filter by role, status

**Tab: Namespaces**
- Data table: Name, Status, Pods, CPU Request/Limit, Memory Request/Limit, Cost/month
- Horizontal stacked bar showing request vs limit vs usage for CPU/Memory
- Click → navigates to namespace-scoped workload view

**Tab: Workloads**
- Grouped by type: Deployments, StatefulSets, DaemonSets, Jobs, CronJobs
- Each shows: Name, Namespace, Ready (e.g., 3/3), Restarts, Age, Status badge
- Click → navigates to workload detail with pod list

**Tab: Events**
- Reverse-chronological event stream
- Color-coded by type: Normal (blue), Warning (yellow), Error (red)
- Filterable by involved object, type, reason
- Time-relative display ("3 minutes ago") with full timestamp on hover

### 4.c Pod Detail

**Purpose:** The deepest resource view. Everything about a single pod — status, events, resource usage, and live logs. This is where SREs spend most of their time during incidents.

**URL:** `/clusters/:clusterId/namespaces/:ns/pods/:podName`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sidebar │  ← Cluster │ NS: production │ Pod: api-server-7d4f8b    │
│          ├──────────────────────────────────────────────────────────┤
│          │                                                          │
│          │  ┌────────────────────────────────────────────────────┐ │
│          │  │ 🔴 CrashLoopBackOff  │  Restarts: 47  │ Age: 3d   │ │
│          │  │ Node: worker-3  │  IP: 10.0.4.23  │  QoS: Burstable│ │
│          │  │ Image: myapp:v2.3.1  │  [View YAML] [Delete] [Logs]│ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
│          │  ┌── RESOURCE USAGE (last 1h) ────────────────────────┐ │
│          │  │                                                      │ │
│          │  │  CPU                      Memory                    │ │
│          │  │  ┌──────────────────┐    ┌──────────────────┐      │ │
│          │  │  │  Request: 250m   │    │  Request: 256Mi  │      │ │
│          │  │  │  Limit:   500m   │    │  Limit:   512Mi  │      │ │
│          │  │  │  Current: 480m 🔴│    │  Current: 498Mi 🟡│     │ │
│          │  │  │  [area chart]    │    │  [area chart]    │      │ │
│          │  │  └──────────────────┘    └──────────────────┘      │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
│          │  ┌── EVENTS TIMELINE ─────────────────────────────────┐ │
│          │  │  14:23 🔴 BackOff — restarting failed container     │ │
│          │  │  14:22 🔴 Failed — OOMKilled (exit code 137)       │ │
│          │  │  14:20 🔵 Pulling — pulling image myapp:v2.3.1     │ │
│          │  │  14:19 🔴 BackOff — restarting failed container     │ │
│          │  │  14:18 🔴 Failed — OOMKilled (exit code 137)       │ │
│          │  │  ...                                                │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
│          │  ┌── LOG VIEWER ──────────────────────────────────────┐ │
│          │  │  Container: [api-server ▼]  [▶ Live] [↓ Download]  │ │
│          │  │  ┌─────────────────────────────────────────────┐   │ │
│          │  │  │ 14:23:01 ERROR Failed to allocate memory    │   │ │
│          │  │  │ 14:23:01 ERROR Heap size exceeded limit     │   │ │
│          │  │  │ 14:22:59 WARN  Memory usage at 97%          │   │ │
│          │  │  │ 14:22:55 INFO  Processing batch #4521       │   │ │
│          │  │  │ 14:22:50 INFO  Connected to database        │   │ │
│          │  │  │ ...                                          │   │ │
│          │  │  └─────────────────────────────────────────────┘   │ │
│          │  │  🔍 Filter logs...   [All ▼] [Wrap ☑] [Timestamps ☑]│ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
│          │  ┌── AI INSIGHT ──────────────────────────────────────┐ │
│          │  │  🤖 Voyager AI Analysis:                           │ │
│          │  │  This pod is experiencing OOMKilled events. Memory  │ │
│          │  │  limit (512Mi) is insufficient for current workload.│ │
│          │  │  Recommendation: Increase memory limit to 768Mi.   │ │
│          │  │  Estimated cost impact: +$1.20/day.                │ │
│          │  │  [Apply Fix] [Dismiss] [Investigate Further]       │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Sections (top to bottom):**

1. **Status Header:**  Large status badge, restart count (red if > 10), age, node, IP, QoS class, image tag. Action buttons: View YAML, Delete, Exec Shell, Port Forward.

2. **Resource Usage Charts:** Two side-by-side area charts (CPU + Memory). Each shows: request line (dashed green), limit line (dashed red), actual usage (filled area). If usage > 80% of limit, the area fill turns warning yellow. If > 95%, turns critical red. Time range selector: 1h / 6h / 24h / 7d.

3. **Events Timeline:** Vertical timeline with color-coded dots. Most recent at top. Shows event type, reason, message, and age. Auto-scrolls as new events arrive via WebSocket.

4. **Log Viewer:** Full-width monospace log panel. Features:
   - Container selector dropdown (for multi-container pods)
   - Live tail toggle (WebSocket streaming, auto-scroll)
   - Search/filter within logs (regex support)
   - Log level highlighting: ERROR = red bg tint, WARN = yellow bg tint, INFO = default
   - Line wrapping toggle
   - Download as file
   - Virtualized rendering (handles 100K+ lines)

5. **AI Insight Panel:** Contextual AI analysis card. Purple left border (`brand-secondary`). Shows auto-generated root cause analysis based on events + metrics + logs correlation. Action buttons for applying recommended fixes.

### 4.d FinOps Overview

**Purpose:** Cost visibility, optimization recommendations, and budget tracking. Helps platform engineers and finance teams understand and reduce cloud spend.

**URL:** `/finops`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sidebar │  FinOps Overview                  [This Month ▼]  📊    │
│          ├──────────────────────────────────────────────────────────┤
│          │                                                          │
│          │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐│
│          │  │ Total Cost│ │  Forecast │ │  Savings  │ │  Budget  ││
│          │  │ $12,450   │ │  $13,200  │ │  $1,200   │ │  83% ○   ││
│          │  │ ▲ 5% MoM  │ │  +$750    │ │  available│ │  of $15K ││
│          │  └───────────┘ └───────────┘ └───────────┘ └──────────┘│
│          │                                                          │
│          │  ┌── COST TREND (last 12 months) ────────────────────┐ │
│          │  │                                                      │ │
│          │  │  $15K ┤          ╱─────── budget line (dashed)     │ │
│          │  │       │    ╱╲  ╱                                   │ │
│          │  │  $10K ┤   ╱  ╲╱                                    │ │
│          │  │       │  ╱     ▓▓▓▓▓▓▓▓▓  forecast (lighter)     │ │
│          │  │   $5K ┤ ╱                                          │ │
│          │  │       │╱                                            │ │
│          │  │    $0 ┼─────────────────────────────────            │ │
│          │  │       Mar  Apr  May  Jun  Jul  Aug  Sep  Oct       │ │
│          │  │                                                      │ │
│          │  │  [Compute ■] [Storage ■] [Network ■] [Other ■]     │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
│          │  ┌── NAMESPACE COST BREAKDOWN ────────────────────────┐ │
│          │  │  🔍 Search...    [Cluster ▼] [Sort: Cost desc ▼]   │ │
│          │  │                                                      │ │
│          │  │  Namespace       Cluster      CPU$    Mem$    Total │ │
│          │  │  production     prod-eks    $2,100  $1,800  $3,900 │ │
│          │  │  ├─ api-server  prod-eks      $800    $600  $1,400 │ │
│          │  │  ├─ worker      prod-eks      $900    $750  $1,650 │ │
│          │  │  └─ redis       prod-eks      $400    $450    $850 │ │
│          │  │  staging        staging-eks   $800    $600  $1,400 │ │
│          │  │  monitoring     prod-eks      $500    $400    $900 │ │
│          │  │  ...                                                │ │
│          │  │                                                      │ │
│          │  │  ████████████████████  production (31%)             │ │
│          │  │  ██████████           staging (18%)                 │ │
│          │  │  ████████             monitoring (12%)              │ │
│          │  │  ██████               kube-system (9%)              │ │
│          │  │  ████████████████████████████  other (30%)          │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
│          │  ┌── WASTE ALERTS & OPTIMIZATION ────────────────────┐ │
│          │  │                                                      │ │
│          │  │  🔴 $420/mo  Oversized pods in staging             │ │
│          │  │     12 pods requesting 4x actual CPU usage          │ │
│          │  │     [Right-size All] [View Details]                 │ │
│          │  │                                                      │ │
│          │  │  🟡 $380/mo  Idle workloads in dev                 │ │
│          │  │     5 deployments with 0 requests in 7 days        │ │
│          │  │     [Scale to Zero] [View Details]                  │ │
│          │  │                                                      │ │
│          │  │  🟡 $400/mo  Spot instance opportunities           │ │
│          │  │     3 worker nodes eligible for spot pricing        │ │
│          │  │     [View Analysis] [Apply Recommendations]         │ │
│          │  │                                                      │ │
│          │  │  Total savings potential: $1,200/month              │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Sections:**

1. **KPI Row:** 4 metric cards — Total Cost (with MoM trend), Forecast (projected month-end), Savings Available (actionable), Budget Utilization (circular progress variant)

2. **Cost Trend Chart:** Stacked area chart showing cost breakdown by resource type (Compute, Storage, Network, Other) over 12 months. Budget line as horizontal dashed line. Forecast period shown with lighter opacity fill + dashed stroke. Interactive legend toggles series visibility.

3. **Namespace Cost Table:** Expandable tree table showing cost hierarchy: Cluster → Namespace → Workload. Columns: CPU cost, Memory cost, Storage cost, Network cost, Total. Sortable, searchable. Includes horizontal stacked bar below table for visual proportion.

4. **Waste Alerts:** Card list sorted by savings potential (highest first). Each card: severity icon, monthly waste amount (bold, colored), description, affected resource count, action buttons (one-click fix + detail view). Purple AI icon on AI-generated recommendations.

### 4.e Security Dashboard

**Purpose:** Security posture at a glance. Vulnerability management, runtime threat detection, and compliance status.

**URL:** `/security`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sidebar │  Security Dashboard               [All Clusters ▼]  🛡  │
│          ├──────────────────────────────────────────────────────────┤
│          │                                                          │
│          │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐│
│          │  │ Total Vulns│ │ Critical  │ │  Runtime  │ │Compliance││
│          │  │    847     │ │    23     │ │  Alerts   │ │  Score   ││
│          │  │ ▲ 12 new   │ │ 🔴 ▲ 5   │ │    3      │ │  78%     ││
│          │  └───────────┘ └───────────┘ └───────────┘ └──────────┘│
│          │                                                          │
│          │  ┌── SEVERITY BREAKDOWN ──┐  ┌── VULN TREND (30d) ────┐│
│          │  │                        │  │                          ││
│          │  │     ┌──────────┐       │  │  50 ┤  ╱╲               ││
│          │  │     │  🔴 23   │       │  │     │ ╱  ╲  ╱╲          ││
│          │  │   ┌─┤  Critical├─┐     │  │  25 ┤╱    ╲╱  ╲▓▓▓     ││
│          │  │   │ └──────────┘ │     │  │     │            ╲      ││
│          │  │ ┌─┤  🟡 124     ├─┐   │  │   0 ┼──────────────     ││
│          │  │ │ │  High        │ │   │  │     W1  W2  W3  W4      ││
│          │  │ │ ├──────────────┤ │   │  │                          ││
│          │  │ │ │  🔵 312     │ │   │  │  [Critical ■] [High ■]  ││
│          │  │ │ │  Medium      │ │   │  │  [Medium ■]  [Low ■]   ││
│          │  │ └─┤  ⚪ 388     ├─┘   │  └──────────────────────────┘│
│          │  │   │  Low         │     │                              │
│          │  │   └──────────────┘     │                              │
│          │  │    847 Total           │                              │
│          │  └────────────────────────┘                              │
│          │                                                          │
│          │  ┌── TOP VULNERABLE IMAGES ───────────────────────────┐ │
│          │  │  Image                    Crit  High  Med  Pods     │ │
│          │  │  nginx:1.24-alpine          3     8    12    15     │ │
│          │  │  node:18.19-bullseye        2     5    18     8     │ │
│          │  │  redis:7.0.11               1     3     6    12     │ │
│          │  │  python:3.11-slim           0     4    15     4     │ │
│          │  │  custom/api:v2.3.1          2     1     3     2     │ │
│          │  │                                                      │ │
│          │  │  [Scan All Images] [Export Report]                  │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
│          │  ┌── RUNTIME ALERTS ──────────────────────────────────┐ │
│          │  │  🔴 14:23  Suspicious process exec — /bin/sh in    │ │
│          │  │            production/api-server (unexpected shell)  │ │
│          │  │  🟡 13:50  File integrity change — /etc/passwd      │ │
│          │  │            modified in staging/worker-abc12          │ │
│          │  │  🔵 12:30  Network anomaly — unusual egress to      │ │
│          │  │            external IP from production/redis-cache   │ │
│          │  │                                                      │ │
│          │  │  [View All Runtime Events →]                        │ │
│          │  └────────────────────────────────────────────────────┘ │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Sections:**

1. **KPI Row:** Total vulnerabilities, Critical count (red highlight if > 0), Active runtime alerts, Compliance score (progress variant)

2. **Two-column layout:**
   - **Left: Severity Donut Chart** — Donut chart with center showing total count. Segments colored by severity (Critical red, High yellow, Medium blue, Low gray). Click segment to filter table below. Animated segment expansion on hover.
   - **Right: Vulnerability Trend** — Stacked area chart showing new vulnerabilities per week, broken down by severity. Shows if security posture is improving or degrading over time.

3. **Top Vulnerable Images Table:** Sorted by criticality score (weighted: Critical×10 + High×5 + Medium×1). Shows image name, vulnerability counts by severity (as colored badges), running pod count (blast radius). Click image → full CVE detail list with fix versions.

4. **Runtime Alerts Feed:** Real-time stream of runtime security events from Voyager Monitor. Each alert: severity badge, timestamp, alert type, affected pod, description. Click → full alert detail with process tree, file changes, network connections. Actions: Acknowledge, Investigate, Create Rule (suppress future similar events).

### 4.f Alerts Page

**Purpose:** Unified alert management across all domains (ops, cost, security). Single place to triage, acknowledge, and silence alerts.

**URL:** `/alerts`

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sidebar │  Alerts                            [All Clusters ▼]  🔔 │
│          ├──────────────────────────────────────────────────────────┤
│          │                                                          │
│          │  ┌── SEVERITY FILTER ────────────────────────────────┐  │
│          │  │  [🔴 Critical (2)] [🟡 Warning (5)] [🔵 Info (12)]│  │
│          │  │  [All] [Active] [Acknowledged] [Silenced]          │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌── ALERT LIST ─────────────────────────────────────┐  │
│          │  │  🔍 Search alerts...          [Domain ▼] [Sort ▼] │  │
│          │  │                                                    │  │
│          │  │  ┌─ 🔴 CrashLoopBackOff ──────────────────────┐   │  │
│          │  │  │  Cluster: prod-eks │ Pod: api-server-7d4f   │   │  │
│          │  │  │  Firing since: 14:23 (47 min ago) │ Count: 3│   │  │
│          │  │  │  Domain: Ops │ Source: Voyager Monitor       │   │  │
│          │  │  │  [Acknowledge] [Silence 1h ▼] [Investigate]  │   │  │
│          │  │  └─────────────────────────────────────────────┘   │  │
│          │  │                                                    │  │
│          │  │  ┌─ 🔴 Critical CVE Detected ─────────────────┐   │  │
│          │  │  │  Image: nginx:1.24 │ CVE-2026-1234 (9.8)    │   │  │
│          │  │  │  Affects: 15 running pods │ Fix: nginx:1.25  │   │  │
│          │  │  │  Domain: Security │ Source: Trivy Scanner    │   │  │
│          │  │  │  [Acknowledge] [Silence] [View CVE Details]  │   │  │
│          │  │  └─────────────────────────────────────────────┘   │  │
│          │  │                                                    │  │
│          │  │  ┌─ 🟡 Budget 85% Utilized ───────────────────┐   │  │
│          │  │  │  Namespace: team-frontend │ Budget: $5,000   │   │  │
│          │  │  │  Current: $4,250 │ Forecast: $5,400 (over!) │   │  │
│          │  │  │  Domain: FinOps │ Source: Cost Engine        │   │  │
│          │  │  │  [Acknowledge] [Silence] [View Budget]       │   │  │
│          │  │  └─────────────────────────────────────────────┘   │  │
│          │  │                                                    │  │
│          │  │  ┌─ 🟡 Memory > 90% ──────────────────────────┐   │  │
│          │  │  │  Node: staging-eks/worker-1 │ 91% utilized   │   │  │
│          │  │  │  Firing since: 13:50 (1h 20m) │ Count: 8    │   │  │
│          │  │  │  Domain: Ops │ Source: Voyager Monitor       │   │  │
│          │  │  │  [Acknowledged ✓] by Viktor at 14:05        │   │  │
│          │  │  └─────────────────────────────────────────────┘   │  │
│          │  │                                                    │  │
│          │  │  Showing 4 of 19 alerts │ [Load More]              │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Components:**

1. **Severity Filter Bar:** Horizontal toggle buttons with badge counts. Click to filter. Multiple can be active. Includes state filters: All, Active (firing), Acknowledged, Silenced. Counts update in real-time.

2. **Alert List:** Virtualized list of alert cards. Each card contains:
   - **Severity indicator:** Colored left border (3px) + severity dot
   - **Title:** Alert name, bold, `text-base`
   - **Context line:** Affected resource, cluster, relevant identifiers
   - **Timing:** When it started firing, duration, occurrence count
   - **Domain badge:** Ops (blue), FinOps (green), Security (red) — identifies the source domain
   - **Actions:**
     - **Acknowledge:** Mark as seen, stops escalation. Shows who ack'd and when.
     - **Silence:** Dropdown with duration options (1h, 4h, 24h, custom). Suppresses notifications.
     - **Investigate:** Opens AI investigation panel / navigates to affected resource
   - **Acknowledged state:** Muted appearance, shows "Acknowledged ✓ by [user] at [time]"
   - **Silenced state:** Grayed out with ⏸ icon, shows silence expiry time

3. **Search & Filters:**
   - Full-text search across alert name, resource, and description
   - Domain filter: Ops / FinOps / Security / All
   - Cluster filter dropdown
   - Sort: Severity (default), Time (newest/oldest), Count (most frequent)

4. **Real-time updates:** New alerts animate in at the top with a subtle slide-down + highlight effect. Alert count badges in sidebar nav update via WebSocket.

---

## 5. Tailwind CSS Token Configuration

The actual `tailwind.config.ts` file with all design tokens. This is the single source of truth for the Voyager design system.

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // ──────────────────────────────────────
      // COLORS
      // ──────────────────────────────────────
      colors: {
        // Core backgrounds & surfaces
        background: {
          DEFAULT: "hsl(var(--background))",
          deep: "hsl(var(--background-deep))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
        },
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border-subtle))",
          focus: "hsl(var(--border-focus))",
        },

        // Text hierarchy
        foreground: {
          DEFAULT: "hsl(var(--text-primary))",
          secondary: "hsl(var(--text-secondary))",
          muted: "hsl(var(--text-muted))",
          disabled: "hsl(var(--text-disabled))",
        },

        // Brand colors
        brand: {
          DEFAULT: "hsl(var(--brand-primary))",
          hover: "hsl(var(--brand-primary-hover))",
          active: "hsl(var(--brand-primary-active))",
          secondary: "hsl(var(--brand-secondary))",
        },

        // Status / Semantic colors
        status: {
          healthy: {
            DEFAULT: "#22C55E",
            bg: "#22C55E1A",
            border: "#22C55E30",
            text: "#4ADE80",
          },
          warning: {
            DEFAULT: "#EAB308",
            bg: "#EAB3081A",
            border: "#EAB30830",
            text: "#FACC15",
          },
          critical: {
            DEFAULT: "#EF4444",
            bg: "#EF44441A",
            border: "#EF444430",
            text: "#F87171",
          },
          info: {
            DEFAULT: "#3B82F6",
            bg: "#3B82F61A",
            border: "#3B82F630",
            text: "#60A5FA",
          },
          unknown: {
            DEFAULT: "#71717A",
            bg: "#71717A1A",
            border: "#71717A30",
            text: "#A1A1AA",
          },
          ai: {
            DEFAULT: "#A855F7",
            bg: "#A855F71A",
            border: "#A855F730",
            text: "#C084FC",
          },
        },

        // Chart palette
        chart: {
          1: "#6366F1", // Indigo
          2: "#06B6D4", // Cyan
          3: "#10B981", // Emerald
          4: "#F59E0B", // Amber
          5: "#F43F5E", // Rose
          6: "#8B5CF6", // Violet
          7: "#14B8A6", // Teal
          8: "#F97316", // Orange
        },

        // Shadcn/ui compatibility tokens
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        ring: "hsl(var(--ring))",
        input: "hsl(var(--input))",
      },

      // ──────────────────────────────────────
      // TYPOGRAPHY
      // ──────────────────────────────────────
      fontFamily: {
        sans: ["Inter", ...fontFamily.sans],
        mono: ["JetBrains Mono", "Fira Code", ...fontFamily.mono],
      },
      fontSize: {
        xs: ["0.6875rem", { lineHeight: "1rem" }],      // 11px
        sm: ["0.75rem", { lineHeight: "1.125rem" }],     // 12px
        base: ["0.875rem", { lineHeight: "1.375rem" }],  // 14px
        lg: ["1rem", { lineHeight: "1.5rem" }],           // 16px
        xl: ["1.25rem", { lineHeight: "1.75rem" }],       // 20px
        "2xl": ["1.5rem", { lineHeight: "2rem" }],        // 24px
        "3xl": ["1.875rem", { lineHeight: "2.375rem" }],  // 30px
        "4xl": ["2.25rem", { lineHeight: "2.75rem" }],    // 36px
      },

      // ──────────────────────────────────────
      // SPACING (extends default Tailwind scale)
      // ──────────────────────────────────────
      spacing: {
        "sidebar-expanded": "16rem",  // 256px
        "sidebar-collapsed": "4rem",  // 64px
        "header-height": "3.5rem",    // 56px
        "page-max": "90rem",          // 1440px
        "card-gap": "1rem",           // 16px
        "section-gap": "1.5rem",      // 24px
      },

      // ──────────────────────────────────────
      // BORDER RADIUS
      // ──────────────────────────────────────
      borderRadius: {
        lg: "var(--radius)",           // 12px — cards, dialogs
        md: "calc(var(--radius) - 2px)", // 10px — buttons, inputs
        sm: "calc(var(--radius) - 4px)", // 8px — badges, small elements
        pill: "9999px",                 // Fully round — status badges
      },

      // ──────────────────────────────────────
      // ANIMATIONS
      // ──────────────────────────────────────
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-critical": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-down": {
          from: { transform: "translateY(-8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-critical": "pulse-critical 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-down": "slide-down 0.2s ease-out",
      },

      // ──────────────────────────────────────
      // BOX SHADOW
      // ──────────────────────────────────────
      boxShadow: {
        "card": "0 0 0 1px hsl(var(--border))",
        "card-hover": "0 0 0 1px hsl(var(--border)), 0 4px 12px rgba(0,0,0,0.3)",
        "dropdown": "0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px hsl(var(--border))",
        "modal": "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px hsl(var(--border))",
        "focus-ring": "0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--brand-primary))",
      },

      // ──────────────────────────────────────
      // TRANSITIONS
      // ──────────────────────────────────────
      transitionDuration: {
        DEFAULT: "150ms",
        fast: "100ms",
        normal: "200ms",
        slow: "300ms",
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
```

### 5.1 CSS Custom Properties (globals.css)

These CSS variables power the Shadcn/ui + Tailwind color system, enabling dark/light mode switching:

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Light mode (secondary) */
    --background: 0 0% 100%;
    --background-deep: 210 20% 98%;
    --surface: 210 20% 98%;
    --surface-raised: 220 14% 96%;
    --surface-overlay: 220 13% 91%;
    --border: 220 13% 91%;
    --border-subtle: 220 14% 96%;
    --border-focus: 239 84% 67%;
    --text-primary: 224 71% 4%;
    --text-secondary: 220 9% 46%;
    --text-muted: 220 9% 46%;
    --text-disabled: 220 9% 46%;
    --brand-primary: 239 84% 67%;
    --brand-primary-hover: 239 84% 74%;
    --brand-primary-active: 239 84% 60%;
    --brand-secondary: 258 90% 66%;

    /* Shadcn/ui compatibility */
    --primary: 239 84% 67%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 5% 96%;
    --secondary-foreground: 240 6% 10%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --accent: 240 5% 96%;
    --accent-foreground: 240 6% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 4%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 4%;
    --ring: 239 84% 67%;
    --input: 240 6% 90%;
    --radius: 0.75rem;
  }

  .dark {
    /* Dark mode (primary) */
    --background: 240 10% 3.9%;
    --background-deep: 240 12% 2%;
    --surface: 240 8% 7%;
    --surface-raised: 240 8% 11%;
    --surface-overlay: 240 4% 16%;
    --border: 240 4% 16%;
    --border-subtle: 240 6% 12%;
    --border-focus: 239 84% 67%;
    --text-primary: 0 0% 98%;
    --text-secondary: 240 5% 65%;
    --text-muted: 240 4% 46%;
    --text-disabled: 240 4% 34%;
    --brand-primary: 239 84% 67%;
    --brand-primary-hover: 234 89% 74%;
    --brand-primary-active: 243 75% 59%;
    --brand-secondary: 258 90% 66%;

    /* Shadcn/ui compatibility */
    --primary: 239 84% 67%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4% 16%;
    --secondary-foreground: 0 0% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 0 0% 98%;
    --muted: 240 4% 16%;
    --muted-foreground: 240 5% 65%;
    --accent: 240 4% 16%;
    --accent-foreground: 0 0% 98%;
    --popover: 240 8% 7%;
    --popover-foreground: 0 0% 98%;
    --card: 240 8% 7%;
    --card-foreground: 0 0% 98%;
    --ring: 239 84% 67%;
    --input: 240 4% 16%;
    --radius: 0.75rem;
  }

  /* Base styles */
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11"; /* Inter OpenType features */
    font-variant-numeric: tabular-nums;
  }
}

/* Utility classes */
@layer utilities {
  .text-gradient-brand {
    @apply bg-gradient-to-r from-brand to-brand-secondary bg-clip-text text-transparent;
  }

  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--border)) transparent;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: hsl(var(--border));
    border-radius: 3px;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--text-muted));
  }
}
```

---

## 6. Recommended Libraries

### 6.1 Shadcn/ui Components

Shadcn/ui is NOT a component library — it's a collection of re-usable components built on Radix UI primitives that you copy into your project and own. This gives full control over styling and behavior.

**Core components to install (priority order):**

| Component | Voyager Usage | Install Command |
|-----------|--------------|-----------------|
| `button` | CTAs, actions, form submissions | `npx shadcn@latest add button` |
| `card` | Metric cards, cluster cards, alert cards | `npx shadcn@latest add card` |
| `table` | All data tables (pods, nodes, vulns, costs) | `npx shadcn@latest add table` |
| `badge` | Status badges, severity labels, domain tags | `npx shadcn@latest add badge` |
| `dialog` | Modals for confirm actions, YAML viewer, pod exec | `npx shadcn@latest add dialog` |
| `dropdown-menu` | Action menus, filter selects, user menu | `npx shadcn@latest add dropdown-menu` |
| `tabs` | Cluster detail tabs, page section tabs | `npx shadcn@latest add tabs` |
| `input` | Search fields, form inputs, filter text | `npx shadcn@latest add input` |
| `select` | Cluster selector, namespace filter, time range | `npx shadcn@latest add select` |
| `command` | Command palette (Cmd+K) | `npx shadcn@latest add command` |
| `tooltip` | Info tooltips on metric cards, table headers | `npx shadcn@latest add tooltip` |
| `sheet` | Mobile sidebar drawer, detail slide-over panels | `npx shadcn@latest add sheet` |
| `scroll-area` | Log viewer, event timeline, long lists | `npx shadcn@latest add scroll-area` |
| `separator` | Section dividers within cards and panels | `npx shadcn@latest add separator` |
| `skeleton` | Loading states for all data-dependent components | `npx shadcn@latest add skeleton` |
| `toast` | Notification toasts for actions (ack, silence, delete) | `npx shadcn@latest add toast` |
| `alert` | Inline alerts, AI insight panels | `npx shadcn@latest add alert` |
| `progress` | Budget utilization, compliance score, upload progress | `npx shadcn@latest add progress` |
| `avatar` | User avatars in sidebar, alert ack attribution | `npx shadcn@latest add avatar` |
| `popover` | Filter popovers, quick-info panels | `npx shadcn@latest add popover` |
| `collapsible` | Sidebar nav groups, expandable table rows | `npx shadcn@latest add collapsible` |
| `switch` | Toggle settings, live tail toggle | `npx shadcn@latest add switch` |
| `chart` | Recharts wrapper (Shadcn's built-in chart component) | `npx shadcn@latest add chart` |

**Bulk install:**
```bash
npx shadcn@latest add button card table badge dialog dropdown-menu tabs input select command tooltip sheet scroll-area separator skeleton toast alert progress avatar popover collapsible switch chart
```

### 6.2 Chart Library — Recharts

**Package:** `recharts` (v2.x)

**Why Recharts:**
- Native React components (not D3 wrapper) — fits React component model
- Built-in responsive container
- Excellent TypeScript support
- Shadcn/ui has a built-in `<Chart>` wrapper for Recharts with theme integration
- Good performance for real-time data with animation controls
- Supports all three chart types Voyager needs (Area, Bar, Pie/Donut)

**Key components used:**

| Recharts Component | Voyager Feature |
|-------------------|-----------------|
| `<AreaChart>` + `<Area>` | Time-series: CPU, memory, cost trends, error rates |
| `<BarChart>` + `<Bar>` | Namespace cost comparisons, vulnerability counts by severity |
| `<PieChart>` + `<Pie>` | Vulnerability severity donut, resource allocation breakdown |
| `<ResponsiveContainer>` | All charts — enables container-query responsive behavior |
| `<Tooltip>` | Custom-styled tooltips matching Voyager design tokens |
| `<Legend>` | Chart legends for multi-series data |
| `<CartesianGrid>` | Subtle grid lines (dashed, `border-subtle` color) |
| `<XAxis>` / `<YAxis>` | Axis labels with Voyager typography |
| `<ReferenceLine>` | Budget lines, threshold markers, SLO targets |

**Chart theme configuration:**
```typescript
// lib/chart-theme.ts
export const chartTheme = {
  grid: {
    stroke: "hsl(240 6% 12%)",     // border-subtle
    strokeDasharray: "4 4",
  },
  axis: {
    tick: { fill: "hsl(240 4% 46%)" },  // text-muted
    fontSize: 11,
    fontFamily: "Inter, sans-serif",
  },
  tooltip: {
    contentStyle: {
      backgroundColor: "hsl(240 4% 16%)",  // surface-overlay
      border: "1px solid hsl(240 4% 16%)", // border
      borderRadius: "8px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      fontSize: "12px",
      fontFamily: "Inter, sans-serif",
    },
    labelStyle: { color: "hsl(0 0% 98%)" },  // text-primary
    itemStyle: { color: "hsl(240 5% 65%)" },  // text-secondary
  },
  colors: [
    "#6366F1", "#06B6D4", "#10B981", "#F59E0B",
    "#F43F5E", "#8B5CF6", "#14B8A6", "#F97316",
  ],
};
```

### 6.3 Table Library — TanStack Table

**Package:** `@tanstack/react-table` (v8.x)

**Why TanStack Table:**
- Headless — pairs perfectly with Shadcn/ui `<Table>` for complete styling control
- Built-in: sorting, filtering, pagination, row selection, column resizing, column visibility
- Excellent TypeScript support with type-safe column definitions
- Supports server-side operations (sorting/filtering on backend for large datasets)
- Virtualization support via `@tanstack/react-virtual` for 1000+ row tables

**Companion packages:**
```json
{
  "@tanstack/react-table": "^8.x",
  "@tanstack/react-virtual": "^3.x"
}
```

**Standard table features across Voyager:**

| Feature | Implementation |
|---------|---------------|
| **Sorting** | Click column header to cycle: unsorted → ascending → descending. Multi-sort with Shift+Click. |
| **Filtering** | Global search + per-column faceted filters. Debounced input (300ms). |
| **Pagination** | 50 rows default. Options: 25, 50, 100. Server-side for large datasets. |
| **Row selection** | Checkbox column. Bulk actions appear in floating action bar when rows selected. |
| **Column visibility** | Configurable via dropdown. Persisted in localStorage per-table. |
| **Column resizing** | Drag handles on header borders. Min-width enforced per column type. |
| **Virtualization** | Enabled when dataset > 100 rows. Row height: 44px fixed for virtual scroll. |
| **Empty state** | Centered message with optional illustration when filters return 0 results. |
| **Loading state** | Skeleton rows (Shadcn `<Skeleton>` component) matching table structure. |

### 6.4 Icon Set — Lucide

**Package:** `lucide-react`

**Why Lucide:**
- Fork of Feather Icons with 1400+ icons and active development
- Tree-shakeable — only imports icons you use
- Consistent 24px grid, 2px stroke weight
- Clean, minimal aesthetic that matches Voyager's design language
- First-class React components with TypeScript

**Standard icon size by context:**

| Context | Size (px) | Stroke Width |
|---------|-----------|-------------|
| Sidebar nav items | 18 | 2 |
| Table actions | 16 | 2 |
| Button icons (with label) | 16 | 2 |
| Metric card icons | 20 | 1.5 |
| Page header icons | 24 | 2 |
| Empty state illustrations | 48 | 1.5 |
| Status badge dots | 6 (custom circle) | — |

**Voyager icon mapping:**

| Concept | Lucide Icon | Notes |
|---------|-------------|-------|
| Dashboard / Home | `LayoutDashboard` | |
| Clusters | `Server` | |
| Nodes | `HardDrive` | |
| Pods | `Box` | |
| Workloads / Deployments | `Layers` | |
| Namespaces | `FolderTree` | |
| FinOps / Costs | `DollarSign` | |
| Optimization | `TrendingDown` | Cost reduction |
| Security | `Shield` | |
| Vulnerabilities | `ShieldAlert` | |
| Runtime | `Lock` | |
| Compliance | `ClipboardCheck` | |
| Alerts | `Bell` | With dot badge for active count |
| AI Assistant | `Bot` | Or `Sparkles` for AI features |
| Settings | `Settings` | |
| User | `User` | |
| Search | `Search` | |
| Filter | `Filter` | |
| Sort ascending | `ArrowUp` | |
| Sort descending | `ArrowDown` | |
| Expand / Chevron | `ChevronRight` | Rotates 90° when expanded |
| External link | `ExternalLink` | |
| Copy | `Copy` | |
| Download | `Download` | |
| Refresh | `RefreshCw` | |
| Healthy / Success | `CheckCircle2` | With status-healthy color |
| Warning | `AlertTriangle` | With status-warning color |
| Critical / Error | `XCircle` | With status-critical color |
| Info | `Info` | With status-info color |
| Cloud providers | Custom SVGs | AWS, Azure, GCP logos |
| Kubernetes | Custom SVG | K8s logo for cluster type |

### 6.5 Additional Recommended Libraries

| Package | Purpose | Why |
|---------|---------|-----|
| `date-fns` | Date formatting, relative time ("3 min ago") | Lightweight, tree-shakeable, no locale overhead |
| `nuqs` | URL search params state | Type-safe URL state for filters, pagination, time ranges |
| `cmdk` | Command palette (powers Shadcn `<Command>`) | Fast, accessible, keyboard-first navigation |
| `sonner` | Toast notifications | Beautiful, stackable toasts — better than default Shadcn toast |
| `vaul` | Drawer component (mobile sidebar) | Smooth, gesture-based drawer for mobile |
| `zustand` | Client state management | Lightweight, no boilerplate for sidebar state, user preferences |
| `@tanstack/react-query` | Server state / API caching | Automatic refetching, optimistic updates, WebSocket integration |
| `socket.io-client` | WebSocket client | Real-time alerts, live logs, metric streaming |
| `react-hotkeys-hook` | Keyboard shortcuts | Cmd+K, Cmd+B, Escape handlers |
| `next-themes` | Dark/light mode toggle | SSR-safe theme switching, syncs with system preference |
| `clsx` + `tailwind-merge` | Conditional class composition | Shadcn's `cn()` utility — essential for component variants |
| `zod` | Schema validation | Form validation, API response validation, type inference |

---

## Appendix: Design Principles

### A.1 Information Hierarchy

Every page follows this hierarchy:
1. **Health signal** — Is everything OK? (status badges, health scores)
2. **Anomalies** — What needs attention? (alerts, warnings, critical metrics)
3. **Trends** — Is it getting better or worse? (sparklines, trend arrows)
4. **Details** — The full picture (tables, charts, logs)

### A.2 Progressive Disclosure

- Dashboard Home → surface-level KPIs and fleet overview
- Cluster Detail → drill into a specific cluster's resources
- Pod Detail → deepest level with logs, events, resource charts
- Each level adds detail without overwhelming the previous view

### A.3 Consistent Interaction Patterns

| Action | Pattern |
|--------|---------|
| Navigate deeper | Click card / row → detail page |
| Quick actions | Right-click / kebab menu (⋮) |
| Global search | `Cmd + K` command palette |
| Toggle sidebar | `Cmd + B` |
| Refresh data | `Cmd + R` or refresh button |
| Close modal/panel | `Escape` key |
| Bulk actions | Select rows → floating action bar |

### A.4 Responsive Breakpoints

| Breakpoint | Width | Layout Changes |
|-----------|-------|----------------|
| `sm` | ≥640px | Single column, stacked cards |
| `md` | ≥768px | Two-column layouts begin |
| `lg` | ≥1024px | Sidebar visible, three-column grids |
| `xl` | ≥1280px | Full layout, expanded data tables |
| `2xl` | ≥1536px | Maximum content width (1440px), centered |

### A.5 Performance Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| First Contentful Paint | < 1.0s | SSR via Next.js App Router |
| Largest Contentful Paint | < 2.0s | Streaming, lazy chart loading |
| Time to Interactive | < 2.5s | Code splitting per route |
| Table render (1000 rows) | < 100ms | TanStack Virtual + fixed row height |
| Chart render | < 200ms | Recharts with animation disabled on > 500 points |
| Real-time update latency | < 500ms | WebSocket + optimistic UI |

---

*This specification is the foundation for all Voyager Platform UI development. It should be treated as a living document — updated as new patterns emerge and design decisions are refined during implementation.*
