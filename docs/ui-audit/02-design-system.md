# Design System Audit — voyager-platform

**Date:** 2026-03-27
**Scope:** All files in `apps/web/src/` (components, pages, UI primitives, globals.css, animation-constants.ts)
**Auditor:** UI/UX Design System Agent

---

## Summary

| Severity | Count |
|----------|-------|
| P0 (Critical — breaks theme or accessibility) | 4 |
| P1 (High — visual inconsistency users will notice) | 11 |
| P2 (Medium — maintainability / drift risk) | 12 |
| P3 (Low — cosmetic / minor) | 5 |

**Total findings: 32**

---

## 1. Token Usage — Hardcoded Colors

### [P1] 1.1 Metrics components use hardcoded HSL colors instead of CSS custom properties
- **Files:**
  - `components/metrics/MetricsAreaChart.tsx:46-78`
  - `components/metrics/ResourceSparkline.tsx:37-38, 94-102`
  - `components/metrics/NodeMetricsTable.tsx:15-17`
  - `components/metrics/NodeResourceBreakdown.tsx:25-34`
  - `components/metrics/MetricsEmptyState.tsx:44-46`
- **Issue:** Five metrics components define chart/gauge colors as raw HSL strings:
  ```tsx
  // MetricsAreaChart.tsx:46
  color: 'hsl(262,83%,58%)',  // CPU purple
  color: 'hsl(199,89%,48%)',  // Memory cyan
  color: 'hsl(142,71%,45%)',  // Pods green
  color: 'hsl(38,92%,50%)',   // Network orange
  color: 'hsl(340,82%,52%)',  // Network pink

  // NodeMetricsTable.tsx:15-17
  if (percent > 85) return 'hsl(0,84%,60%)'  // red
  if (percent > 65) return 'hsl(48,96%,53%)'  // yellow
  return 'hsl(142,71%,45%)'                   // green
  ```
  The same HSL values are duplicated across `ResourceSparkline.tsx` and `NodeResourceBreakdown.tsx`. These do NOT map to any CSS custom property in `globals.css` — they exist as a parallel, undocumented palette.
- **Expected:** Use CSS custom properties from globals.css: `var(--color-chart-cpu)`, `var(--color-chart-mem)`, `var(--color-chart-pods)`, `var(--color-chart-warnings)`, `var(--color-chart-critical)`. For threshold colors (red/yellow/green), add `--color-threshold-high`, `--color-threshold-warn`, `--color-threshold-normal` to globals.css.
- **Fix:** Define threshold tokens in globals.css and replace all raw HSL in metrics components. This also fixes the light-mode mismatch since globals.css already overrides chart colors per theme.
- **Priority:** P1 — these colors are NOT theme-aware; they appear identical in light and dark mode.

### [P0] 1.2 ProviderLogo uses hardcoded hex colors and inline rgba backgrounds
- **File:** `components/ProviderLogo.tsx:10-24`
- **Issue:** Every cloud provider entry has hardcoded `color` and `bg` values:
  ```tsx
  aws: { icon: '...', color: '#FF9900', bg: 'rgba(255, 153, 0, 0.15)' },
  gcp: { icon: '...', color: '#4285F4', bg: 'rgba(66, 133, 244, 0.15)' },
  azure: { icon: '...', color: '#0078D4', bg: 'rgba(0, 120, 212, 0.15)' },
  ```
  These are brand colors that intentionally don't change with the theme — **however** the 0.15 opacity background looks washed out in light mode since it's tuned for dark backgrounds. More critically, the `zIndex: 2` inline style on line 42/53 is orphaned from any z-index scale.
- **Expected:** Provider brand colors are an acceptable exception for the `color` prop (brand identity). However, the `bg` opacity should be theme-aware — use `color-mix(in srgb, ${color} 15%, transparent)` or add light-mode overrides. The z-index should use a named token or at minimum a comment explaining why it's 2.
- **Fix:** Switch `bg` to CSS `color-mix()` or add a `bgLight` field. Remove the orphaned `zIndex: 2` or tie it to a z-index scale.
- **Priority:** P0 — visible theme breakage in light mode (logos nearly invisible).

### [P1] 1.3 TopBar SSE indicator uses inline rgba for border and background
- **File:** `components/TopBar.tsx:239-240`
- **Issue:**
  ```tsx
  const borderColor = isDisconnected ? 'rgba(239, 68, 68, 0.3)' : 'var(--color-border)'
  const bgColor = isDisconnected ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.02)'
  ```
  The connected state uses `rgba(255, 255, 255, 0.02)` which is invisible in light mode (white-on-white).
