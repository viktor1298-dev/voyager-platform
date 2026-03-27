# 04 — Responsive Design & Mobile UX Audit

**Auditor:** Responsive Design Agent
**Date:** 2026-03-27
**Scope:** All pages and components in `apps/web/src/`
**Files scanned:** 42 page.tsx files, 94+ component files

---

## Executive Summary

The codebase has a **solid responsive foundation** — mobile-first Tailwind patterns, a well-implemented `react-grid-layout` dashboard, and excellent `DataTable` mobile card patterns. However, there are **critical gaps** in viewport configuration, touch target consistency, drawer/sheet sizing on mobile, and missing `safe-area-inset` support for notched devices. Charts are excellent (all wrapped in `ResponsiveContainer`). The biggest risks are: (1) no explicit viewport meta tag, (2) drawers that consume 100% of mobile screens, and (3) inconsistent touch targets below 44px.

**Severity breakdown:** P0: 2 | P1: 8 | P2: 10 | P3: 5

---

## P0 — Critical (Broken on Mobile)

### [P0] Missing explicit viewport meta tag
- **File:** `apps/web/src/app/layout.tsx:40`
- **Issue:** Root layout uses bare `<head />` without explicit viewport configuration. Next.js injects a default viewport, but the app does NOT export a `viewport` metadata object (required since Next.js 14+ for proper control). Without explicit `width=device-width, initial-scale=1`, some mobile browsers may not scale correctly, and the `user-scalable` and `viewport-fit=cover` properties needed for notched devices are absent.
- **Breakpoint:** All mobile devices
- **Fix:**
  ```tsx
  // layout.tsx — add after metadata export
  export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    viewportFit: 'cover',  // enables safe-area-inset-* on notched devices
  }
  ```
  Import: `import type { Viewport } from 'next'`
- **Priority:** P0

### [P0] WidgetLibraryDrawer covers entire mobile screen with no close affordance visible
- **File:** `apps/web/src/components/dashboard/WidgetLibraryDrawer.tsx:66`
- **Issue:** Fixed `w-80` (320px) equals 100% of a 320px iPhone SE screen. The drawer fills the entire viewport with no visible content behind it, creating a confusing "where am I?" experience. The close button at 28px (`w-7 h-7`) is also undersized for touch.
- **Breakpoint:** < 400px (iPhone SE, Galaxy S series)
- **Fix:**
  ```tsx
  // Line 66: Change fixed w-80 to responsive
  className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-80 flex flex-col ..."

  // Line 78: Increase close button touch target
  className="flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-md ..."
  ```
- **Priority:** P0

---

## P1 — High (Poor Mobile UX)

### [P1] Sheet component `w-3/4` overflows on small phones
- **File:** `apps/web/src/components/ui/sheet.tsx:48`
- **Issue:** `w-3/4 max-w-md` means 240px on 320px screen — technically fits but leaves only 80px visible behind the backdrop, making it feel like a full-screen takeover. On phones < 400px, the sheet should go full-width.
- **Breakpoint:** < 400px
- **Fix:**
  ```tsx
  side === "right" && "inset-y-0 right-0 h-full w-full sm:w-3/4 sm:max-w-md border-l",
  side === "left" && "inset-y-0 left-0 h-full w-full sm:w-3/4 sm:max-w-md border-r",
  ```
- **Priority:** P1

### [P1] Sheet close button too small for touch
- **File:** `apps/web/src/components/ui/sheet.tsx:56-63`
- **Issue:** Close button renders X icon at `h-4 w-4` with no explicit min-height/min-width. The clickable area is ~16px, well below the 44px minimum for mobile touch targets.
- **Breakpoint:** All mobile
- **Fix:**
  ```tsx
  <button
    type="button"
    onClick={onClose}
    className="absolute right-4 top-4 flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg opacity-70 transition-opacity hover:opacity-100"
  >
  ```
- **Priority:** P1

### [P1] Sidebar collapse toggle undersized at 32px
- **File:** `apps/web/src/components/Sidebar.tsx:341`
- **Issue:** `h-8` = 32px, below the 44px mobile touch target minimum. While this is desktop-only (`{isDesktop && ...}`), tablet users (768px+) are classified as "desktop" by the `useDesktopLayout()` hook and may be using touch.
- **Breakpoint:** 768px-1024px (touch tablets classified as desktop)
- **Fix:**
  ```tsx
  className="mt-auto mx-2 mb-2 flex items-center justify-center h-11 min-h-[44px] rounded-lg ..."
  ```
