# Presence Cluster Redesign — TopBar Integration

**Date:** 2026-04-02
**Status:** Approved
**Scope:** Frontend only (no backend changes)

---

## Problem

The current `PresenceBar` is a full-width horizontal strip (`h-10`, 40px) between the TopBar and page content. It wastes vertical space for minimal information (green dot + count badge + user avatars). The bright green badge and pulsing dot clash with the Neon Depth design system.

## Solution

Replace the standalone `PresenceBar` with a `PresenceCluster` — a compact inline component rendered inside `TopBar.tsx`. Overlapping ghost-style avatars with individual tooltips. No count badge.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Placement | TopBar (right controls area) | Eliminates 40px vertical waste. Linear/Slack/Vercel pattern. |
| Avatar style | Ghost — muted borders, no glow | TopBar is functional space; save neon glow for sidebar active state. |
| Multiple users | Overlapping stack (-8px margin) | Compact, modern standard (GitHub contributors). |
| Hover behavior | Individual tooltips (name + page) | Simple, no new popover component needed. |
| Count badge | None — avatars are the count | Maximum visual cleanliness. +N overflow handles scale. |
| Empty state | Hidden when solo | Filter out current user (via `useAuthStore` ID); show cluster when `otherUsers.length >= 1`. Current user already visible in UserMenu. |

## Component: `PresenceCluster`

### Location in TopBar

```
TopBar right controls:
[PresenceCluster] [separator] [⌘K Search] [ThemeToggle] [Notifications] [UserMenu]
```

Separator is a 1px vertical line using `var(--color-border)`, matching existing TopBar visual language.

### Avatar Circles (26px)

```
Background:  var(--color-bg-card)
Border:      1.5px solid var(--color-border)
Initials:    var(--color-text-muted), 10px, font-weight 600
Overlap:     -8px negative margin-left (left-to-right stack)
Z-index:     Descending (first user on top)
```

### Status Dots (7px)

```
Online:      var(--color-status-active) — static (DESIGN.md rule 7: healthy = static)
Away:        var(--color-text-dim)
Position:    absolute bottom-0 right-0
Cutout:      1.5px border matching var(--color-bg-primary)
```

### Overflow

When >5 users online, show avatars 1-5 + a `+N` circle:
- Same 26px size
- Background: `var(--color-bg-card)`
- Text: `var(--color-text-dim)`, 9px, font-weight 700, font-mono
- Border: same as avatars
- Tooltip on hover lists remaining user names

### Hover Interaction

```
Avatar hover:
  border → var(--color-border-hover)
  transition-colors duration-150 (DESIGN.md rule 2)

Tooltip (custom CSS only — no native `title` attribute to avoid double-tooltip):
  position: absolute, bottom-full, centered
  background: var(--color-bg-card)
  border: var(--color-border)
  text: var(--color-text-primary), 12px, font-medium
  shadow: md
  z-index: 50
  entrance: opacity 0→1, DURATION.fast (150ms), EASING.default
  content: "Name · Current Page" (page omitted if "/")

+N overflow tooltip:
  Same styling as avatar tooltip
  Content: comma-separated names, max 10 shown, then "and N more"
```

Status dot color transitions use `transition-colors duration-150` for online↔away changes.

### Animations

All values from `animation-constants.ts`:

```
Enter:  scaleVariants — opacity 0→1, scale 0.95→1
        duration: DURATION.normal (200ms)
        easing: EASING.default

Exit:   opacity 1→0, scale 1→0.95
        duration: DURATION.fast (150ms)
        easing: EASING.exit
        (exit faster than enter — DESIGN.md rule 8)

AnimatePresence: initial={false} (skip hydration)
Reduced motion: useReducedMotion() → plain <div> wrapper
```

### Responsive

```
Desktop (≥768px):  Show cluster — hidden sm:flex
Mobile (<768px):   Hidden — TopBar too cramped for presence
```

### Constants (no hardcoded values)

```typescript
// Component-level constants
const PRESENCE_AVATAR_SIZE = 26     // px
const PRESENCE_AVATAR_SIZE_CLASS = 'h-[26px] w-[26px]'
const PRESENCE_OVERLAP = '-ml-2'    // -8px overlap
const PRESENCE_MAX_VISIBLE = 5      // before +N overflow
const PRESENCE_DOT_SIZE = 'h-[7px] w-[7px]'

// From animation-constants.ts
import { DURATION, EASING, scaleVariants } from '@/lib/animation-constants'

// All colors via CSS custom properties (globals.css)
// var(--color-bg-card), var(--color-border), var(--color-border-hover)
// var(--color-text-muted), var(--color-text-dim), var(--color-text-primary)
// var(--color-status-active), var(--color-bg-primary)
```

## Files Changed

| File | Action | Details |
|------|--------|---------|
| `apps/web/src/components/PresenceCluster.tsx` | **Create** | New compact cluster component |
| `apps/web/src/components/TopBar.tsx` | **Edit** | Import PresenceCluster, render in right controls before separator |
| `apps/web/src/components/AppLayout.tsx` | **Edit** | Remove PresenceBar import and render |
| `apps/web/src/components/PresenceBar.tsx` | **Delete** | Replaced by PresenceCluster |

## Not Changed

- `apps/web/src/hooks/usePresence.ts` — hook stays as-is
- `apps/web/src/stores/presence.ts` — Zustand store stays as-is
- `apps/api/src/routers/presence.ts` — backend stays as-is
- `apps/api/src/lib/presence.ts` — presence logic stays as-is

## Accessibility

- `aria-label` on each avatar: `"{name} is online"` / `"{name} is away"`
- `useReducedMotion()` disables Motion animations
- Status conveyed via color + position (dot), not color alone (DESIGN.md)
- Custom CSS tooltips with `group-hover:opacity-100` pattern (no native `title` to avoid double-tooltip)

## Light Theme

All values use CSS custom properties that already have light-mode overrides in `globals.css` (`:root` dark, `html.light`). No additional light-theme work needed.
