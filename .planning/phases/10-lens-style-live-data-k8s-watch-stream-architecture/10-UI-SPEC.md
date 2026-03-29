---
phase: 10
slug: lens-style-live-data-k8s-watch-stream-architecture
status: draft
shadcn_initialized: false
preset: none
created: 2026-03-29
---

# Phase 10 -- UI Design Contract

> Visual and interaction contract for the Lens-style live data pipeline. This phase is primarily infrastructure (backend WatchManager, SSE rewrite, polling removal). The UI contract covers **four** surface areas: live data indicators, SSE connection status, real-time list mutation animations, and watch error surfacing.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (via packages/ui/) |
| Preset | not applicable (Tailwind 4 with CSS custom properties, no components.json) |
| Component library | Radix primitives (via shadcn/ui) |
| Icon library | lucide-react |
| Font | System font stack (already configured) |

Source: Existing project conventions from `apps/web/CLAUDE.md` and `globals.css`.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline padding, indicator dot margins |
| sm | 8px | Compact element spacing, badge internal padding |
| md | 16px | Default element spacing |
| lg | 24px | Section padding |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: none -- this phase introduces no new layout structures, only small indicator components that fit within existing spacing.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 (regular) | 1.5 |
| Label | 12px | 500 (medium) | 1.4 |
| Heading | 20px | 800 (extrabold) | 1.2 |
| Mono (indicators) | 11px | 400 (regular) | 1.0 |

Source: Existing project conventions. The "Mono" role is used by the existing `DataFreshnessBadge` (11px, `font-mono`, `text-xs`). All new indicators in this phase follow the same pattern.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--color-bg-primary)` / `#0a0a0f` dark, `#f8fafc` light | Background, surfaces |
| Secondary (30%) | `var(--color-bg-card)` / `#14141f` dark, `#ffffff` light | Cards, sidebar, nav, cluster header |
| Accent (10%) | `var(--color-accent)` / `#7c8cf8` dark, `#4f46e5` light | Primary CTA buttons, active tab indicators, reconnect link |
| Destructive | `var(--color-status-error)` / `#ff4d6a` dark, `#dc2626` light | Destructive actions, error states, disconnected status |

Accent reserved for: primary CTA buttons, active tab underline indicator, "Reconnect" link on disconnected clusters. **Not** used for live data indicators (those use `--color-status-active` green).

### Phase 10-Specific Color Tokens

These are the color tokens for the new UI elements introduced in this phase. All use existing CSS custom properties -- **no new tokens required**.

| Semantic Purpose | Token | Dark Value | Light Value |
|-----------------|-------|------------|-------------|
| Live/Connected | `--color-status-active` | `#00e599` | (inherited) |
| Reconnecting | `--color-status-warning` | `#f6c042` | (inherited) |
| Disconnected/Error | `--color-status-error` | `#ff4d6a` | `#dc2626` |
| Idle/No data | `--color-status-idle` | `#8090ab` | (inherited) |

Source: All tokens already exist in `globals.css` `:root` block.

---

## New UI Components

This phase introduces **three** small UI components and **one** animation pattern. No new pages or layouts.

### 1. ConnectionStatusBadge

**Purpose:** Show SSE connection health in the cluster header (next to provider badge and cluster status).
**Location:** `apps/web/src/app/clusters/[id]/layout.tsx` -- inside the cluster header `<div>`, after the cluster status badge.

| State | Dot Color | Label | Dot Animation | Visibility |
|-------|-----------|-------|---------------|------------|
| Connected | `--color-status-active` | "Live" | `animate-pulse` (CSS, 2s ease-in-out infinite) | Always visible when SSE is open |
| Reconnecting | `--color-status-warning` | "Reconnecting..." | `animate-pulse` (CSS) | Visible only during reconnection |
| Disconnected | `--color-status-error` | "Disconnected" | none (static) | Visible when SSE has failed after max retries |
| Initializing | `--color-status-idle` | "Connecting..." | `animate-pulse` (CSS) | Visible during initial SSE handshake |

**Visual spec:**
- Container: `inline-flex items-center gap-1.5`
- Dot: `h-1.5 w-1.5 rounded-full` with background set via inline `style={{ background: <color-var> }}`
- Label: `text-xs font-mono` with color set via inline `style={{ color: <color-var> }}`
- Transition between states: `transition-colors duration-150` on both dot and label
- Data attribute: `data-connection={state}` for testing

**Pattern precedent:** Matches existing `DataFreshnessBadge` exactly (same dot size, same font, same inline color approach). This is intentional -- the two badges are visually siblings.