- **Priority:** P1

### [P1] Sidebar cluster sub-nav touch targets too small
- **File:** `apps/web/src/components/Sidebar.tsx:303-309`
- **Issue:** Cluster sub-items use `py-1.5` (6px vertical padding) + `text-[12px]` = total height ~24px. Well below 44px minimum. On mobile sidebar (which opens as overlay), these are primary touch targets.
- **Breakpoint:** All mobile (sidebar overlay)
- **Fix:**
  ```tsx
  'flex items-center gap-2 pl-9 pr-3 py-2.5 min-h-[44px] rounded-md text-[13px]',
  ```
- **Priority:** P1

### [P1] DataTable pagination buttons undersized
- **File:** `apps/web/src/components/DataTable.tsx:496`
- **Issue:** `PaginationBtn` uses `p-1.5` (6px padding) around 14px icons = ~26px total. Four of these buttons in a row are the primary navigation for paginated tables on mobile.
- **Breakpoint:** All mobile
- **Fix:**
  ```tsx
  className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border ..."
  ```
- **Priority:** P1

### [P1] PodDetailSheet tab buttons undersized
- **File:** `apps/web/src/components/PodDetailSheet.tsx:417`
- **Issue:** Tab buttons use `px-3 py-2 text-xs` = ~32px height. Five tabs in a row means they're cramped on mobile. The sheet itself is `w-full max-w-lg` which is fine, but the tabs need more touch room.
- **Breakpoint:** < 640px
- **Fix:**
  ```tsx
  className={`px-3 py-2.5 min-h-[44px] text-xs font-medium border-b-2 -mb-px transition-colors ${...}`}
  ```
- **Priority:** P1

### [P1] NotificationsPanel dropdown fixed at w-80 on small screens
- **File:** `apps/web/src/components/NotificationsPanel.tsx:156`
- **Issue:** `w-80` (320px) with `absolute right-0` positions the dropdown at screen edge. On phones < 360px, it overflows left. On phones 360-400px, it leaves no margin.
- **Breakpoint:** < 400px
- **Fix:**
  ```tsx
  className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80 max-h-[420px] overflow-y-auto rounded-xl ..."
  ```
- **Priority:** P1

### [P1] NotificationsPanel category filter tabs undersized
- **File:** `apps/web/src/components/NotificationsPanel.tsx:186-193`
- **Issue:** Filter tabs (`All | Alerts | Events | System`) use `px-2 py-1` = ~28px height. These are primary navigation within the panel.
- **Breakpoint:** All mobile
- **Fix:**
  ```tsx
  className={`px-3 py-2 min-h-[44px] rounded text-xs font-medium capitalize transition-colors ${...}`}
  ```
- **Priority:** P1

---

## P2 — Medium (Degraded Experience)

### [P2] No safe-area-inset support for notched devices
- **File:** `apps/web/src/app/globals.css` (missing entirely)
- **Issue:** No `env(safe-area-inset-*)` usage anywhere in the codebase. On iPhones with notches/Dynamic Island, the top bar content may be obscured, and bottom drawers may be cut off by the home indicator.
- **Breakpoint:** iPhone X+ (notch), iPhone 14 Pro+ (Dynamic Island)
- **Fix:** Add to globals.css:
  ```css
  /* Safe area insets for notched devices */
  :root {
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left: env(safe-area-inset-left, 0px);
    --safe-right: env(safe-area-inset-right, 0px);
  }
  ```
  Then apply `padding-bottom: var(--safe-bottom)` to: `MobileDrawer.tsx` content, `Sheet` content, `AppLayout` main content, and bottom-positioned elements.
- **Priority:** P2

### [P2] TopBar cluster selector + stats hidden on mobile with no alternative
- **File:** `apps/web/src/components/TopBar.tsx:149`
- **Issue:** `hidden sm:flex` hides the cluster selector, CPU stat, and alert count on mobile. There's no mobile-specific alternative to switch clusters or see key metrics. Users on phones lose awareness of which cluster is active.
- **Breakpoint:** < 640px
- **Fix:** Add a compact mobile cluster indicator:
  ```tsx
  {/* Mobile cluster indicator — visible only on small screens */}
  <div className="flex sm:hidden items-center gap-1.5">
    {activeClusterId && (
      <span className="text-xs font-mono text-[var(--color-text-muted)] truncate max-w-[120px]">
        {clusterOptions.find(c => c.id === activeClusterId)?.name ?? 'Cluster'}
      </span>
    )}
  </div>
  ```
