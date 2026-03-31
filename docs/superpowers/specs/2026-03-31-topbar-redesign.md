# Top Bar Redesign — Linear Minimal

**Date:** 2026-03-31
**Style:** Option E — Linear Minimal (Linear.app-inspired)
**Status:** Approved

## Summary

Replace the current TopBar with an ultra-clean, near-invisible header. Remove cluster selector, CPU indicator, alerts badge, and Live connection status. Keep logo, command palette, theme toggle, notifications, and add a user avatar dropdown menu with profile, settings, and logout.

## What Changes

### Removed
- Cluster selector dropdown (center section)
- CPU percentage indicator
- Alerts badge
- ConnectionStatus "Live" indicator
- Standalone logout button
- User name text display

### Kept (redesigned)
- Voyager logo SVG (`/logo-mark.svg`) + "VOYAGER" text
- `⌘K` command palette trigger
- ThemeToggle (sun/moon icon)
- NotificationsPanel (bell + badge)

### Added
- User avatar button (initials, e.g. "VK") with dropdown menu
  - Profile (future — navigates to user profile page)
  - Settings (future — navigates to user settings page)
  - Separator
  - Log out (replaces standalone logout button)

## Visual Design

### Layout
```
[Logo 32px] [VOYAGER]                    [⌘K pill] [theme] [bell+badge] [avatar]
─────────────────────────────────────────────────────────────────────────────────
```

- Height: 56px (`h-14`, unchanged)
- Background: `bg-[var(--color-bg-primary)]/95 backdrop-blur-lg` (same frosted glass as current — needed for fixed header over scrolling content)
- Border: single `border-b border-[var(--color-border)]`
- Padding: `px-3 sm:px-6` (unchanged)
- Position: `fixed top-0 left-0 right-0 z-50` (unchanged)

### Element Styling

**Logo area (left):**
- Logo: `<img>` tag, 32x32px, unchanged SVG file
- Text: "VOYAGER", 13px, font-weight 700, letter-spacing 0.08em
- Color: `--color-text-secondary` (muted by default)
- Hover: text shifts to `--color-text-primary`

**⌘K pill:**
- No background, no border by default (transparent)
- Contains: Search icon (14px) + `⌘K` kbd element
- Hover: border appears (`--color-border`), bg fills (`--color-bg-secondary`)
- Kbd label: `--color-text-dim` default, brightens to `--color-text-muted` on hover
- Height: 32px, border-radius: 8px

**Icon buttons (theme, notifications):**
- Size: 36x36px, border-radius: 8px
- Color: `--color-text-muted` default
- Background: transparent, no border
- Hover: color shifts to `--color-text-primary`
- Accent underline: 2px pseudo-element (fixed width 14px, centered), animates via `scaleX(0)→scaleX(1)` with `transform-origin: center` — never animate width (DESIGN.md anti-pattern)
- All hover states require `transition-colors duration-150` on Tailwind classes
- Badge (notifications): muted gray by default, glows accent + scale(1.1) on parent hover

**User avatar:**
- Size: 30x30px, border-radius: 8px
- Background: `--color-bg-secondary`, border: 1px `--color-border`
- Text: user initials, 11px, font-weight 600, `--color-text-secondary`
- Hover: border → `--color-border-hover`, bg → `--color-bg-card`, text → `--color-text-primary`

### User Dropdown Menu

**Trigger:** Click on avatar button
**Position:** absolute, anchored below avatar, right-aligned
**Width:** 200px
**Background:** `--color-bg-secondary`
**Border:** 1px `--color-border-hover`, border-radius: 12px
**Shadow:** Dark: `0 8px 24px rgba(0,0,0,0.4)` / Light: `0 8px 24px rgba(0,0,0,0.12)` (use CSS variable or `.dark` class)
**Padding:** 6px

**Contents:**
1. Header section: user name (13px bold) + email (11px muted), bottom border
2. "Profile" item with user icon
3. "Settings" item with gear icon
4. Separator line
5. "Log out" item with logout icon (red/danger color)

**Item styling:**
- Padding: 8px 12px, border-radius: 8px
- Icons: 15px, opacity 0.6
- Hover: `var(--color-bg-card-hover)` background (theme-aware), text brightens
- Danger hover: `hover:bg-[var(--color-status-error)]/10` (theme-aware)