**Reduced motion:** The `animate-pulse` is CSS-only (already respects `prefers-reduced-motion` via globals.css). No Motion library needed for this component.

### 2. WatchErrorToast

**Purpose:** Surface watch errors (informer failures, auth errors) to the user without blocking the UI.
**Mechanism:** Use existing `sonner` toast library (already imported in `providers.tsx` as `<Toaster />`).

| Error Type | Toast Variant | Message | Duration |
|------------|--------------|---------|----------|
| Auth error (401/403) | `toast.error()` | "Lost access to {clusterName}. Check permissions." | Persistent (no auto-dismiss) |
| Network error | `toast.warning()` | "Connection interrupted. Reconnecting..." | 5 seconds |
| Watch 410 Gone | No toast | (Handled silently -- informer re-lists automatically) | N/A |
| Unknown error | `toast.error()` | "Live data interrupted for {resourceType}. Retrying..." | 8 seconds |

**Behavior rules:**
- Deduplicate: Same error for same cluster within 10 seconds does not produce a second toast. Use `toast()` with `id` parameter: `toast.error(msg, { id: \`watch-error-\${clusterId}\` })`.
- Auth errors are persistent because they require user action (re-login or fix RBAC).
- Network errors auto-dismiss because reconnection is automatic.
- No toast on 410 Gone -- this is a normal K8s Watch lifecycle event, not an error.

### 3. Real-Time List Mutation Animations

**Purpose:** When SSE delivers ADDED/MODIFIED/DELETED events and `setQueryData` updates TanStack Query cache, the UI should animate smoothly rather than jump.

**Location:** All resource list pages that use `ResourcePageScaffold` and `ExpandableCard`.

#### ADDED -- New Resource Appears

- Animation: `listItemVariants` from `animation-constants.ts` (opacity 0 + y: 6 -> opacity 1 + y: 0, duration `DURATION.normal` = 200ms, ease `EASING.default`)
- The new item slides up from below and fades in
- Wrap each list item in `<AnimatePresence>` with `key={resource.namespace + '/' + resource.name}`
- If 5+ items are added in a single batch (e.g., Deployment scale-up), stagger at `STAGGER.fast` (30ms) to avoid visual overload

#### MODIFIED -- Resource Updates In-Place

- Animation: Brief background flash using CSS keyframe `success-flash` (already defined in globals.css -- 0 -> green 10% opacity at 30% -> transparent at 100%, duration 0.6s)
- Apply class `animate-success-flash` to the modified row/card for 600ms, then remove
- No position or opacity change -- the item stays in place
- The flash provides visual confirmation that data is fresh without being disruptive

#### DELETED -- Resource Disappears

- Animation: `listItemVariants.exit` (opacity 0 + scale 0.95, duration `DURATION.fast` = 150ms, ease `EASING.exit`)
- The item shrinks slightly and fades out
- `AnimatePresence` handles exit animation before DOM removal
- Exit is faster than enter (150ms vs 200ms) per DESIGN.md rule "Exit faster than enter"

**Reduced motion:** All Motion animations check `useReducedMotion()`. When reduced motion is preferred:
- ADDED: instant appear (no slide/fade)
- MODIFIED: no flash (or 1-frame border highlight)
- DELETED: instant remove (no shrink/fade)

### 4. Removal of Polling Indicators

**Purpose:** With all `refetchInterval` removed, any existing UI that shows "auto-refreshing" or "next refresh in..." must be removed or replaced.

**Affected component:** `DataFreshnessBadge` -- currently calculates freshness from `dataUpdatedAt` timer. After this phase, it is replaced by `ConnectionStatusBadge` in the cluster header. The `DataFreshnessBadge` component remains only on the Metrics page (which still uses SSE polling for metrics-server data).

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Connected indicator | "Live" |
| Reconnecting indicator | "Reconnecting..." |
| Disconnected indicator | "Disconnected" |
| Initializing indicator | "Connecting..." |
| Auth error toast | "Lost access to {clusterName}. Check permissions." |
| Network error toast | "Connection interrupted. Reconnecting..." |
| Unknown error toast | "Live data interrupted for {resourceType}. Retrying..." |
| Empty state heading | N/A (no new pages -- existing empty states unchanged) |
| Empty state body | N/A |
| Primary CTA | N/A (no new CTAs -- this phase is infrastructure) |
| Destructive confirmation | N/A (no destructive actions in this phase) |

All toast messages follow the pattern: **[what happened] + [what to do / what is happening next]**.

---

## Interaction Contracts

### SSE Connection Lifecycle (User-Visible)