- **Expected:** Use `var(--color-status-error)` with opacity for disconnected state, and `var(--color-bg-card)` or `var(--glass-bg)` for connected state.
- **Fix:** Replace with `color-mix(in srgb, var(--color-status-error) 30%, transparent)` for border and `color-mix(in srgb, var(--color-status-error) 5%, transparent)` for background. For connected bg, use `var(--color-bg-secondary)` or similar.
- **Priority:** P1

### [P1] 1.4 NotificationsPanel uses inline rgba for panel border
- **File:** `components/NotificationsPanel.tsx:160`
- **Issue:**
  ```tsx
  border: '1px solid rgba(255,255,255,0.1)',
  ```
  And on line 163: `border-b border-white/10` — hardcoded white-based borders break in light mode.
- **Expected:** `border: '1px solid var(--glass-border)'` — the token exists.
- **Fix:** Replace `rgba(255,255,255,0.1)` with `var(--glass-border)` and `border-white/10` with `border-[var(--glass-border)]`.
- **Priority:** P1 — notification panel border is invisible in light mode.

### [P1] 1.5 AiInsightBanner uses inline rgb gradients
- **File:** `components/ai/AiInsightBanner.tsx:57-60`
- **Issue:**
  ```tsx
  'linear-gradient(135deg, rgb(168 85 247 / 0.6), rgb(239 68 68 / 0.6))'   // critical
  'linear-gradient(135deg, rgb(168 85 247 / 0.5), rgb(245 158 11 / 0.5))'  // warning
  'linear-gradient(135deg, rgb(168 85 247 / 0.4), rgb(20 184 166 / 0.4))'  // info
  ```
  These are inline style gradients with raw RGB values. Not theme-aware.
- **Expected:** Define `--gradient-ai-critical`, `--gradient-ai-warning`, `--gradient-ai-info` tokens in globals.css with light-mode overrides.
- **Fix:** Add CSS custom properties in globals.css, override in `html.light`, and reference via `var(--gradient-ai-*)`.
- **Priority:** P1

### [P1] 1.6 InlineAiPanel uses hardcoded purple border color
- **File:** `components/ai/InlineAiPanel.tsx:123`
- **Issue:**
  ```tsx
  style={{ borderLeft: '4px solid rgb(168 85 247 / 0.6)' }}
  ```
  All AI components use `purple-400/500` Tailwind classes or raw RGB purples, but there's no `--color-ai-accent` token.
- **Expected:** Define `--color-ai-accent: #a855f7` (dark) / `#7c3aed` (light) in globals.css.
- **Fix:** Replace all hardcoded purple references with `var(--color-ai-accent)`.
- **Priority:** P1

### [P1] 1.7 Dashboard page uses inline boxShadow rgba
- **File:** `app/page.tsx:389, 422, 473, 530, 626, 630`
- **Issue:** Multiple shadow values hardcoded in className and whileHover:
  ```tsx
  shadow-[0_18px_48px_rgba(0,0,0,0.18)]
  shadow-[0_10px_28px_rgba(91,135,255,0.35)]
  shadow-[0_20px_60px_rgba(0,0,0,0.16)]
  whileHover={{ y: -3, boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}
  ```
  Similar in `components/dashboard/widgets/StatCardsWidget.tsx:62`:
  ```tsx
  whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
  ```
- **Expected:** Use `var(--shadow-card)` from globals.css or define `--shadow-card-hover`, `--shadow-card-elevated` tokens.
- **Fix:** Add shadow tokens to globals.css with light/dark variants and replace inline values.
- **Priority:** P1

