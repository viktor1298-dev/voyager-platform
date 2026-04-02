# Presence Cluster Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone 40px `PresenceBar` with a compact `PresenceCluster` embedded in the TopBar — ghost-style overlapping avatars, no count badge, custom CSS tooltips.

**Architecture:** Create `PresenceCluster.tsx` as a new component that reuses the existing `usePresence` hook and `useAuthStore`. Integrate it into `TopBar.tsx`'s right-side controls. Remove `PresenceBar.tsx` and its render in `AppLayout.tsx`. Frontend-only — no backend changes.

**Tech Stack:** React 19, Motion 12 (`motion/react`), Tailwind 4, Zustand 5

**Spec:** `docs/superpowers/specs/2026-04-02-presence-cluster-redesign.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/components/PresenceCluster.tsx` | **Create** | Compact overlapping avatar cluster with tooltips, animations, overflow |
| `apps/web/src/components/TopBar.tsx` | **Edit** | Import + render `PresenceCluster` in right controls, add separator |
| `apps/web/src/components/AppLayout.tsx` | **Edit** | Remove `PresenceBar` import and render |
| `apps/web/src/components/PresenceBar.tsx` | **Delete** | Replaced by PresenceCluster |

---

### Task 1: Create `PresenceCluster.tsx`

**Files:**
- Create: `apps/web/src/components/PresenceCluster.tsx`

**Context for implementer:**
- `usePresence()` hook (from `@/hooks/usePresence`) returns `{ onlineUsers, myStatus }`. Each user in `onlineUsers` has: `id`, `name`, `currentPage`, `avatar?`, `lastSeen`, `status` (`'online' | 'away'`). The current user IS included in this list.
- `useAuthStore` (from `@/stores/auth`) has `user: { id, email, name, role } | null`.
- `useReducedMotion()` (from `@/hooks/useReducedMotion`) returns `boolean`.
- Animation constants in `@/lib/animation-constants.ts`: use `scaleVariants` for enter/exit, `DURATION`, `EASING`.
- All colors via CSS custom properties — see spec for the full list.
- `initialsFromName()` logic exists in current `PresenceBar.tsx` — copy it into new file.

- [ ] **Step 1: Create the component file with constants and helper**

```typescript
// apps/web/src/components/PresenceCluster.tsx
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { usePresence } from '@/hooks/usePresence'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useAuthStore } from '@/stores/auth'
import { DURATION, EASING, scaleVariants } from '@/lib/animation-constants'

// Component-level constants — no hardcoded values
const MAX_VISIBLE = 5
const MAX_OVERFLOW_NAMES = 10
const AVATAR_SIZE = 'h-[26px] w-[26px]'
const AVATAR_OVERLAP = '-8px'
const DOT_SIZE = 'h-[7px] w-[7px]'

function initialsFromName(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function PresenceCluster() {
  const reduced = useReducedMotion()
  const { onlineUsers } = usePresence()
  const currentUserId = useAuthStore((s) => s.user?.id)

  // Filter out current user — they're already visible in UserMenu
  const otherUsers = useMemo(
    () => onlineUsers.filter((u) => u.id !== currentUserId),
    [onlineUsers, currentUserId],
  )

  // Hidden when no other users are online
  if (otherUsers.length === 0) return null

  const visible = otherUsers.slice(0, MAX_VISIBLE)
  const overflow = otherUsers.slice(MAX_VISIBLE)

  const overflowTooltip =
    overflow.length > 0
      ? overflow.length <= MAX_OVERFLOW_NAMES
        ? overflow.map((u) => u.name).join(', ')
        : `${overflow.slice(0, MAX_OVERFLOW_NAMES).map((u) => u.name).join(', ')} and ${overflow.length - MAX_OVERFLOW_NAMES} more`
      : ''

  return (
    <div className="hidden sm:flex items-center" role="group" aria-label="Online users">
      <AnimatePresence initial={false}>
        {visible.map((user, i) => {
          const isOnline = user.status === 'online'
          const tooltipText = `${user.name}${user.currentPage && user.currentPage !== '/' ? ` · ${user.currentPage}` : ''}`

          const avatar = (
            <div
              className={`group relative ${AVATAR_SIZE} rounded-full bg-[var(--color-bg-card)] border-[1.5px] border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-muted)] flex items-center justify-center shrink-0 cursor-default hover:border-[var(--color-border-hover)] transition-colors duration-150`}
              style={{ zIndex: MAX_VISIBLE - i, marginLeft: i > 0 ? AVATAR_OVERLAP : undefined }}
              aria-label={`${user.name} is ${user.status}`}
            >
              {initialsFromName(user.name)}
              {/* Status dot */}
              <span
                className={`absolute bottom-0 right-0 ${DOT_SIZE} rounded-full border-[1.5px] border-[var(--color-bg-primary)] transition-colors duration-150`}
                style={{
                  backgroundColor: isOnline
                    ? 'var(--color-status-active)'
                    : 'var(--color-text-dim)',
                }}
                aria-hidden="true"
              />
              {/* Tooltip */}
              <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs font-medium text-[var(--color-text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                {tooltipText}
              </span>
            </div>
          )

          if (reduced) {
            return <div key={user.id}>{avatar}</div>
          }

          return (
            <motion.div
              key={user.id}
              variants={scaleVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {avatar}
            </motion.div>
          )
        })}

        {/* +N overflow circle */}
        {overflow.length > 0 &&
          (reduced ? (
            <div key="overflow">
              <div
                className={`group relative ${AVATAR_SIZE} rounded-full bg-[var(--color-bg-card)] border-[1.5px] border-[var(--color-border)] text-[9px] font-bold font-mono text-[var(--color-text-dim)] flex items-center justify-center shrink-0 cursor-default hover:border-[var(--color-border-hover)] transition-colors duration-150`}
                style={{ zIndex: 0, marginLeft: AVATAR_OVERLAP }}
                aria-label={`${overflow.length} more users online`}
              >
                +{overflow.length}
                <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs font-medium text-[var(--color-text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  {overflowTooltip}
                </span>
              </div>
            </div>
          ) : (
          <motion.div
            key="overflow"
            variants={scaleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div
              className={`group relative ${AVATAR_SIZE} rounded-full bg-[var(--color-bg-card)] border-[1.5px] border-[var(--color-border)] text-[9px] font-bold font-mono text-[var(--color-text-dim)] flex items-center justify-center shrink-0 cursor-default hover:border-[var(--color-border-hover)] transition-colors duration-150`}
              style={{ zIndex: 0, marginLeft: AVATAR_OVERLAP }}
              aria-label={`${overflow.length} more users online`}
            >
              +{overflow.length}
              {/* Overflow tooltip */}
              <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs font-medium text-[var(--color-text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                {overflowTooltip}
              </span>
            </div>
          </motion.div>
          ))}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors (component is created but not yet rendered anywhere)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/PresenceCluster.tsx
git commit -m "feat: add PresenceCluster component for TopBar integration"
```

