# Accessibility Audit Report — Voyager Platform Web Frontend

**Audit Date:** 2026-03-27
**Standard:** WCAG 2.2 AA
**Scope:** All components and pages in `apps/web/src/`
**Total findings:** 78

---

## Table of Contents

1. [Color Contrast](#1-color-contrast)
2. [ARIA Attributes & Roles](#2-aria-attributes--roles)
3. [Keyboard Navigation & Focus](#3-keyboard-navigation--focus)
4. [Screen Reader & Live Regions](#4-screen-reader--live-regions)
5. [Form Accessibility](#5-form-accessibility)
6. [Motion & Animation](#6-motion--animation)
7. [Touch Targets](#7-touch-targets)
8. [Semantic HTML](#8-semantic-html)
9. [Charts & Data Visualization](#9-charts--data-visualization)
10. [Dynamic Content & SSE](#10-dynamic-content--sse)

---

## 1. Color Contrast

Computed via WCAG relative luminance formula against actual CSS custom property values.

### [P0] `--color-text-muted` on card backgrounds fails AA (dark mode)

- **File:** `apps/web/src/app/globals.css:96`
- **Issue:** `--color-text-muted: #6b7994` on `--color-bg-card: #14141f` yields **4.16:1** contrast ratio. AA requires 4.5:1 for normal text.
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Lighten `--color-text-muted` to at least `#7a8aa5` (~4.8:1) or `#8090ab` (~5.3:1)
- **Priority:** P0 (blocker) — this color is used across the entire app for secondary labels, timestamps, descriptions

### [P0] `--color-log-line-number` fails AA and AAA on all dark backgrounds

- **File:** `apps/web/src/app/globals.css:166`
- **Issue:** `--color-log-line-number: #4b5563` on `--color-bg-card: #14141f` yields **2.42:1**. On `--elevated: #1e1e2e` yields **2.17:1**. Both fail AA for normal AND large text.
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Lighten to at least `#7a8594` (~4.5:1 on card) or `#8893a3` (~5.5:1)
- **Priority:** P0 (blocker) — log line numbers unreadable for low-vision users

### [P1] `--color-log-dim` fails AA on card backgrounds (dark mode)

- **File:** `apps/web/src/app/globals.css:167`
- **Issue:** `--color-log-dim: #6b7280` on `--color-bg-card: #14141f` yields **3.78:1**. Fails AA normal text (needs 4.5:1).
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Lighten to at least `#7f8a98` (~4.6:1)
- **Priority:** P1 (high)

### [P1] `--color-text-muted` and `--color-text-dim` fail on elevated backgrounds (dark mode)

- **File:** `apps/web/src/app/globals.css:96-97`
- **Issue:** `--color-text-muted: #6b7994` on `--elevated: #1e1e2e` = **3.74:1**. `--color-text-dim: #718096` on elevated = **4.08:1**. Both fail AA normal.
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Same lighten fix as above; or darken `--elevated` slightly
- **Priority:** P1 (high) — affects hover states, tooltips, expanded sections

### [P1] `--color-status-idle` fails AA on card backgrounds (dark mode)

- **File:** `apps/web/src/app/globals.css:105`
- **Issue:** `--color-status-idle: #6b7994` on `--color-bg-card: #14141f` = **4.16:1**. Same value as text-muted.
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Lighten to `#7a8aa5` or above
- **Priority:** P1 (high)

### [P1] `--color-accent` fails AA on light backgrounds

- **File:** `apps/web/src/app/globals.css:216`
- **Issue:** `--color-accent: #6366f1` on `--color-bg-card (light): #ffffff` = **4.47:1**. On `--color-bg-primary (light): #f8fafc` = **4.27:1**. On `--color-bg-secondary (light): #f1f5f9` = **4.08:1**. All fail AA for normal text.
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Darken light-mode accent to `#4f46e5` (~6.4:1 on white) or `#5548e5`
- **Priority:** P1 (high) — accent color used for links, active states, interactive elements

### [P2] `--color-status-healthy` (light) and `--color-chart-mem` (light) fail AA

- **File:** `apps/web/src/app/globals.css:205,209`
- **Issue:** `--color-status-healthy (light): #059669` on white = **3.77:1**. `--color-chart-mem: #10b981` on white = **2.54:1** (fails large text too).
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Darken healthy green to `#047857` (~5.0:1). For chart, use `#047857` or add text labels.
- **Priority:** P2 (medium)

### [P2] `--color-chart-cpu` (#6366f1) fails AA on both dark and light card backgrounds

- **File:** `apps/web/src/app/globals.css:111`
- **Issue:** On dark card = **4.09:1**, on white = **4.47:1**. Both fail AA normal text.
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Fix:** Charts should not rely on color alone; add text labels. See Charts section.
- **Priority:** P2 (medium)

### Contrast summary table (dark mode, on `#14141f` card)

| Token | Hex | Ratio | AA Normal | AA Large |
|-------|-----|-------|-----------|----------|
| text-primary | #e8ecf4 | 15.43:1 | PASS | PASS |
| text-secondary | #a0aec0 | 8.10:1 | PASS | PASS |
| text-secondary-strong | #b7c3d8 | 10.27:1 | PASS | PASS |
| text-muted | #6b7994 | **4.16:1** | **FAIL** | PASS |
| text-dim | #718096 | 4.55:1 | PASS | PASS |
| table-header | #8f9bb0 | 6.51:1 | PASS | PASS |
| table-meta | #a9b6cb | 8.91:1 | PASS | PASS |
| status-idle | #6b7994 | **4.16:1** | **FAIL** | PASS |
| status-healthy | #10b981 | 7.20:1 | PASS | PASS |
| status-error | #ff4d6a | 5.67:1 | PASS | PASS |
| status-warning | #f6c042 | 10.91:1 | PASS | PASS |
| accent | #7c8cf8 | 6.06:1 | PASS | PASS |
| log-line-number | #4b5563 | **2.42:1** | **FAIL** | **FAIL** |
| log-dim | #6b7280 | **3.78:1** | **FAIL** | PASS |

### Contrast summary table (light mode, on `#ffffff` card)

| Token | Hex | Ratio | AA Normal | AA Large |
|-------|-----|-------|-----------|----------|
| text-primary | #1a202c | 16.32:1 | PASS | PASS |
| text-secondary | #243246 | 12.97:1 | PASS | PASS |
| text-muted | #2f4158 | 10.41:1 | PASS | PASS |
| text-dim | #3d4f66 | 8.37:1 | PASS | PASS |
| table-header | #1b2b42 | 14.28:1 | PASS | PASS |
| accent | #6366f1 | **4.47:1** | **FAIL** | PASS |
| status-healthy | #059669 | **3.77:1** | **FAIL** | PASS |
| chart-cpu | #6366f1 | **4.47:1** | **FAIL** | PASS |
| chart-mem | #10b981 | **2.54:1** | **FAIL** | **FAIL** |

---

## 2. ARIA Attributes & Roles

### [P0] Dialog/Sheet missing `role="dialog"` and focus trap

- **File:** `apps/web/src/components/ui/dialog.tsx:49`
- **Issue:** Custom dialog implementation lacks `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`. Close button (line 61-66) has icon only with no `aria-label`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:**
  ```tsx
  // dialog.tsx - add to dialog container
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  // Close button
  <button aria-label="Close dialog">
  ```
- **Priority:** P0 (blocker)

### [P0] Sheet missing `role="dialog"` and focus trap

- **File:** `apps/web/src/components/ui/sheet.tsx:45`
- **Issue:** SheetContent lacks `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` connecting to SheetTitle. No focus trap implementation.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `role="dialog" aria-modal="true" aria-labelledby="sheet-title"` to SheetContent. Implement focus trap (or use `@radix-ui/react-focus-scope`).
- **Priority:** P0 (blocker)

### [P1] Missing `aria-current="page"` on active navigation items

- **File:** `apps/web/src/components/Sidebar.tsx:155-257`
- **Issue:** Active sidebar nav items have visual styling (color, bg) but no `aria-current="page"`. Screen reader users cannot identify current page.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-current={isNavActive ? 'page' : undefined}` to each `<Link>` in the nav
- **Priority:** P1 (high)

### [P1] Missing `aria-current="page"` on cluster sub-nav

- **File:** `apps/web/src/components/Sidebar.tsx:299-316`
- **Issue:** Active cluster links in expanded sub-nav lack `aria-current`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-current={isClusterActive ? 'page' : undefined}`
- **Priority:** P1 (high)

### [P1] Missing `aria-current="page"` on breadcrumb current item

- **File:** `apps/web/src/components/Breadcrumbs.tsx:73-79`
- **Issue:** Last breadcrumb crumb (current page) has no `aria-current="page"`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-current="page"` to the final `<span>` element
- **Priority:** P1 (high)

### [P1] Missing `aria-current="page"` on shared PageHeader breadcrumb

- **File:** `apps/web/src/components/shared/PageHeader.tsx:37-39`
- **Issue:** Same as above but in the shared PageHeader component.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}` to last `<span>`
- **Priority:** P1 (high)

### [P1] Cluster detail tabs missing ARIA tabs pattern

- **File:** `apps/web/src/app/clusters/[id]/layout.tsx:192-223`
- **Issue:** Tab navigation built with `<Link>` elements inside `<nav>`. No `role="tablist"`, `role="tab"`, `aria-selected`. Keyboard shortcuts (1-9, [, ]) exist but screen readers announce links, not tabs.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `role="tablist"` to container, `role="tab" aria-selected={isActive}` to each link, and `role="tabpanel"` to content area.
- **Priority:** P1 (high)

### [P1] PodDetailSheet tabs missing ARIA tabs pattern

- **File:** `apps/web/src/components/PodDetailSheet.tsx:411-430`
- **Issue:** Tab buttons lack `role="tab"`, `aria-selected`, `aria-controls`. Container at line 411 missing `role="tablist"`. Content divs missing `role="tabpanel"`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Apply full ARIA tabs pattern
- **Priority:** P1 (high)

### [P1] Progress bar missing ARIA value attributes

- **File:** `apps/web/src/components/ui/progress.tsx:10-20`
- **Issue:** Progress component uses manual `translateX` transform but does not expose `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, or `aria-label`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"` to root
- **Priority:** P1 (high)

### [P1] StatusBadge color-only status indication

- **File:** `apps/web/src/components/shared/StatusBadge.tsx:50-60`
- **Issue:** When `dot={true}`, only a colored circle renders with NO text. Status conveyed by color alone. Root `<span>` has no `role` or `aria-label`.
- **WCAG Criterion:** 1.4.1 Use of Color; 4.1.2 Name, Role, Value
- **Fix:** Add `role="status" aria-label={`Status: ${label}`}` and ensure text label is always present (even if `sr-only`).
- **Priority:** P1 (high)

### [P2] Badge component has no semantic role

- **File:** `apps/web/src/components/ui/badge.tsx:27`
- **Issue:** Badge is a generic `<div>` with no role. Color-coded variants (destructive, success, warning) rely entirely on color.
- **WCAG Criterion:** 1.4.1 Use of Color
- **Fix:** Support optional `role="status"` prop. Ensure text content conveys meaning independent of color.
- **Priority:** P2 (medium)

### [P2] Sidebar missing `aria-label`

- **File:** `apps/web/src/components/Sidebar.tsx:101`
- **Issue:** `<aside>` element has no `aria-label`. Screen readers cannot distinguish this from other `<aside>` elements.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-label="Primary navigation"` to `<aside>`
- **Priority:** P2 (medium)

### [P2] Breadcrumbs nav missing `aria-label`

- **File:** `apps/web/src/components/Breadcrumbs.tsx:67`
- **Issue:** `<nav>` element lacks `aria-label="Breadcrumb"`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-label="Breadcrumb"` to `<nav>`
- **Priority:** P2 (medium)

### [P2] Logo image `alt` + `aria-hidden` conflict

- **File:** `apps/web/src/components/AppLayout.tsx:137-142`; `apps/web/src/components/TopBar.tsx:137-142`
- **Issue:** Logo `<img>` has both `alt="Voyager"` and `aria-hidden="true"`. The `alt` is ignored when `aria-hidden` is set, but this is confusing and flagged by tools.
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Fix:** Remove `alt` attribute (or set `alt=""`) since the adjacent text "VOYAGER" provides context, and keep `aria-hidden="true"`.
- **Priority:** P2 (medium)

### [P2] Notifications panel missing semantic structure

- **File:** `apps/web/src/components/NotificationsPanel.tsx:141-229`
- **Issue:** Bell button lacks `aria-label` with unread count. Panel has no `role="region"`. "Notifications" heading is plain text (not `<h2>`). Category filter tabs lack `role="tab"`. Notification items are unsemantic `<div>`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-label="Notifications, {count} unread"` to button. Add `role="region" aria-label="Notifications panel"` to panel. Use `<h2>` heading. Add `role="tablist"` and `role="tab"` to filters.
- **Priority:** P2 (medium)

### [P2] ApiTokens tabs missing ARIA semantics

- **File:** `apps/web/src/components/settings/ApiTokens.tsx:186-194`
- **Issue:** Category filter buttons lack `role="tab"` and `aria-selected`. Container missing `role="tablist"`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add proper ARIA tab roles
- **Priority:** P2 (medium)

### [P3] Sidebar chevron icon missing `aria-hidden`

- **File:** `apps/web/src/components/Sidebar.tsx:247-256`
- **Issue:** `<ChevronDown>` icon has no `aria-hidden="true"`. Since parent has `aria-expanded`, icon is redundant.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-hidden="true"` to `<ChevronDown>`
- **Priority:** P3 (low)

### [P3] Home breadcrumb icon missing `aria-hidden`

- **File:** `apps/web/src/components/Breadcrumbs.tsx:86`
- **Issue:** `<Home>` Lucide icon has no `aria-hidden="true"`. Link has `title` but icon may be read by screen readers.
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Fix:** Add `aria-hidden="true"` and ensure the link has an accessible name via `aria-label="Home"`
- **Priority:** P3 (low)

---

## 3. Keyboard Navigation & Focus

### [P0] Dialog and Sheet lack focus traps

- **File:** `apps/web/src/components/ui/dialog.tsx:20-27`; `apps/web/src/components/ui/sheet.tsx:15-22`
- **Issue:** Both handle Escape key but do NOT implement focus trapping. Keyboard users can Tab to background elements while dialog/sheet is open.
- **WCAG Criterion:** 2.1.2 No Keyboard Trap (inverse — must trap focus IN modal)
- **Fix:** Wrap content with `@radix-ui/react-focus-scope` or implement manual focus trap
- **Priority:** P0 (blocker)

### [P1] ThemeToggle listbox keyboard navigation

- **File:** `apps/web/src/components/ThemeToggle.tsx:72-105`
- **Issue:** Listbox with `role="listbox"` and `role="option"` lacks arrow key navigation. No `aria-activedescendant`. Users must Tab through all options.
- **WCAG Criterion:** 2.1.1 Keyboard
- **Fix:** Implement arrow key navigation with `aria-activedescendant` or use Radix Select
- **Priority:** P1 (high)

### [P2] Dashboard widget drag-and-drop has no keyboard alternative

- **File:** `apps/web/src/components/dashboard/WidgetWrapper.tsx:41-46`
- **Issue:** Drag handle `<div title="Drag to reorder">` has no `aria-label`, no `role`, and no keyboard interaction. Keyboard users cannot reorder widgets.
- **WCAG Criterion:** 2.1.1 Keyboard
- **Fix:** Add `role="button" aria-label="Reorder widget" tabIndex={0}` with keyboard event handlers, or provide a separate "Move up/down" button pair.
- **Priority:** P2 (medium) — dashboard editing is secondary functionality

### [P2] WidgetWrapper settings/remove buttons missing `aria-label`

- **File:** `apps/web/src/components/dashboard/WidgetWrapper.tsx:53,63`
- **Issue:** Icon-only buttons have `title` but no `aria-label`. `title` is not reliably announced by screen readers.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-label="Widget settings"` and `aria-label="Remove widget"`
- **Priority:** P2 (medium)

---

## 4. Screen Reader & Live Regions

### [P0] ConnectionStatus changes not announced

- **File:** `apps/web/src/components/TopBar.tsx:211-257`
- **Issue:** Connection status (Live/Disconnected/Reconnecting) changes dynamically but has no `aria-live` region. Screen reader users won't know when connection drops.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-live="polite" role="status"` to the status container div
- **Priority:** P0 (blocker) — connection loss is critical information

### [P0] AI chat streaming responses not announced

- **File:** `apps/web/src/components/ai/AiChat.tsx:522-566`
- **Issue:** AI streaming responses appear in chat via `updateStreamingContent()` but chat container has no `aria-live` region. Screen readers are silent during AI response streaming.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-live="polite" aria-atomic="false"` to the message container
- **Priority:** P0 (blocker)

### [P1] SSEIndicator state changes not announced

- **File:** `apps/web/src/components/SSEIndicator.tsx:21-26`
- **Issue:** Connection state indicator has no `role="status"` or `aria-live`. State changes (Connecting, Connected, Disconnected, Reconnecting) are silent.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `role="status" aria-live="polite" aria-label={`Server connection: ${config.label}`}`
- **Priority:** P1 (high)

### [P1] LoadingState component has no ARIA

- **File:** `apps/web/src/components/LoadingState.tsx:5-8`
- **Issue:** Spinning loader has no `role`, `aria-busy`, or `aria-label`. Screen readers cannot detect loading state.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `role="status" aria-busy="true" aria-label="Loading"` and `aria-live="polite"` on message
- **Priority:** P1 (high)

### [P1] AuthGuard loading state not announced

- **File:** `apps/web/src/components/AuthGuard.tsx:74-79`
- **Issue:** Loading h1 "Loading..." has no `role="status"` or `aria-live`.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `role="status" aria-live="polite"` to the loading element
- **Priority:** P1 (high)

### [P1] DataTable loading skeleton not announced

- **File:** `apps/web/src/components/DataTable.tsx:283-330`
- **Issue:** Table loading skeleton animates in but table is not marked `aria-busy="true"`. No live region announcement.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-busy={isLoading}` to `<table>` element when loading
- **Priority:** P1 (high)

### [P1] Notification severity not accessible

- **File:** `apps/web/src/components/NotificationsPanel.tsx:207-209`
- **Issue:** Notification severity indicated by left border color only. No `aria-label` with severity level.
- **WCAG Criterion:** 1.4.1 Use of Color
- **Fix:** Add `aria-label={`${severity} notification: ${message}`}` to each notification item
- **Priority:** P1 (high)

### [P2] ErrorBoundary error not announced as alert

- **File:** `apps/web/src/components/ErrorBoundary.tsx:44-46`
- **Issue:** Error heading lacks `role="alert"` or `aria-live="assertive"`.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `role="alert"` to the error container
- **Priority:** P2 (medium)

### [P2] FilterBar active filters not announced

- **File:** `apps/web/src/components/FilterBar.tsx:196-204`
- **Issue:** Active filter chips appear/disappear with no `aria-live` region. Screen reader users don't know filters changed.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Wrap filter chips in `<div aria-live="polite" aria-label="Active filters">`
- **Priority:** P2 (medium)

### [P2] PresenceBar lacks accessible context

- **File:** `apps/web/src/components/PresenceBar.tsx:29-52`
- **Issue:** Online user count uses `title` but no `aria-label`. Status dot has no `aria-hidden`. Tooltip on avatar only visible on hover (not keyboard focus).
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-label={`${count} users online`}` to container. Add `aria-hidden="true"` to status dots.
- **Priority:** P2 (medium)

### [P2] Anomaly action buttons missing labels

- **File:** `apps/web/src/components/anomalies/AnomalyCard.tsx:101,112`
- **Issue:** Acknowledge (ShieldCheck) and Resolve (CheckCircle2) buttons have icon only with no `aria-label`.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-label="Acknowledge anomaly"` and `aria-label="Resolve anomaly"`
- **Priority:** P2 (medium)

### [P3] ConfirmDialog loading state not announced

- **File:** `apps/web/src/components/ConfirmDialog.tsx:57-64`
- **Issue:** Confirm button text changes to "Processing..." during loading but no `aria-busy` attribute.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-busy={loading}` to confirm button
- **Priority:** P3 (low)

---

## 5. Form Accessibility

### [P1] FilterBar search input missing label

- **File:** `apps/web/src/components/FilterBar.tsx:122-134`
- **Issue:** Search input uses `placeholder="Search clusters... (press /)"` but no `<label>` or `aria-label`.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Add `aria-label="Search clusters"` to the input
- **Priority:** P1 (high)

### [P1] FilterBar select elements missing labels

- **File:** `apps/web/src/components/FilterBar.tsx:148-150`
- **Issue:** `<select>` elements for environment/status filters have no `<label>` or `aria-label`.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Add `aria-label="Filter by environment"` etc. to each select
- **Priority:** P1 (high)

### [P1] AddClusterWizard inputs lack id/htmlFor pairing

- **File:** `apps/web/src/components/AddClusterWizard.tsx:399-500`
- **Issue:** Form labels use `<label>` with text but inputs lack `id` attributes. Labels have no `htmlFor` attribute, so they are not programmatically associated.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Add matching `id` to each input and `htmlFor` to each label
- **Priority:** P1 (high)

### [P1] AddClusterWizard validation errors not announced

- **File:** `apps/web/src/components/AddClusterWizard.tsx:509`
- **Issue:** Error messages in `<p class="text-xs text-red-400">` have no `role="alert"` or `aria-live`.
- **WCAG Criterion:** 3.3.1 Error Identification
- **Fix:** Wrap in `<p role="alert" aria-live="assertive">`
- **Priority:** P1 (high)

### [P1] InlineAiPanel follow-up input missing label

- **File:** `apps/web/src/components/ai/InlineAiPanel.tsx:179-186`
- **Issue:** Input has `placeholder="Ask a follow-up question..."` but no `<label>` or `aria-label`.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Add `aria-label="Ask a follow-up question"`
- **Priority:** P1 (high)

### [P2] Logs page regex search input missing label

- **File:** `apps/web/src/app/logs/page.tsx:402`
- **Issue:** Search input has `placeholder="Regex pattern..."` but no `aria-label`.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Add `aria-label="Filter logs by regex pattern"`
- **Priority:** P2 (medium)

### [P2] PodLogStream search input missing label

- **File:** `apps/web/src/components/PodLogStream.tsx:129-136`
- **Issue:** Search input in log stream has no explicit label association.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Add `aria-label="Filter logs"`
- **Priority:** P2 (medium)

---

## 6. Motion & Animation

### [P1] StatCardsWidget AnimatedNumber ignores prefers-reduced-motion

- **File:** `apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx:15-36`
- **Issue:** `AnimatedNumber` component uses `animate()` from motion/react (line 24) with no `useReducedMotion()` check. Animation runs regardless of user OS preference.
- **WCAG Criterion:** 2.3.3 Animation from Interactions
- **Fix:** Add `const reduced = useReducedMotion()` and skip animation when true
- **Priority:** P1 (high)

### [P2] ClusterHealthWidget gauge animation unchecked

- **File:** `apps/web/src/components/dashboard/widgets/ClusterHealthWidget.tsx:94-101`
- **Issue:** SVG gauge circle transition uses CSS/motion animation with no reduced-motion check.
- **WCAG Criterion:** 2.3.3 Animation from Interactions
- **Fix:** Conditionally disable animation when `prefers-reduced-motion: reduce`
- **Priority:** P2 (medium)

### [P2] Page transitions may briefly hide content

- **File:** `apps/web/src/components/animations/PageTransition.tsx:21-23`
- **Issue:** Motion div with `initial="hidden" animate="visible" exit="exit"` may briefly show blank during route transitions. While `useReducedMotion()` IS checked, the exit animation on route change may cause content flash.
- **WCAG Criterion:** 2.3.3 Animation from Interactions
- **Fix:** Ensure exit animation is instant (0ms) when reduced motion is enabled. Already mostly handled.
- **Priority:** P2 (medium)

### Positive: Components with correct `useReducedMotion()` handling

The following components correctly check `useReducedMotion()` and provide static fallbacks:
- `AnimatedList.tsx` (line 25)
- `FadeIn.tsx` (line 15)
- `PageTransition.tsx` (line 14)
- `SlideIn.tsx` (line 25)
- `globals.css` `@media (prefers-reduced-motion: reduce)` (line 401-416)
- `MotionConfig reducedMotion="user"` in providers.tsx (line 73)

---

## 7. Touch Targets

### [P1] LoginThemeToggle button below 44x44px minimum

- **File:** `apps/web/src/components/LoginThemeToggle.tsx:31`
- **Issue:** Button is `h-9 w-9` = 36x36px. WCAG 2.2 requires 44x44px for touch targets (2.5.8 Target Size Minimum).
- **WCAG Criterion:** 2.5.8 Target Size (Minimum)
- **Fix:** Change to `h-11 w-11` (44x44px)
- **Priority:** P1 (high)

### [P2] ErrorBoundary "Try Again" button below minimum

- **File:** `apps/web/src/components/ErrorBoundary.tsx:50-56,123-130`
- **Issue:** Buttons have `px-4 py-2` but no minimum height/width. Likely renders below 44px.
- **WCAG Criterion:** 2.5.8 Target Size (Minimum)
- **Fix:** Add `min-h-[44px]` to button className
- **Priority:** P2 (medium)

### [P2] Sidebar collapse toggle below 44px (desktop)

- **File:** `apps/web/src/components/Sidebar.tsx:341`
- **Issue:** Button is `h-8` = 32px. Desktop-only but still below minimum.
- **WCAG Criterion:** 2.5.8 Target Size (Minimum)
- **Fix:** Increase to `h-10` or `h-11`
- **Priority:** P2 (medium) — desktop only, reduced impact

### Positive: Components with correct touch targets

- `AppLayout.tsx` hamburger: `h-11 w-11` (44x44px)
- `ThemeToggle.tsx` button: `h-11 w-11` (44x44px)
- `TopBar.tsx` logout: `min-h-[44px] min-w-[44px]`

---

## 8. Semantic HTML

### [P0] Missing `<h1>` on multiple pages

- **File:** Multiple page files
- **Issue:** Several pages have no `<h1>` heading:
  - `apps/web/src/app/logs/page.tsx` — no h1
  - `apps/web/src/app/settings/page.tsx` — no h1
  - `apps/web/src/app/clusters/[id]/pods/page.tsx` — no h1
  - `apps/web/src/app/clusters/[id]/nodes/page.tsx` — no h1
- **WCAG Criterion:** 1.3.1 Info and Relationships; 2.4.10 Section Headings
- **Fix:** Ensure every page has exactly one `<h1>` via `<PageHeader title="..." />` or direct `<h1>`
- **Priority:** P0 (blocker)

### [P1] Heading hierarchy violations

- **File:** `apps/web/src/app/health/page.tsx:133,197`
- **Issue:** H1 "System Health" followed by H3 "Cluster Component Health" — skips H2 level.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Change H3 to H2
- **Priority:** P1 (high)

### [P1] CardTitle uses `<div>` instead of heading

- **File:** `apps/web/src/components/ui/card.tsx:24-28`
- **Issue:** CardTitle renders as `<div>` instead of `<h1>`-`<h6>`. Breaks document outline for screen reader users navigating by headings.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Render as heading element (default `<h3>`) with configurable `as` prop
- **Priority:** P1 (high)

### [P1] EmptyState title not semantic heading

- **File:** `apps/web/src/components/EmptyState.tsx:15`
- **Issue:** Title rendered as `<p>` instead of a heading. Icon (line 14) not marked `aria-hidden`.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Change `<p>` to `<h2>` or `<h3>`. Add `aria-hidden="true"` to decorative icon.
- **Priority:** P1 (high)

### [P1] Health page uses grid divs as table

- **File:** `apps/web/src/app/health/page.tsx:214-226`
- **Issue:** Grid-based "table" layout using divs styled as rows, not semantic `<table>`. Screen readers cannot use table navigation.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Refactor to use `<table>` with `<caption>`, `<thead>`, `<th scope="col">` pattern
- **Priority:** P1 (high)

### [P1] PodLogStream container missing `role="log"`

- **File:** `apps/web/src/components/PodLogStream.tsx:177-195`
- **Issue:** Log output container is a generic `<div>` with scroll. Should use `role="log"` to indicate it's a log output region.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `role="log" aria-label="Pod log output"` to container
- **Priority:** P1 (high)

### [P2] MobileDrawer missing `aria-labelledby`

- **File:** `apps/web/src/components/MobileDrawer.tsx:32`
- **Issue:** Drawer.Content has `aria-describedby` but no `aria-labelledby` connecting to title.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-labelledby` to Drawer.Content, add `id` to Drawer.Title
- **Priority:** P2 (medium)

### [P2] DataTable row aria-label is generic

- **File:** `apps/web/src/components/DataTable.tsx:398-400`
- **Issue:** Clickable rows have `aria-label="Open row details"` — same label for every row. Should include identifying data.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add dynamic aria-label: `aria-label={`Open details for ${row.name || row.id}`}`
- **Priority:** P2 (medium)

### [P2] Skeleton components not hidden from AT

- **File:** `apps/web/src/components/Skeleton.tsx:3-42`; `apps/web/src/components/ui/skeleton.tsx:5-9`
- **Issue:** Skeleton placeholder divs are not marked `aria-hidden="true"`. Screen readers may attempt to read placeholder bars.
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Fix:** Add `aria-hidden="true"` to all skeleton placeholder elements
- **Priority:** P2 (medium)

### [P2] TableSkeleton uses div instead of table

- **File:** `apps/web/src/components/TableSkeleton.tsx:26`
- **Issue:** Skeleton mimics table structure with `<div>` instead of `<table>`. Screen readers cannot use table navigation.
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Fix:** Either use actual `<table>` elements or mark the entire skeleton `aria-hidden="true"` (since it's placeholder)
- **Priority:** P2 (medium)

---

## 9. Charts & Data Visualization

### [P1] All charts lack data table alternatives

- **Files:**
  - `apps/web/src/components/charts/AlertsTimelineChart.tsx:70`
  - `apps/web/src/components/charts/ClusterHealthChart.tsx:40`
  - `apps/web/src/components/charts/RequestRateChart.tsx:40`
  - `apps/web/src/components/charts/ResourceUsageChart.tsx:43`
  - `apps/web/src/components/charts/UptimeChart.tsx:53`
- **Issue:** Charts have `role="img"` with basic `aria-label` describing chart type, but no text alternative that conveys the actual data. Screen reader users receive no data.
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Fix:** Add hidden data table (`<table className="sr-only">`) or expandable "View as table" option for each chart. At minimum, expand `aria-label` to include key data points.
- **Priority:** P1 (high) — affects all dashboard and detail pages

### [P1] Charts use color-only data differentiation

- **File:** `apps/web/src/components/charts/ClusterHealthChart.tsx:56-78`
- **Issue:** Three line series (healthy=green, degraded=yellow, offline=red) distinguished only by color. No patterns, dashes, or shape markers. Colorblind users cannot differentiate.
- **WCAG Criterion:** 1.4.1 Use of Color
- **Fix:** Add `strokeDasharray` patterns (solid, dashed, dotted) to each line. Add shape markers at data points.
- **Priority:** P1 (high)

### [P1] UptimeChart threshold colors lack text

- **File:** `apps/web/src/components/charts/UptimeChart.tsx:45-49,75-78`
- **Issue:** Bar colors (green/yellow/red) based on uptime thresholds with no text labels. Individual bar `<Cell>` elements lack `aria-label`.
- **WCAG Criterion:** 1.4.1 Use of Color; 1.1.1 Non-text Content
- **Fix:** Add value labels on or near each bar. Add `aria-label` to SVG cells.
- **Priority:** P1 (high)

### [P1] ClusterHealthWidget SVG gauges lack text alternative

- **File:** `apps/web/src/components/dashboard/widgets/ClusterHealthWidget.tsx:94-101`
- **Issue:** SVG gauge circles for CPU/Memory have no `role`, `aria-label`, or text alternative.
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Fix:** Add `role="img" aria-label="CPU usage: {value}%"` to each gauge SVG
- **Priority:** P1 (high)

### [P1] AnomalyTimeline distribution bar lacks text

- **File:** `apps/web/src/components/dashboard/AnomalyTimeline.tsx:52-107`
- **Issue:** 24-hour distribution bars use colors alone. Only `title` tooltip provides data — not accessible.
- **WCAG Criterion:** 1.1.1 Non-text Content; 1.4.1 Use of Color
- **Fix:** Add `aria-label` with hourly breakdown to bar container, or provide tabular summary
- **Priority:** P1 (high)

### [P2] Chart tooltips only accessible on hover

- **File:** `apps/web/src/components/metrics/MetricsAreaChart.tsx:178-195`
- **Issue:** Recharts CustomTooltip appears only on mouse hover. Keyboard/mobile users cannot access tooltip data.
- **WCAG Criterion:** 2.1.1 Keyboard
- **Fix:** Provide data in an accessible format (table or aria-label) independent of tooltip
- **Priority:** P2 (medium) — tooltips are supplementary

### [P2] Sparklines should be decorative when used as backgrounds

- **File:** `apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx:92-96`
- **Issue:** SparklineChart used as background decoration has `role="img"` + `aria-label`. Should be `aria-hidden="true"`.
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Fix:** Add `aria-hidden="true"` when sparkline is purely decorative
- **Priority:** P2 (medium)

### [P2] MetricCard trend indicator color-only

- **File:** `apps/web/src/components/shared/MetricCard.tsx:65-69,99-103`
- **Issue:** Trend arrows (up/down/neutral) are color-coded only. Screen readers read literal arrow characters without context.
- **WCAG Criterion:** 1.4.1 Use of Color
- **Fix:** Add `aria-label="Trend: increasing by {value}"` to trend container
- **Priority:** P2 (medium)

---

## 10. Dynamic Content & SSE

### [P1] Alert list updates not announced

- **File:** `apps/web/src/app/alerts/page.tsx:82-92`
- **Issue:** Alert list with optimistic updates has no `aria-live` region. New/deleted alerts are silent.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-live="polite"` to the alerts list container or add a status region announcing count changes
- **Priority:** P1 (high)

### [P1] Events list filtered results not announced

- **File:** `apps/web/src/app/events/page.tsx:245-297`
- **Issue:** Event list filtering produces new results with no announcement.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-live="polite"` status region with result count
- **Priority:** P1 (high)

### [P1] Clusters list dynamic updates not announced

- **File:** `apps/web/src/app/clusters/page.tsx:455-509`
- **Issue:** DataTable with dynamic filtering but no announcement when list updates.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add aria-live status region or announce count via screen reader
- **Priority:** P1 (high)

### [P2] Metrics auto-refresh updates silent

- **File:** `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx:165-169`
- **Issue:** Auto-refresh toggle updates data silently. No `aria-live` for "last updated" timestamp changes.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-live="polite"` to the "last updated" display
- **Priority:** P2 (medium)

### [P2] AI command palette results not announced

- **File:** `apps/web/src/components/ai/AiCommandPaletteProvider.tsx:62-67`
- **Issue:** Result text and loading state "Asking AI..." appear without `aria-live` announcement.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `aria-live="polite"` to result container
- **Priority:** P2 (medium)

### [P2] ApiTokens creation success not announced

- **File:** `apps/web/src/components/settings/ApiTokens.tsx:294-334`
- **Issue:** Newly created token display appears without `aria-live` region.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Add `role="status" aria-live="polite"` to success container
- **Priority:** P2 (medium)

### [P2] Sidebar alerts badge not announced

- **File:** `apps/web/src/components/Sidebar.tsx:226-232`
- **Issue:** Alert count badge uses `<span aria-label>` which is unreliable. Should use `role="status"`.
- **WCAG Criterion:** 4.1.3 Status Messages
- **Fix:** Change to `<div role="status" aria-label={`${count} unacknowledged alerts`}>`
- **Priority:** P2 (medium)

---

## Summary by Priority

| Priority | Count | Category |
|----------|-------|----------|
| **P0 (Blocker)** | **8** | Focus traps, contrast failures, missing h1, dialog roles, live regions |
| **P1 (High)** | **36** | aria-current, tab patterns, form labels, chart accessibility, announcements |
| **P2 (Medium)** | **27** | Semantic improvements, secondary ARIA, decorative marking, touch targets |
| **P3 (Low)** | **4** | Minor icon hiding, button labeling |

## Positive Findings

The codebase has several accessibility features already in place:

- Global `focus-visible` ring (globals.css:569-574)
- `prefers-reduced-motion` global CSS override (globals.css:401-416)
- `MotionConfig reducedMotion="user"` in providers.tsx
- `useReducedMotion()` in 4+ animation components
- `lang="en"` on `<html>` element
- Skip-to-content link in AppLayout
- `<main id="main">` element in AppLayout
- Proper `aria-label` on TopBar logout, cluster selector, command palette button
- ClusterHealthIndicator with `role="status"` and `aria-label`
- FeatureFlagToggle with `role="switch"` and `aria-checked`
- CardSkeleton with `aria-busy` and `aria-label`
- DataTable with `aria-sort`, `scope="col"`, and searchable labels
- RefreshIntervalSelector with full ARIA listbox pattern
- WidgetLibraryDrawer with focus trap + dialog roles
- `font-display: swap` on font loading
- `suppressHydrationWarning` on html (prevents flash)