### [P2] 1.8 Settings page uses inline glow rgba
- **File:** `app/settings/page.tsx:139-140`
- **Issue:**
  ```tsx
  ? '0 0 8px rgba(0, 229, 153, 0.4)'
  : '0 0 8px rgba(255, 77, 106, 0.4)',
  ```
  The colors approximate `--color-status-active` and `--color-status-error` but use different values (0,229,153 vs the actual #00e599 = 0,229,153 — matches; 255,77,106 vs #ff4d6a = 255,77,106 — matches). While the values are correct, the pattern is fragile.
- **Expected:** Use `var(--glow-healthy)` / `var(--glow-degraded)` — tokens exist.
- **Fix:** Replace with existing glow tokens.
- **Priority:** P2

---

## 2. Spacing Inconsistencies

### [P2] 2.1 Inconsistent card internal padding across pages
- **Files (representative examples):**
  - `app/page.tsx:389` — `px-4 py-4` (dashboard section)
  - `app/page.tsx:473` — `p-4 sm:p-5 2xl:p-6` (chart container)
  - `app/page.tsx:530` — `p-3.5 2xl:p-4` (stat cards)
  - `app/clusters/page.tsx:413` — `p-4` (cluster cards)
  - `components/NodeMetricsTable.tsx:59` — `p-4` (loading state)
  - `components/ui/card.tsx:17` — `p-6` (CardHeader)
  - `components/ui/card.tsx:43` — `p-6 pt-0` (CardContent)
- **Issue:** Cards use `p-3.5`, `p-4`, `p-5`, `p-6` — four different padding values. The shadcn `Card` uses p-6 but most hand-built cards use p-4.
- **Expected:** Standardize: `p-4` for compact cards, `p-5` for standard cards, `p-6` for full-page sections. Define in a design guideline.
- **Fix:** This is a refactor target — document the padding scale first, then normalize.
- **Priority:** P2

### [P2] 2.2 Inconsistent gap values in similar contexts
- **Files:**
  - `components/Skeleton.tsx:25` — `gap-3` (flex row)
  - `components/Skeleton.tsx:35` — `gap-4` (flex row)
  - `components/AddClusterWizard.tsx:356` — `gap-2` (grid)
  - `components/AddClusterWizard.tsx:415` — `gap-3` (grid)
  - `components/AddClusterWizard.tsx:445` — `gap-3` (grid)
- **Issue:** Similar layout contexts (grids, flex rows) use different gap values (gap-2, gap-3, gap-4) without clear rationale.
- **Expected:** `gap-2` for tight groupings (badges, pills), `gap-3` for form fields, `gap-4` for card grids.
- **Fix:** Normalize after documenting the spacing scale.
- **Priority:** P2

---

## 3. Typography

### [P2] 3.1 Sub-12px font sizes used extensively
- **Files (sampling):**
  - `components/metrics/NodeMetricsTable.tsx:33` — `text-[10px]`
  - `components/metrics/NodeMetricsTable.tsx:77` — `text-[10px]`
  - `components/metrics/NodeMetricsTable.tsx:81` — `text-[11px]`
  - `components/PodDetailSheet.tsx:52` — `text-[13px]`
  - `components/PodDetailSheet.tsx:67` — `text-[13px]`
  - `components/Sidebar.tsx:220` — `text-[10px]`
- **Issue:** Arbitrary pixel font sizes (`10px`, `11px`, `13px`) bypass the Tailwind type scale. The `10px` values violate the globals.css comment about enforcing minimum 12px font sizes (DA2-001).
- **Expected:** Use Tailwind scale: `text-xs` (12px), `text-sm` (14px). If 10-11px is truly needed for dense data tables, define `text-2xs` in Tailwind config.
- **Fix:** Replace `text-[10px]` and `text-[11px]` with `text-xs` (or a custom `text-2xs` if density is required). Replace `text-[13px]` with `text-sm`.
- **Priority:** P2

### [P2] 3.2 Mixed font-weight usage for similar UI roles
- **Files:**
  - Section headers use `font-bold` (ErrorBoundary:44) and `font-semibold` (EmptyState:15, NodeMetricsTable:60)
  - Card titles: `font-semibold` in most places, but `font-extrabold` in `AnomalyWidget.tsx:44` and TopBar Stat:262
  - Badges: `font-semibold` (badge.tsx:6) vs `font-medium` (StatusBadge:52) vs `font-bold` (Sidebar:220)
- **Issue:** Three+ font weights used for the same visual role (section titles, badge labels).
- **Expected:** Section titles = `font-semibold`. Badges = `font-medium`. Hero numbers = `font-bold`. Page titles = `font-bold`.
- **Fix:** Normalize font weights to a documented scale.
- **Priority:** P2

---

## 4. Border & Radius

### [P0] 4.1 Card component uses hardcoded zinc colors instead of CSS custom properties
- **File:** `components/ui/card.tsx:8, 35`
- **Issue:**
  ```tsx
  // Card
  'rounded-xl border border-zinc-800 bg-surface text-zinc-50 shadow'
  // CardDescription
  'text-sm text-zinc-400'
  ```
  `border-zinc-800` and `text-zinc-50` are Tailwind static colors — they don't respond to theme changes. This is a shadcn/ui default that was never customized for the project's token system.
- **Expected:** `border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)]` for Card, `text-[var(--color-text-secondary)]` for CardDescription.
- **Fix:** Update card.tsx to use project CSS custom properties.
- **Priority:** P0 — the Card primitive is imported across the app; zinc-800 border looks wrong in light mode.

### [P0] 4.2 Badge `default` variant uses hardcoded zinc colors
- **File:** `components/ui/badge.tsx:10`
- **Issue:**
  ```tsx
  default: 'border-transparent bg-zinc-50 text-zinc-900',
  ```
  `bg-zinc-50` and `text-zinc-900` are static colors — in dark mode, this renders as a bright white badge on a dark background, which looks correct, but the zinc-50/900 pairing is fragile and inconsistent with the rest of the design system.
- **Expected:** `bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]`
- **Fix:** Replace zinc-* colors with CSS custom properties.
- **Priority:** P0 — affects every default badge in the app.

### [P2] 4.3 Inconsistent border-radius across card-like containers
- **Files:**
  - `components/ui/card.tsx:8` — `rounded-xl` (12px)
  - `app/page.tsx:389` — `rounded-2xl` (16px)
  - `app/page.tsx:473` — `rounded-2xl`
  - `app/clusters/page.tsx:413` — `rounded-xl`
  - `components/Skeleton.tsx:19` — `rounded-2xl`
  - `app/clusters/[id]/logs/page.tsx:206` — `rounded-xl`
  - `components/NotificationsPanel.tsx:156` — `rounded-xl`
- **Issue:** Dashboard uses `rounded-2xl` for cards while the rest of the app uses `rounded-xl`. The `Card` primitive itself uses `rounded-xl`.
- **Expected:** All card-like containers should use `rounded-xl` (12px) consistently. `rounded-2xl` reserved for page-level hero sections only.
- **Fix:** Normalize `rounded-2xl` to `rounded-xl` in dashboard page cards.
- **Priority:** P2

---

## 5. Shadow Patterns

### [P2] 5.1 No shadow token scale — each component invents its own
- **Files:**
  - `globals.css:162` — `--shadow-card: 0 8px 32px rgba(0, 0, 0, 0.3)` (only token)
  - `app/page.tsx:389` — `shadow-[0_18px_48px_rgba(0,0,0,0.18)]`
  - `app/page.tsx:473` — `shadow-[0_20px_60px_rgba(0,0,0,0.16)]`
  - `app/page.tsx:626` — `shadow-[0_16px_38px_rgba(0,0,0,0.16)]`
  - `app/page.tsx:630` — hover: `0 24px 60px rgba(0,0,0,0.22)`
  - `dashboard/widgets/StatCardsWidget.tsx:62` — hover: `0 8px 24px rgba(0,0,0,0.12)`
  - `app/clusters/[id]/page.tsx:481` — hover: `0 8px 24px rgba(0,0,0,0.12)`
  - `components/FilterBar.tsx:175` — `shadow-[0_10px_24px_rgba(91,135,255,0.3)]`
- **Issue:** Only `--shadow-card` exists as a token. Every other shadow is a one-off inline value. At least 6 different shadow sizes are used.
- **Expected:** Define a shadow scale: `--shadow-sm`, `--shadow-md` (card), `--shadow-lg` (elevated), `--shadow-xl` (hero), `--shadow-glow-accent`.
- **Fix:** Add shadow scale to globals.css with light/dark variants. Replace inline shadows.
- **Priority:** P2

---

## 6. Duplicate Style Patterns

### [P1] 6.1 Two badge systems — StatusBadge vs Badge
- **Files:**
  - `components/shared/StatusBadge.tsx` — uses `var(--color-status-*)` tokens, `rounded-full` shape
  - `components/ui/badge.tsx` — uses Tailwind colors with `dark:` variants, `rounded-md` shape
  - `app/alerts/page.tsx:293-301` — defines yet another inline badge map using Tailwind colors
  - `components/anomalies/AnomalyCard.tsx:20-38` — yet another badge color map
- **Issue:** Four different badge color definitions:
  1. `StatusBadge` — CSS custom properties, rounded-full
  2. `Badge` (shadcn) — Tailwind zinc/red/emerald/amber colors, rounded-md
  3. Alerts page — inline `bg-red-500/15 text-red-300` classes
  4. AnomalyCard — inline `bg-red-50 text-red-600 dark:bg-red-500/20` classes
- **Expected:** Single badge system using CSS custom properties (the StatusBadge approach).
- **Fix:** Extend `StatusBadge` or `Badge` to cover all severity/status variants. Remove inline badge maps.
- **Priority:** P1

### [P1] 6.2 Error/validation colors — three different reds
- **Files:**
  - `AddClusterWizard.tsx:399-550` — `text-red-400` (20+ instances)
  - `app/login/page.tsx:327, 352` — `text-red-400`
  - `app/settings/teams/page.tsx:265` — `text-red-300`
  - `app/settings/users/page.tsx:356` — `text-red-400`
  - `components/ui/badge.tsx:12` — `text-red-500` (light) / `text-red-400/90` (dark)
  - StatusBadge — `var(--color-status-error)` (#ff4d6a)
- **Issue:** Validation errors use `text-red-400` (Tailwind), `text-red-300` (teams page), while the token system defines `--color-status-error: #ff4d6a`. These are three different reds.
- **Expected:** All error text should use `text-[var(--color-status-error)]`.
- **Fix:** Replace all `text-red-300/400` for validation errors with `text-[var(--color-status-error)]`.
- **Priority:** P1

### [P2] 6.3 Health status icons — duplicated across three components
- **Files:**
  - `components/ClusterHealthIndicator.tsx:69-73` — CheckCircle2/AlertTriangle/XCircle with emerald-400/amber-400/red-400
  - `app/clusters/page.tsx:128-132` — same icons with same Tailwind colors
  - Multiple anomaly/alert components — same pattern
- **Issue:** The health-status-to-icon mapping is copy-pasted. If the color tokens change, 3+ files need updating.
- **Expected:** Single `HealthIcon` component or a shared `STATUS_ICON_MAP` constant.
- **Fix:** Extract shared `getHealthIcon(status)` utility.
- **Priority:** P2

---

## 7. Z-Index Management

### [P0] 7.1 No z-index scale — scattered magic numbers
- **Files:**
  - `components/CommandPalette.tsx:180` — `z-[100]`
  - `components/AppLayout.tsx:76` — `focus:z-[100]` (skip-to-content)
  - `app/layout.tsx:42` — `z-[200]` (loading bar)
  - `components/NotificationsPanel.tsx:156` — `z-50`
  - `components/ProviderLogo.tsx:42` — `zIndex: 2` (inline)
  - `components/dashboard/WidgetWrapper.tsx:42, 52, 62` — `z-10`
  - `components/AppLayout.tsx:88` — `z-50` (mobile menu)
- **Issue:** Z-index values span from 2 to 200 with no documented scale. The Command Palette at z-[100] and the loading bar at z-[200] could collide with future overlays. The ProviderLogo `zIndex: 2` is likely a stacking context fix, not intentional layering.
- **Expected:** Define a z-index scale in globals.css or a constants file:
  ```
  --z-base: 0
  --z-dropdown: 50
  --z-sticky: 100
  --z-overlay: 200
  --z-modal: 300
  --z-toast: 400
  --z-max: 9999
  ```
- **Fix:** Add CSS custom properties for z-index scale. Replace all `z-[N]` and `z-50` with `z-[var(--z-dropdown)]` etc.
- **Priority:** P0 — the loading bar (z-200) could render behind a future modal; command palette (z-100) already conflicts with conceptual scope of z-50 overlays.

---

## 8. Transition / Animation

### [P2] 8.1 Mixed transition type classes — no standard
- **Files (sampling from transition search — 80+ occurrences):**
  - `transition-colors` — 60+ instances (most common)
  - `transition-all` — 15+ instances (AddClusterWizard:367, Sidebar:118, pods page:222, etc.)
  - `transition-opacity` — 3 instances (ErrorBoundary:53, 126, AddClusterWizard:583)
  - `transition-transform` — 1 instance
- **Issue:** Most components use `transition-colors`, but some use `transition-all` which animates layout properties (width, height, padding) and can cause layout thrashing. The `transition-all` usage in `AddClusterWizard.tsx:367` and `pods/page.tsx:222` are likely unintentional.
- **Expected:** Default: `transition-colors`. Use `transition-all` only when explicitly needed for size/position changes. Use `transition-opacity` for fade-only.
- **Fix:** Replace `transition-all` with `transition-colors` where only color changes are needed.
- **Priority:** P2

### [P2] 8.2 Animation durations in CSS vs JS not perfectly aligned
- **Files:**
  - `globals.css:140-142` — `--duration-fast: 150ms`, `--duration-normal: 200ms`, `--duration-slow: 300ms`
  - `animation-constants.ts:8-14` — `fast: 0.15`, `normal: 0.2`, `slow: 0.3` (seconds)
- **Issue:** The values are equivalent but the CSS uses milliseconds while JS uses seconds. This is technically correct (CSS uses ms, Motion uses s), but there's no documentation tying them together. A developer could change one without the other.
- **Expected:** Add a comment in both files referencing the other as the source of truth.
- **Fix:** Add cross-reference comments.
- **Priority:** P2 (documentation/maintenance risk)

---

## 9. Dark / Light Theme Gaps

### [P1] 9.1 `bg-white/[0.0x]` hover pattern breaks in light mode
- **Files (68 occurrences across the codebase):**
  - `components/Sidebar.tsx:133` — `hover:bg-white/[0.04]`
  - `components/NotificationsPanel.tsx:144, 206` — `hover:bg-white/[0.04]`
  - `components/PodLogStream.tsx:147, 155, 167, 183` — `hover:bg-white/[0.06]`, `hover:bg-white/[0.02]`
  - `app/clusters/page.tsx:413, 433, 444, 470, 488, 499` — various `bg-white/[0.02-0.06]`
  - `app/settings/audit/page.tsx:126, 252` — `hover:bg-white/[0.06]`, `hover:bg-white/[0.02]`
  - `components/dashboard/*` — multiple instances
  - ... and 50+ more across the codebase
- **Issue:** `bg-white/[0.04]` applies a semi-transparent white overlay. In dark mode, this creates a subtle lighten effect (intended). In light mode, this is nearly invisible — white on near-white background. The hover feedback is lost.
- **Expected:** Use a theme-aware hover token like `hover:bg-[var(--color-bg-card-hover)]` or define a `--color-hover-overlay` that's `rgba(255,255,255,0.04)` in dark and `rgba(0,0,0,0.04)` in light.
- **Fix:** Add `--color-hover-overlay: rgba(255,255,255,0.04)` (dark) / `rgba(0,0,0,0.04)` (light) to globals.css. Replace all `bg-white/[0.0x]` with `bg-[var(--color-hover-overlay)]`.
- **Priority:** P1 — 68 interactive elements lose hover feedback in light mode.

### [P2] 9.2 `dark:` variant used inconsistently — most components don't use it
- **Files:**
  - `components/ui/badge.tsx:12-14` — uses `dark:` prefixes for theme variants
  - `components/anomalies/AnomalyCard.tsx:20-38` — uses `dark:` prefixes
  - `app/login/page.tsx:281` — `dark:text-red-400`
  - `app/alerts/page.tsx:466` — `dark:bg-white/[0.02]`
  - `app/settings/permissions/page.tsx:165` — `dark:` prefix
- **Issue:** The project uses CSS custom properties for theming (set via `html.light` in globals.css), NOT the `dark:` Tailwind variant. Only 5 files use `dark:` — these are inconsistent with the project's theming approach.
- **Expected:** All theming via CSS custom properties. Remove `dark:` prefixes.
- **Fix:** Replace `dark:bg-red-950/40 dark:text-red-400/90` in badge.tsx with CSS custom property–based classes, consistent with `StatusBadge` approach. Similarly for AnomalyCard and other files.
- **Priority:** P2

### [P2] 9.3 Light mode surface scale missing
- **File:** `globals.css:74-79` (dark) vs `globals.css:183-187` (light)
- **Issue:** Dark mode defines a 4-level surface scale:
  ```css
  --surface-0: hsl(230 15% 7%);
  --surface-1: hsl(230 15% 10%);
  --surface-2: hsl(230 15% 13%);
  --surface-3: hsl(230 15% 17%);
  ```
  Light mode has NO equivalent surface scale — only `--surface: #ffffff` and `--elevated: #ffffff`.
- **Expected:** Define light-mode surface scale: `--surface-0: #ffffff`, `--surface-1: #f8fafc`, `--surface-2: #f1f5f9`, `--surface-3: #e2e8f0`.
- **Fix:** Add `--surface-0` through `--surface-3` to `html.light` in globals.css.
- **Priority:** P2

---

## 10. Icon Sizing

### [P2] 10.1 Inconsistent icon sizes in similar contexts
- **Files:**
  - Navigation icons: `h-4 w-4` (TopBar:198, CommandPalette:194) — consistent
  - Action buttons: Mix of `h-3 w-3` (TopBar:185, search), `h-3.5 w-3.5` (PodLogStream:150, FilterBar:121), and `h-4 w-4` (CommandPalette icons)
  - Empty state icons: `h-10 w-10` (ErrorBoundary:43, EmptyState:14) vs `h-6 w-6` (MetricsEmptyState:40) vs `h-7 w-7` (deployments:405) vs `h-8 w-8` (PodDetailSheet:167, deployments:458)
  - Status dots: `h-2 w-2` (Sidebar:229, TopBar:249), `h-2.5 w-2.5` (PodDetailSheet:66), `h-1.5 w-1.5` (PodLogStream:120, StatusBadge)
- **Issue:** Four different icon sizes for action buttons. Four different sizes for empty state icons. Three different sizes for status dots.
- **Expected:** Document icon size scale:
  - Status dots: `h-1.5 w-1.5` (inline), `h-2 w-2` (standalone)
  - Action buttons: `h-3.5 w-3.5`
  - Nav icons: `h-4 w-4`
  - Empty state: `h-10 w-10`
- **Fix:** Normalize after documenting the scale.
- **Priority:** P2

---

## 11. CSS Custom Property Naming

### [P3] 11.1 Inconsistent naming conventions
- **File:** `globals.css`
- **Issue:** Properties use three different naming patterns:
  - `--color-bg-*` (background colors)
  - `--color-text-*` (text colors)
  - `--surface-*` (bare noun, no `color-` prefix)
  - `--glass-*` (bare noun)
  - `--glow-*` (bare noun)
  - `--shadow-card` (bare noun)
  - `--background` / `--surface` / `--elevated` (bare nouns)
- **Expected:** Either use a `--vp-` prefix for all project tokens or consistently use the `--color-` prefix for all color tokens and `--shadow-` for shadows.
- **Fix:** This is a large refactor. Document the intended convention and apply it during the next design system overhaul.
- **Priority:** P3

### [P3] 11.2 Unused CSS custom properties
- **File:** `globals.css`
- **Issue:** The following properties are defined but likely unused (no grep matches in TSX):
  - `--color-surface-secondary` — defined line 81, appears in StatusBadge only
  - `--color-brand` — defined line 82, no TSX usage found
  - `--watermark-opacity` — defined line 155/246, no usage found
  - `--sidebar-hover-shift` — defined line 170, used only in globals.css itself
  - `--gradient-text-healthy` — defined line 174, no TSX usage found
  - `--gradient-text-warning` — defined line 175, no TSX usage found
- **Expected:** Remove unused properties to reduce cognitive load.
- **Fix:** Verify with `grep` and remove dead properties.
- **Priority:** P3

---

## 12. Component Pattern Inconsistencies

### [P1] 12.1 Log level coloring — three different implementations
- **Files:**
  - `components/PodLogStream.tsx:101-103` — returns Tailwind classes: `text-red-400`, `text-yellow-400`, `text-blue-400`
  - `app/clusters/[id]/logs/page.tsx:230` — inline ternary: `isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : isDebug ? 'text-gray-400' : ''`
  - `app/logs/page.tsx:535` — another inline ternary: `'ERROR' ? 'text-red-400' : 'WARN' ? 'text-yellow-400' : 'INFO' ? 'text-blue-400' : 'DEBUG' ? 'text-gray-400' : ''`
- **Issue:** Same log-level-to-color mapping implemented three times. Uses Tailwind static colors, not CSS custom properties.
- **Expected:** Extract a `getLogLevelColor(level)` utility that returns `var(--color-log-level-error)` etc.
- **Fix:** Create shared utility, add log-level color tokens to globals.css.
- **Priority:** P1

### [P1] 12.2 SSE connection status — two implementations
- **Files:**
  - `components/SSEIndicator.tsx:6-9` — uses `bg-yellow-500`, `bg-green-500`, `bg-orange-500`, `bg-red-500`
  - `components/TopBar.tsx:227-240` — uses `var(--color-status-*)` tokens for dot, but `rgba()` for border/bg
- **Issue:** SSEIndicator uses Tailwind colors while TopBar uses CSS custom properties. Two components showing SSE status with different color systems.
- **Expected:** Both should use CSS custom properties.
- **Fix:** Update SSEIndicator to use `bg-[var(--color-status-*)]` tokens.
- **Priority:** P1

### [P2] 12.3 Clusters page log background uses hardcoded hex
- **File:** `app/clusters/[id]/logs/page.tsx:206`
- **Issue:**
  ```tsx
  bg-[#0d0d0d]
  ```
  A hardcoded near-black background for the log viewer. The globals.css defines `--color-log-bg: #0d1117` which is a slightly different shade.
- **Expected:** Use `bg-[var(--color-log-bg)]`.
- **Fix:** Replace `bg-[#0d0d0d]` with `bg-[var(--color-log-bg)]`.
- **Priority:** P2

### [P3] 12.4 Loading bar in layout uses Tailwind gradient colors
- **File:** `app/layout.tsx:42`
- **Issue:**
  ```tsx
  <div className="h-0.5 w-full bg-gradient-to-r from-teal-500 to-indigo-500 fixed top-0 left-0 z-[200]" />
  ```
  Uses `teal-500` and `indigo-500` (Tailwind static) instead of the project accent color.
- **Expected:** Use `from-[var(--color-accent)] to-[var(--color-logo-gradient-start)]` or similar project tokens.
- **Fix:** Replace with tokenized gradient.
- **Priority:** P3

### [P3] 12.5 Logs page search highlight uses Tailwind yellow
- **File:** `app/logs/page.tsx:85`
- **Issue:**
  ```tsx
  className="rounded bg-yellow-400/30 text-yellow-200 px-0.5"
  ```
  Search highlight uses Tailwind colors, not tokens.
- **Expected:** Add `--color-highlight-bg` and `--color-highlight-text` tokens.
- **Fix:** Define tokens and apply.
- **Priority:** P3

### [P3] 12.6 Dashboards empty state uses Tailwind indigo
- **File:** `app/dashboards/page.tsx:20`
- **Issue:**
  ```tsx
  bg-gradient-to-br from-[var(--color-accent)]/20 to-indigo-600/20
  ```
  Mixes a CSS custom property with a Tailwind static color in the same gradient.
- **Expected:** Use `to-[var(--color-accent)]/20` or define a gradient token.
- **Fix:** Replace `indigo-600` with the accent token.
- **Priority:** P3

---

## Prioritized Fix Plan

### Phase 1 — P0 Fixes (4 items, critical)
1. **Card/Badge primitives** — Replace zinc-* colors in `card.tsx` and `badge.tsx` with CSS custom properties
2. **Z-index scale** — Define `--z-dropdown`, `--z-overlay`, `--z-modal`, `--z-toast` tokens; update all z-index usages
3. **ProviderLogo light-mode** — Add theme-aware background opacity
4. **Badge default variant** — Fix zinc-50/900 to use tokens

### Phase 2 — P1 Fixes (11 items, high impact)
1. **Hover overlay token** — Add `--color-hover-overlay` to globals.css; replace 68 `bg-white/[0.0x]` instances
2. **Metrics chart colors** — Add threshold tokens; replace hardcoded HSL in 5 metrics components
3. **Error text consolidation** — Replace all `text-red-300/400` with `text-[var(--color-status-error)]`
4. **Badge unification** — Consolidate 4 badge color systems into one
5. **Log level colors** — Extract shared utility, add tokens
6. **AI accent token** — Add `--color-ai-accent`; replace purple-400/500 hardcodes
7. **Dashboard shadows** — Add shadow scale tokens
8. **SSE indicator** — Update to use CSS custom properties
9. **NotificationsPanel border** — Replace rgba with `var(--glass-border)`
10. **TopBar SSE rgba** — Replace with token-based colors
11. **AiInsightBanner gradients** — Tokenize AI gradients

### Phase 3 — P2/P3 Fixes (17 items, maintenance)
- Normalize card padding, gap values, border-radius
- Document and enforce icon size scale
- Replace `dark:` prefixes with CSS custom property approach
- Add light-mode surface scale
- Add shadow token scale
- Remove `transition-all` where unnecessary
- Clean up sub-12px font sizes
- Normalize font weights
- Remove unused CSS custom properties
- Fix remaining hardcoded colors (log bg, loading bar, search highlight)
- Cross-reference animation duration files

---

## Appendix: Token Inventory

### globals.css Custom Properties (83 defined)
| Category | Count | Examples |
|----------|-------|---------|
| Surface/Background | 12 | `--background`, `--surface`, `--elevated`, `--surface-0` through `--surface-3`, `--color-bg-*` |
| Text | 8 | `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-text-dim`, etc. |
| Border | 3 | `--color-border`, `--color-border-hover`, `--color-separator` |
| Status | 5 | `--color-status-active`, `--color-status-idle`, `--color-status-error`, `--color-status-warning`, `--color-status-healthy` |
| Chart | 8 | `--color-chart-cpu`, `--color-chart-mem`, etc. |
| Glow | 8 | `--glow-healthy`, `--glow-healthy-hover`, etc. |
| Glass | 4 | `--glass-bg`, `--glass-border`, `--glass-blur`, `--glass-border-hover` |
| Animation | 5 | `--duration-fast`, `--duration-normal`, `--duration-slow`, `--duration-pulse`, `--duration-rotate` |
| Logo | 4 | `--color-logo-gradient-*`, `--color-logo-flame-*` |
| Other | 26 | Gradients, card hover, watermark, sidebar, accent, log colors, grid lines |

### Missing Tokens (recommended additions)
| Token | Purpose |
|-------|---------|
| `--color-hover-overlay` | Theme-aware hover background (replaces bg-white/[0.0x]) |
| `--color-ai-accent` | AI feature accent color (purple) |
| `--color-threshold-high` | Red for high utilization |
| `--color-threshold-warn` | Yellow for warning utilization |
| `--color-threshold-normal` | Green for normal utilization |
| `--color-log-level-error` | Log level: error |
| `--color-log-level-warn` | Log level: warning |
| `--color-log-level-info` | Log level: info |
| `--color-log-level-debug` | Log level: debug |
| `--color-highlight-bg` | Search match highlight background |
| `--color-highlight-text` | Search match highlight text |
| `--shadow-sm` | Subtle shadow |
| `--shadow-md` | Card shadow |
| `--shadow-lg` | Elevated shadow |
| `--shadow-xl` | Hero shadow |
| `--shadow-glow-accent` | Accent glow shadow |
| `--z-dropdown` | Dropdown z-index (50) |
| `--z-sticky` | Sticky header z-index (100) |
| `--z-overlay` | Overlay z-index (200) |
| `--z-modal` | Modal z-index (300) |
| `--z-toast` | Toast z-index (400) |
| `--gradient-ai-critical` | AI insight critical gradient |
| `--gradient-ai-warning` | AI insight warning gradient |
| `--gradient-ai-info` | AI insight info gradient |