**Close behavior:** Click outside or press Escape

## Animation Specification

All animations map to existing `animation-constants.ts` tokens. No new keyframes needed.

**CSS transitions (Tailwind `transition-colors duration-150`):**
| Element | Property | Tailwind |
|---------|----------|----------|
| Icon color shift | color | `transition-colors duration-150` |
| Avatar hover | border-color, bg, color | `transition-colors duration-150` |
| ⌘K pill hover | border, bg | `transition-all duration-150` |
| Logo text hover | color | `transition-colors duration-200` |

**CSS pseudo-element (underline):**
| Element | Property | CSS |
|---------|----------|-----|
| Icon underline | `transform: scaleX(0→1)` | `transition: transform 200ms cubic-bezier(0.16,1,0.3,1)` with `transform-origin: center` |

**Motion animations (use existing `dropdownVariants` from `animation-constants.ts`):**
| Element | Variant | Notes |
|---------|---------|-------|
| Dropdown enter | `dropdownVariants.visible` | Spring stiffness:400, damping:28 — already defined |
| Dropdown exit | `dropdownVariants.exit` | 120ms, EASING.exit — already defined |
| Badge pop | `badgePopVariants` | Bouncy spring for badge appearance |

**Reduced motion:** All hover transitions degrade to instant. Dropdown enter/exit use opacity only (no translateY). Underline appears without grow animation. Respects `useReducedMotion()` hook.

## Component Architecture

### Files to modify
- `apps/web/src/components/TopBar.tsx` — full rewrite (simplify from 289 lines to ~150)

### Files to create
- `apps/web/src/components/UserMenu.tsx` — avatar + dropdown component (~100 lines)

### Files unchanged
- `apps/web/src/components/ThemeToggle.tsx` — keep existing, just restyle the button
- `apps/web/src/components/NotificationsPanel.tsx` — keep existing, restyle trigger button
- `apps/web/src/components/AppLayout.tsx` — no changes (still uses `pt-14` for header height)

### Removed code
- `normalizeClusterStatus()` function — no longer needed
- `statusDot()` function — no longer needed
- `ConnectionStatus` component — removed entirely
- `Stat` component — removed entirely
- Cluster selector JSX + related queries (`clusters.live`, `clusters.list`, `metrics.currentStats`)
- `useClusterContext` import in TopBar (used elsewhere, just removed from this file)

### UserMenu component design
```typescript
// apps/web/src/components/UserMenu.tsx
// - Renders avatar button with user initials
// - Click toggles dropdown (AnimatePresence + motion.div)
// - Click outside / Escape closes
// - Menu items: Profile, Settings, (separator), Log out
// - Log out: extract handleLogout to a shared useLogout() hook (avoids duplication)
// - Uses useAuthStore for user data
// - Uses useReducedMotion() for animation control
```

## Accessibility

- Avatar button: `aria-label="User menu"`, `aria-expanded`, `aria-haspopup="menu"`
- Dropdown: `role="menu"`, items use `role="menuitem"`
- Focus trap inside dropdown when open
- Escape key closes dropdown and returns focus to avatar
- Tab navigation through menu items
- All icon buttons retain existing `aria-label` attributes
- Touch targets: icon buttons 36x36px (meets WCAG AA 24px minimum; the 44px hit area is achieved via padding — use `min-h-[44px] min-w-[44px]` on mobile-visible buttons)

## Responsive Behavior

- **Mobile (< 640px):** Logo only on left. Right side shows: theme toggle, notifications bell, avatar. ⌘K pill hidden.
- **Desktop (≥ 640px):** Full layout as specified.
- Same breakpoint pattern as current TopBar (`hidden sm:flex` for ⌘K pill).

## Migration Notes

- The cluster selector functionality is NOT being removed from the app — it still exists in the sidebar and cluster pages. It's only being removed from the top bar.
- The `useClusterContext` store remains available for other components.
- The `ConnectionStatus` component is removed from TopBar only. If SSE status indication is needed later, it can be added to the sidebar or status bar.
- Logout logic moves from standalone button into UserMenu dropdown. Same `authClient.signOut()` flow.