- **Priority:** P2

### [P2] CommandPalette fixed width squeezes on xs screens
- **File:** `apps/web/src/components/CommandPalette.tsx:189`
- **Issue:** `max-w-lg mx-4` means on 320px screen: 320 - 32 = 288px usable. The palette works but feels cramped. The `pt-[20vh]` positioning also wastes vertical space on short screens.
- **Breakpoint:** < 400px
- **Fix:**
  ```tsx
  // Line 187: Reduce top offset on mobile
  <div className="relative flex items-start justify-center pt-[10vh] sm:pt-[20vh]">
  // Line 189: Reduce margins on mobile
  className="w-full max-w-lg mx-2 sm:mx-4 rounded-xl ..."
  ```
- **Priority:** P2

### [P2] CommandPalette items lack touch-friendly sizing
- **File:** `apps/web/src/components/CommandPalette.tsx:174-175`
- **Issue:** `itemClass` uses `py-2.5` (10px padding) = ~36px total height. Close to 44px but not quite. When scrolling through items on mobile, taps may miss.
- **Breakpoint:** All mobile
- **Fix:**
  ```tsx
  const itemClass =
    'flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg text-sm ...'
  ```
- **Priority:** P2

### [P2] PodDetailSheet YAML copy button undersized
- **File:** `apps/web/src/components/PodDetailSheet.tsx:336-339`
- **Issue:** Copy button uses `px-2 py-1` = ~28px height. Small touch target in a commonly-used action.
- **Breakpoint:** All mobile
- **Fix:**
  ```tsx
  className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-md ..."
  ```
- **Priority:** P2

### [P2] InfoRow layout doesn't stack on narrow screens
- **File:** `apps/web/src/components/PodDetailSheet.tsx:49-54`
- **Issue:** `flex items-center justify-between` keeps label and value side-by-side. With long label text (e.g., "Namespace") and long values (e.g., "kube-system"), content gets squeezed on mobile widths inside the sheet.
- **Breakpoint:** < 400px (inside sheet which is full-width on mobile)
- **Fix:**
  ```tsx
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 gap-0.5 border-b ...">
    <span className="text-xs text-[var(--color-text-muted)] font-mono uppercase tracking-wider">{label}</span>
    <span className="text-[13px] text-[var(--color-text-primary)] font-medium break-all">{value}</span>
  </div>
  ```
- **Priority:** P2

### [P2] Missing inputMode attributes on form inputs
- **Files:** Multiple form pages
  - `apps/web/src/app/login/page.tsx` — email input: missing `inputMode="email"`
  - `apps/web/src/app/settings/webhooks/page.tsx` — URL input: missing `inputMode="url"`
  - `apps/web/src/components/CommandPalette.tsx:195` — search: missing `inputMode="search"`
  - `apps/web/src/components/DataTable.tsx:258` — search: missing `inputMode="search"`
- **Issue:** Without `inputMode`, mobile keyboards default to standard QWERTY. Email inputs won't show `@` prominently, URL inputs won't show `.com`, and search inputs won't show a Search button on the virtual keyboard.
- **Breakpoint:** All mobile
- **Fix:** Add `inputMode` to each input:
  ```tsx
  // Login email: inputMode="email"
  // Webhook URL: inputMode="url"
  // Search inputs: inputMode="search"
  ```
- **Priority:** P2

### [P2] Missing autocomplete on settings form inputs
- **Files:**
  - `apps/web/src/app/settings/users/page.tsx` — name field: missing `autoComplete="name"`
  - `apps/web/src/app/settings/users/page.tsx` — email field: missing `autoComplete="email"`
  - `apps/web/src/app/settings/users/page.tsx` — password field: missing `autoComplete="new-password"`
  - `apps/web/src/app/settings/webhooks/page.tsx` — URL field: missing `autoComplete="url"`
- **Issue:** Mobile browsers use `autoComplete` to offer autofill suggestions, reducing typing friction. Critical for user creation flows where admin may add multiple users.
- **Breakpoint:** All mobile
- **Fix:** Add appropriate `autoComplete` attributes to each input.
- **Priority:** P2