```
Page load
  |-> ConnectionStatusBadge shows "Connecting..." (idle color, pulsing dot)
  |-> tRPC query fires for initial data (instant from in-memory store)
  |-> SSE EventSource opens
  |
  v
SSE connected
  |-> Badge transitions to "Live" (green, pulsing dot)
  |-> All subsequent data updates come via SSE -> setQueryData
  |
  v (on error)
SSE disconnected
  |-> Badge transitions to "Reconnecting..." (amber, pulsing dot)
  |-> Toast: "Connection interrupted. Reconnecting..."
  |-> Exponential backoff reconnection (handled by EventSource native retry + custom logic)
  |
  v (on reconnect)
SSE reconnected
  |-> Badge transitions back to "Live" (green)
  |-> No toast (clean reconnection is silent)
  |
  v (on max retries exceeded)
SSE failed
  |-> Badge shows "Disconnected" (red, static dot)
  |-> Toast: persistent error with guidance
  |-> Data remains at last-known state (no blank screen)
```

### Data Staleness After Disconnect

When SSE disconnects, existing data in TanStack Query cache remains visible. There is **no** blank screen or loading spinner. The `ConnectionStatusBadge` is the sole indicator that data may be stale. When SSE reconnects, the informer re-lists and pushes fresh data via SSE, which `setQueryData` applies.

### Tab Switching Within a Cluster

Per D-05 (Per-Cluster Persistent watches), switching tabs within a cluster does NOT reconnect SSE. The `useResourceSSE` hook lives in the cluster layout, not in individual tab pages. Tab switch = AnimatePresence page transition only. Data is immediately available from TanStack Query cache (populated by SSE).

---

## Animation Token Usage

All animations use tokens from `apps/web/src/lib/animation-constants.ts`. No magic numbers.

| Animation | Token | Value |
|-----------|-------|-------|
| New item enter | `listItemVariants.visible` | opacity 0->1, y 6->0, 200ms |
| Item exit | `listItemVariants.exit` | opacity 0, scale 0.95, 150ms |
| Update flash | `success-flash` keyframe (CSS) | 600ms green flash |
| Badge state transition | CSS `transition-colors` | `duration-150` (150ms) |
| Page tab transition | `pageVariants` | opacity + y, 250ms enter / 150ms exit |
| Batch stagger | `STAGGER.fast` | 30ms between items |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | No new components for this phase | not required |

This phase does not install any new shadcn components or third-party registry blocks. All new UI is built from existing primitives (CSS classes, sonner toasts, Motion variants).

---

## Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Reduced motion | `useReducedMotion()` on all Motion components; CSS `prefers-reduced-motion` for `animate-pulse` |
| Screen reader | `ConnectionStatusBadge` includes `aria-live="polite"` for state changes, `role="status"` |
| Color + icon | Status is conveyed by dot color AND text label -- never color alone |
| Focus management | No new focusable elements (badges are informational, not interactive) |
| Toast accessibility | sonner `<Toaster />` already handles `role="alert"` and focus trapping |

---

## Theme Support

Both dark and light themes are covered by using CSS custom properties exclusively. No hardcoded hex values in component code.

| Element | Dark | Light |
|---------|------|-------|
| Live dot | `--color-status-active` (#00e599) | inherited |
| Warning dot | `--color-status-warning` (#f6c042) | inherited |
| Error dot | `--color-status-error` (#ff4d6a) | #dc2626 |
| Idle dot | `--color-status-idle` (#8090ab) | inherited |
| Update flash bg | `rgba(34, 197, 94, 0.1)` (from `success-flash` keyframe) | same (green at 10% opacity works in both) |

---

## Files Changed (UI Only)

This is the frontend file impact for the UI contract. Backend files are not listed here.

| File | Change |
|------|--------|
| `apps/web/src/hooks/useResourceSSE.ts` | **REWRITE**: Parse full objects, apply via `setQueryData`, expose connection state |
| `apps/web/src/app/clusters/[id]/layout.tsx` | **MODIFY**: Add `ConnectionStatusBadge` to cluster header |
| `apps/web/src/components/ConnectionStatusBadge.tsx` | **NEW**: SSE connection state indicator |
| `apps/web/src/components/expandable/ExpandableCard.tsx` | **MODIFY**: Wrap items in `AnimatePresence` with stable keys for enter/exit |
| `apps/web/src/components/resource/ResourcePageScaffold.tsx` | **MODIFY**: Add `animate-success-flash` class on MODIFIED items |
| 48 page/component files with `refetchInterval` | **MODIFY**: Remove all `refetchInterval` options from `useQuery` calls |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
