# BOARD-P3-SPECS.md — Implementation-Ready Specs for Phase 3

**Generated:** 2026-03-06 | **Full specs:** `~/Documents/vkzone/Research/voyager-p3-design-specs-2026-03-06.md`

---

## M-P3-002: Real-Time Time-Series Resource Charts (15h | Readiness: 9/10)

**What:** Per-cluster CPU/Memory/Pod time-series charts on cluster detail page, new "Metrics" tab.

**Backend:**
- Add `metrics.history` tRPC procedure: `{ clusterId: uuid, range: '1h'|'6h'|'24h'|'7d' }` → bucketed `metricsHistory` rows
- Add `metrics.nodeBreakdown` procedure: live per-node snapshot from K8s metrics-server
- Extend `timeRangeSchema` with `'1h'` (60 1-min buckets) and `'6h'` (72 5-min buckets)

**Frontend:**
- New `apps/web/src/components/metrics/` directory with:
  - `MetricsTimeSeriesPanel.tsx` — container, manages range + auto-refresh state
  - `TimeRangeSelector.tsx` — segmented control `[1h][6h][24h][7d]`
  - `MetricsAreaChart.tsx` — Recharts AreaChart, gradient fills, linked crosshairs
  - `NodeResourceBreakdown.tsx` — per-node resource bars, expandable
  - `AutoRefreshToggle.tsx` — toggle + interval selector (30s/1m/5m)
  - `MetricsEmptyState.tsx` — "Collecting data..." with illustration
- Modify `apps/web/src/app/clusters/[id]/page.tsx`: add Metrics tab
- Extend `chart-theme.ts` with '1h' and '6h' formatTimestamp cases

**Colors:** CPU=`hsl(262,83%,58%)` Memory=`hsl(199,89%,48%)` Pods=`hsl(142,71%,45%)`

---

## M-P3-003: AI Inline Integration (22h | Readiness: 8/10)

**What:** Contextual AI triggers throughout app — anomaly cards, pod detail, alerts, dashboard banner, command palette.

**Backend:**
- Add `ai.contextChat` tRPC procedure (or extend `ai.chat`): accepts `{ prompt, context: { type, data } }`, streams response
- Add `ai.proactiveInsights` procedure: returns AI-generated insights for critical events

**Frontend:**
- New `apps/web/src/components/ai/` additions:
  - `InlineAiTrigger.tsx` — sparkle button (✨) with variants: button/icon/banner. Gated by BYOK key.
  - `InlineAiPanel.tsx` — expandable card with streaming response, follow-up input. Purple left border, animated expand.
  - `AiInsightBanner.tsx` — dashboard banner for proactive insights, gradient border purple→teal
  - `AiCommandPaletteProvider.tsx` — detects "Ask AI:" prefix in command palette
- Modify existing:
  - `AnomalyCard.tsx` → add InlineAiTrigger "Explain this anomaly"
  - `PodDetailSheet.tsx` → add InlineAiTrigger in header "Ask AI about this pod"
  - Alerts page → add InlineAiTrigger "Get remediation suggestions"
  - Dashboard `page.tsx` → add AiInsightBanner at top
  - `CommandPalette.tsx` → add natural language detection

**Context scoping:** Each trigger sends specific data (anomaly details, pod info, alert data) — see full spec for exact payloads.

---

## M-P3-004: Customizable Dashboard Widgets (30h | Readiness: 7/10)

**What:** Drag-and-drop dashboard with add/remove/reorder/resize widgets.

**Library:** `react-grid-layout` (install: `pnpm add react-grid-layout @types/react-grid-layout`)

**Backend:**
- New DB table `dashboard_layouts`: `id uuid PK, user_id uuid UNIQUE FK→users, layout jsonb, updated_at timestamptz`
- New Drizzle schema: `packages/db/src/schema/dashboard-layouts.ts`
- New tRPC: `dashboardLayout.get` (returns user's layout or null) + `dashboardLayout.save` (upserts layout)

**Frontend:**
- New `apps/web/src/components/dashboard/` additions:
  - `DashboardGrid.tsx` — ResponsiveGridLayout wrapper (12-col, 80px row height)
  - `DashboardEditBar.tsx` — sticky toolbar: [+Add Widget] [Reset] ... [Cancel] [Save]
  - `WidgetLibraryDrawer.tsx` — right slide-out with widget type cards
  - `WidgetWrapper.tsx` — container with drag handle, config gear, remove X (edit mode)
  - `WidgetConfigModal.tsx` — per-widget settings
  - `widgets/` subfolder with: StatCardsWidget, ClusterHealthWidget, ResourceChartsWidget, AlertFeedWidget, AnomalyTimelineWidget, DeploymentListWidget, LogTailWidget, PodStatusWidget
- New Zustand store: `apps/web/src/stores/dashboard-layout.ts` — layout state + persist
- Modify `apps/web/src/app/page.tsx` — replace hardcoded layout with DashboardGrid

**Default layout** = current dashboard (stat cards row → cluster grid → anomaly timeline). New users see this.

**Widget sizes (grid units):** stat-cards 12×2, cluster-health 12×5, resource-charts 6×4, alert-feed 6×4, anomaly-timeline 12×3

---

## Execution Order

1. **M-P3-002** (15h) — foundational charts, needed by widget system
2. **M-P3-003** (22h) — AI integration, independent but uses existing infra
3. **M-P3-004** (30h) — wraps everything into customizable widgets

**Total: 67 hours (~8.5 dev days)**