### [P2] AppLayout conflicting max-width classes
- **File:** `apps/web/src/components/AppLayout.tsx:111`
- **Issue:** `max-w-[1400px] w-full max-w-[100vw]` — two conflicting `max-w` values. CSS last-wins rule means `max-w-[100vw]` overrides `max-w-[1400px]`. On mobile this is benign but on wide screens the intended 1400px cap is defeated.
- **Breakpoint:** > 1400px (wide screens) + all
- **Fix:**
  ```tsx
  className="p-3 sm:p-5 w-full max-w-[min(1400px,100vw)] overflow-x-hidden bg-dot-grid min-h-full"
  ```
- **Priority:** P2

### [P2] ThemeToggle dropdown items undersized for touch
- **File:** `apps/web/src/components/ThemeToggle.tsx:90`
- **Issue:** Theme option buttons use `px-3 py-2.5` = ~36px height. Three items stacked, each slightly under 44px.
- **Breakpoint:** All mobile
- **Fix:**
  ```tsx
  'flex w-full items-center gap-3 px-3 py-3 min-h-[44px] text-sm transition-colors',
  ```
- **Priority:** P2

---

## P3 — Low (Minor Polish)

### [P3] No xl/2xl breakpoint usage across the entire app
- **Files:** All pages
- **Issue:** Maximum breakpoint used is `lg:` (1024px). On ultrawide/4K displays, content maxes out at `max-w-[1400px]` which is fine, but dashboard layouts, cluster cards, and data tables could benefit from `xl:grid-cols-4` or `2xl:grid-cols-6` for information density.
- **Breakpoint:** > 1280px
- **Fix:** Consider adding `xl:` breakpoints to key grid layouts:
  ```tsx
  // Clusters page: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
  // Dashboard stat cards: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
  ```
- **Priority:** P3

### [P3] Mobile hamburger overlaps top bar left logo
- **File:** `apps/web/src/components/AppLayout.tsx:84-91`
- **Issue:** Hamburger button is `fixed top-3.5 left-3 z-50`. The TopBar also has content starting from `px-3` with the logo at `left`. Both occupy the same space. The hamburger should either replace the logo on mobile or be positioned to its right.
- **Breakpoint:** < 768px
- **Fix:** TopBar should add left padding on mobile to accommodate the hamburger:
  ```tsx
  // TopBar.tsx line 135:
  className="... px-3 pl-16 sm:px-6 sm:pl-6 ..."
  ```
  Or hide logo on mobile: `<img ... className="h-8 w-8 object-contain hidden sm:block" />`
- **Priority:** P3

### [P3] NotificationsPanel close button (X) undersized
- **File:** `apps/web/src/components/NotificationsPanel.tsx:177-179`
- **Issue:** Close button renders X icon at `h-3.5 w-3.5` with no padding/min-size. Total touch area ~14px.
- **Breakpoint:** All mobile
- **Fix:**
  ```tsx
  <button type="button" onClick={() => setOpen(false)} className="flex items-center justify-center min-h-[44px] min-w-[44px] -mr-2">
    <X className="h-4 w-4 text-[var(--color-text-dim)]" />
  </button>
  ```
- **Priority:** P3

### [P3] No scroll-behavior: smooth in globals.css
- **File:** `apps/web/src/app/globals.css` (missing)
- **Issue:** Page transitions and scroll-to-anchor feel jarring on mobile without smooth scrolling. Some browsers default to smooth, but it should be explicit.
- **Fix:** Add to globals.css:
  ```css
  html {
    scroll-behavior: smooth;
  }
  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }
  }
  ```
- **Priority:** P3

### [P3] TopBar command palette button has tiny icon
- **File:** `apps/web/src/components/TopBar.tsx:185`
- **Issue:** Search icon is `h-3 w-3` (12px) inside the command palette trigger button. While the button itself is hidden on mobile (`hidden sm:flex`), on tablets it's a small touch target — no explicit `min-h`/`min-w`.
- **Breakpoint:** 640px-768px (small tablets)
- **Fix:**
  ```tsx
  className="hidden sm:flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl ..."
  ```
- **Priority:** P3

---

## Positive Patterns (No Action Required)

These patterns are well-implemented and should be preserved:

| Pattern | File | Assessment |
|---------|------|------------|
| **DataTable mobile cards** | `DataTable.tsx:381-389` | Excellent `mobileCard` prop with `md:hidden` / `hidden md:table` toggle |
| **MobileDrawer (vaul)** | `MobileDrawer.tsx` | Proper `max-h-[95vh]`, snap points, drag handle, scrollable content |
| **Dashboard grid** | `DashboardGrid.tsx` | `react-grid-layout` with 4 breakpoints: `lg:12, md:12, sm:6, xs:1` |
| **All Recharts** | 8 chart components | Every chart wrapped in `<ResponsiveContainer width="100%" height={...}>` |
| **StatCardsWidget** | `StatCardsWidget.tsx:131` | `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` — proper mobile stacking |
| **Login page** | `login/page.tsx` | Split layout hides on mobile, proper `min-h-[44px]` on buttons |
| **FilterBar** | `FilterBar.tsx` | `flex-col sm:flex-row`, chips with `min-h-[44px]` |
| **Responsive typography** | `globals.css` | `font-size: clamp(0.875rem, 2vw, 1rem)` on body |
| **Overflow prevention** | `globals.css` | `overflow-x: hidden` on html/body |
| **Reduced motion** | `globals.css` | Proper `prefers-reduced-motion: reduce` support |
| **Hamburger button** | `AppLayout.tsx:88` | Proper `h-11 w-11` (44px) touch target |
| **Mobile sidebar close** | `Sidebar.tsx:133` | Proper `h-11 w-11` (44px) touch target |
| **Logout button** | `TopBar.tsx:196` | `min-h-[44px] min-w-[44px]` explicit |
| **Bell button** | `NotificationsPanel.tsx:144` | `h-11 w-11` (44px) |
| **Theme toggle** | `ThemeToggle.tsx:66` | `h-11 w-11` (44px) |
| **Dialog responsive** | `ui/dialog.tsx` | `max-w-[calc(100vw-2rem)]` prevents overflow |

---

## Summary Table

| # | Severity | Component | Issue | Fix Effort |
|---|----------|-----------|-------|-----------|
| 1 | **P0** | layout.tsx | No viewport meta export | 5 min |
| 2 | **P0** | WidgetLibraryDrawer | Full-screen on mobile, tiny close btn | 10 min |
| 3 | **P1** | ui/sheet.tsx | w-3/4 overflows on xs phones | 5 min |
| 4 | **P1** | ui/sheet.tsx | Close button 16px | 5 min |
| 5 | **P1** | Sidebar.tsx:341 | Collapse toggle 32px | 2 min |
| 6 | **P1** | Sidebar.tsx:303 | Cluster sub-nav 24px height | 5 min |
| 7 | **P1** | DataTable.tsx:496 | Pagination buttons 26px | 5 min |
| 8 | **P1** | PodDetailSheet.tsx:417 | Tab buttons 32px | 5 min |
| 9 | **P1** | NotificationsPanel:156 | Dropdown overflows on xs | 10 min |
| 10 | **P1** | NotificationsPanel:186 | Category tabs 28px | 5 min |
| 11 | **P2** | globals.css | No safe-area-inset support | 15 min |
| 12 | **P2** | TopBar.tsx:149 | Cluster selector hidden, no mobile alt | 20 min |
| 13 | **P2** | CommandPalette:189 | Cramped on xs screens | 5 min |
| 14 | **P2** | CommandPalette:174 | Items slightly under 44px | 2 min |
| 15 | **P2** | PodDetailSheet:336 | Copy button 28px | 2 min |
| 16 | **P2** | PodDetailSheet:49 | InfoRow doesn't stack | 10 min |
| 17 | **P2** | Multiple forms | Missing inputMode attrs | 10 min |
| 18 | **P2** | Multiple forms | Missing autoComplete attrs | 10 min |
| 19 | **P2** | AppLayout:111 | Conflicting max-w classes | 2 min |
| 20 | **P2** | ThemeToggle:90 | Dropdown items 36px | 2 min |
| 21 | **P3** | All pages | No xl/2xl breakpoints | 30 min |
| 22 | **P3** | AppLayout:84 | Hamburger overlaps logo | 5 min |
| 23 | **P3** | NotificationsPanel:177 | Close X 14px | 5 min |
| 24 | **P3** | globals.css | No scroll-behavior: smooth | 2 min |
| 25 | **P3** | TopBar:185 | Cmd palette btn tiny icon | 5 min |

**Total estimated fix time:** ~3-4 hours for all findings