---

### Task 2: Integrate into TopBar and remove PresenceBar

**Files:**
- Modify: `apps/web/src/components/TopBar.tsx`
- Modify: `apps/web/src/components/AppLayout.tsx`
- Delete: `apps/web/src/components/PresenceBar.tsx`

**Context for implementer:**
- `TopBar.tsx` has a right-side `<div className="flex items-center gap-1.5">` containing: search button, ThemeToggle, NotificationsPanel, UserMenu.
- Insert `PresenceCluster` at the START of that div (before search), followed by a 1px separator.
- `AppLayout.tsx` renders `<PresenceBar />` at line 108 inside `<motion.main>`. Remove it and its import.
- `PresenceBar.tsx` is no longer used — delete it entirely.

- [ ] **Step 1: Edit TopBar.tsx — add PresenceCluster + separator**

```typescript
// apps/web/src/components/TopBar.tsx
// Add import at top:
import { PresenceCluster } from './PresenceCluster'

// In the right-side controls div (line 49), add PresenceCluster + separator BEFORE the search button:
// <div className="flex items-center gap-1.5">
//   <PresenceCluster />                          ← ADD
//   <div className="hidden sm:block w-px h-5 bg-[var(--color-border)]" />  ← ADD (separator)
//   <button ... search button ... />
//   <ThemeToggle />
//   ...
```

The full updated right-side controls section should be:

```tsx
{/* Right — Controls */}
<div className="flex items-center gap-1.5">
  <PresenceCluster />
  <div className="hidden sm:block w-px h-5 bg-[var(--color-border)]" />
  <button
    type="button"
    onClick={() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    }
    className="hidden sm:flex items-center gap-2 px-2.5 h-8 rounded-lg border border-transparent text-[var(--color-text-muted)] transition-all duration-150 hover:border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-secondary)]"
    title="Command Palette (⌘K)"
    aria-label="Open command palette"
  >
    <Search className="h-3.5 w-3.5" />
    <kbd className="text-[11px] font-medium font-mono text-[var(--color-text-dim)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 px-1.5 py-0.5 rounded transition-colors duration-150">
      ⌘K
    </kbd>
  </button>
  <ThemeToggle />
  <NotificationsPanel />
  <UserMenu />
</div>
```

- [ ] **Step 2: Edit AppLayout.tsx — remove PresenceBar**

Remove the import line:
```diff
- import { PresenceBar } from './PresenceBar'
```

Remove the render at line 108:
```diff
  <motion.main ...>
-   <PresenceBar />
    <div key={pathname} className="p-3 sm:p-5 ...">
```

- [ ] **Step 3: Delete PresenceBar.tsx**

```bash
rm apps/web/src/components/PresenceBar.tsx
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 5: Verify build passes**

Run: `pnpm build`
Expected: All pages compile successfully

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/TopBar.tsx apps/web/src/components/AppLayout.tsx
git rm apps/web/src/components/PresenceBar.tsx
git commit -m "feat: move presence from standalone bar to TopBar cluster

Removes 40px PresenceBar strip, integrates ghost-style overlapping
avatars directly into TopBar right controls. Filters out current user
(already in UserMenu). No backend changes."
```

---

### Task 3: Verify and QA

**Files:** None (verification only)

- [ ] **Step 1: Start dev servers**

Run: `pnpm dev`
Expected: API + Web start without errors

- [ ] **Step 2: Verify presence cluster renders in TopBar**

Open `http://localhost:3000` in browser. Log in. Check:
- No 40px bar below the TopBar (the old PresenceBar is gone)
- When another user is online, their avatar appears in the TopBar right controls, left of the ⌘K search
- When solo, no presence avatars shown (current user filtered out)

- [ ] **Step 3: Check console for errors**

Open browser DevTools → Console. Navigate to Dashboard, Clusters, and back.
Expected: 0 `[ERROR]` entries

- [ ] **Step 4: Verify both themes**

Toggle light mode via ThemeToggle. Check:
- Avatar borders visible in both dark and light
- Status dots correct colors in both themes
- Tooltip readable in both themes

- [ ] **Step 5: Verify hover tooltips work**

Hover over a presence avatar (when other users are online).
Expected: Tooltip appears with "Name · Page" format, no double-tooltip (no native `title` tooltip appearing after delay).
