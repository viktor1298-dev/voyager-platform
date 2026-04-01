# Keyboard Shortcut Fixes

**Date:** 2026-04-02
**Status:** Approved

## Problem

Two keyboard-related bugs:

1. **Browser shortcuts blocked:** Cmd+R (refresh), Cmd+C (copy), Cmd+V (paste), Cmd+X (cut) are intercepted by the app's custom shortcut system. Users on Mac cannot use standard browser shortcuts.

2. **"Skip to content" popup:** When typing in search bars (e.g., Clusters page), the accessibility skip-to-content link becomes visible in the top-left corner, stealing focus and interrupting typing.

## Root Causes

### Bug 1: Modifier matching flaw

`useKeyboardShortcuts.ts` registers bare key shortcuts (`['r']`, `['n']`, `['j']`, `['k']`) via `KeyboardShortcuts.tsx`. The modifier matching logic uses a loose check:

```typescript
const modMatch =
  (!modifiers.includes('meta') || e.metaKey) && ...
```

For shortcuts with no modifiers, every term evaluates to `true`, so `modMatch` is always true regardless of which modifiers are pressed. Cmd+R matches the bare `r` shortcut, `e.preventDefault()` fires, and the browser's refresh is blocked.

### Bug 2: Skip link focus state

`AppLayout.tsx` uses `focus:not-sr-only` on the skip-to-content `<a>` tag. This shows the link whenever it receives DOM focus — including from programmatic focus, focus trap cycling, or Tab navigation from within the page. Should only be visible on intentional keyboard navigation from the page top.

## Changes

### Fix 1: `apps/web/src/hooks/useKeyboardShortcuts.ts`

Add guard in the custom shortcut loop to skip when Cmd/Ctrl is pressed but not required:

```typescript
if (!modifiers.includes('meta') && e.metaKey) continue
if (!modifiers.includes('ctrl') && e.ctrlKey) continue
```

This lets browser shortcuts (Cmd+R/C/V/X, Ctrl+R/C/V/X) pass through while bare keys (R, N, J, K) still work. Shift and Alt remain flexible (needed for `?` = Shift+`/`).

### Fix 2: `apps/web/src/components/AppLayout.tsx`

Change `focus:` to `focus-visible:` on the skip link classes:

```
- sr-only focus:not-sr-only focus:fixed focus:top-2 ...
+ sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 ...
```

`:focus-visible` only matches when focus arrives via keyboard navigation (Tab), not from programmatic `.focus()` or focus trap cycling. This is the modern standard for skip links.

## Testing

- Cmd+R refreshes the page on Mac
- Cmd+C/V/X work for copy/paste/cut
- Bare R key still triggers `voyager:refresh` event (when not in an input)
- Bare N/J/K shortcuts still work
- Skip-to-content link appears only when Tab-navigating from the very top of the page
- Typing in Clusters search bar works without interruption
