---
phase: 09-lens-inspired-power-features
plan: 05
subsystem: api, ui
tags: [websocket, xterm.js, pod-exec, terminal, kubernetes, fastify]

requires:
  - phase: 08-resource-explorer-ux-overhaul
    provides: Cluster detail layout, pod listing with expandable detail panels

provides:
  - WebSocket backend route bridging browser to K8s pod exec API
  - VS Code-style bottom drawer with resizable drag handle
  - xterm.js terminal rendering with theme-matched colors
  - Multi-tab terminal session management via React context
  - TerminalProvider + useTerminal hook for opening terminals from any component

affects: [09-lens-inspired-power-features, pods-page, cluster-detail]

tech-stack:
  added: ["@fastify/websocket", "@xterm/xterm", "@xterm/addon-fit"]
  patterns: ["WebSocket route with @fastify/websocket", "Dynamic import for SSR-unsafe libraries", "PassThrough stream bridging for K8s exec"]

key-files:
  created:
    - apps/api/src/routes/pod-terminal.ts
    - apps/web/src/components/terminal/TerminalDrawer.tsx
    - apps/web/src/components/terminal/TerminalSession.tsx
    - apps/web/src/components/terminal/TerminalTab.tsx
    - apps/web/src/components/terminal/terminal-context.tsx
  modified:
    - apps/api/src/server.ts
    - apps/web/src/components/providers.tsx
    - apps/web/src/app/globals.css

key-decisions:
  - "K8s Exec API (not child_process) for pod terminal — uses @kubernetes/client-node Exec class with PassThrough stream bridging"
  - "Shell fallback chain: /bin/bash -> /bin/sh -> /bin/ash for maximum container compatibility"
  - "TerminalDrawer dynamically imported via next/dynamic to avoid SSR issues with xterm.js"
  - "Terminal CSS vars kept as dark-on-dark even in light mode (terminals are always dark background)"
  - "Outer div with role=tab instead of nested buttons in TerminalTab to avoid hydration errors"

patterns-established:
  - "WebSocket route pattern: @fastify/websocket registered before routes, handler authenticates via auth.api.getSession"
  - "K8s exec bridge: PassThrough streams for stdin/stdout/stderr, shell fallback chain, cleanup on disconnect"
  - "Terminal context: useTerminal hook for opening/closing/activating terminal sessions from any component"

requirements-completed: [LENS-01]

duration: 8min
completed: 2026-03-28
---

# Phase 09 Plan 05: Pod Exec Terminal Summary

**WebSocket pod-terminal backend with K8s exec bridging and VS Code-style xterm.js drawer with multi-tab sessions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-28T21:22:06Z
- **Completed:** 2026-03-28T21:30:20Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- WebSocket endpoint at `/api/pod-terminal` authenticates connections and bridges to K8s pod exec via PassThrough streams
- VS Code-style TerminalDrawer with drag-to-resize, spring animation (stiffness 350, damping 24), and Ctrl+backtick toggle
- xterm.js terminal with Geist Mono font, CSS var theme mapping, ResizeObserver auto-fit, and bidirectional WebSocket data flow
- React context (TerminalProvider + useTerminal) for opening/closing/managing multiple terminal sessions
- Terminal CSS tokens for dark/light modes + xterm scrollbar styling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WebSocket pod-terminal backend route** - `ed71572` (feat)
2. **Task 2: Create TerminalDrawer, TerminalTab, TerminalSession frontend components** - `d747aed` (feat)

## Files Created/Modified
- `apps/api/src/routes/pod-terminal.ts` - WebSocket route: auth, Zod validation, ClusterClientPool, shell fallback, stream bridging
- `apps/api/src/server.ts` - Register @fastify/websocket plugin + pod-terminal route
- `apps/web/src/components/terminal/terminal-context.tsx` - React context: sessions array, active session, open/close/activate
- `apps/web/src/components/terminal/TerminalDrawer.tsx` - VS Code-style bottom panel: drag resize, tab bar, spring animation
- `apps/web/src/components/terminal/TerminalSession.tsx` - xterm.js instance: WebSocket lifecycle, theme sync, SSR safety
- `apps/web/src/components/terminal/TerminalTab.tsx` - Tab button: truncated label, close button, active state
- `apps/web/src/components/providers.tsx` - Added TerminalProvider + dynamically imported TerminalDrawer
- `apps/web/src/app/globals.css` - Terminal CSS vars (dark/light) + xterm scrollbar styling
- `apps/api/package.json` - Added @fastify/websocket dependency
- `apps/web/package.json` - Added @xterm/xterm and @xterm/addon-fit dependencies

## Decisions Made
- Used K8s `Exec` class from `@kubernetes/client-node` (not child_process) for pod terminal -- safe API-level exec
- Shell fallback chain `/bin/bash -> /bin/sh -> /bin/ash` for maximum container compatibility
- TerminalDrawer uses `next/dynamic` with `{ ssr: false }` to avoid xterm.js SSR issues (same pattern as CommandPalette)
- Terminal always renders with dark background even in light mode (standard terminal UX)
- TerminalTab uses `div[role=tab]` outer element instead of nested `<button>` to avoid React hydration errors (Gotcha fix from Phase 08)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing terminal CSS tokens and drawerSlideUpVariants**
- **Found during:** Task 2 (pre-implementation check)
- **Issue:** Plan references `--color-terminal-*` CSS vars and `drawerSlideUpVariants` from Plan 01, but Plan 01 hasn't been executed yet
- **Fix:** Added terminal CSS tokens to globals.css (both dark/light themes) and created local `drawerVariants` in TerminalDrawer.tsx
- **Files modified:** apps/web/src/app/globals.css, apps/web/src/components/terminal/TerminalDrawer.tsx
- **Verification:** Build and typecheck pass
- **Committed in:** d747aed (Task 2 commit)

**2. [Rule 3 - Blocking] Missing @fastify/websocket, @xterm/xterm, @xterm/addon-fit packages**
- **Found during:** Task 1 (pre-implementation check)
- **Issue:** Required packages not yet installed in the workspace
- **Fix:** Installed via `pnpm --filter api add @fastify/websocket` and `pnpm --filter web add @xterm/xterm @xterm/addon-fit`
- **Files modified:** apps/api/package.json, apps/web/package.json, pnpm-lock.yaml
- **Verification:** `pnpm build` succeeds
- **Committed in:** ed71572, d747aed (part of task commits)

**3. [Rule 1 - Bug] Nested button hydration error prevention**
- **Found during:** Task 2 (TerminalTab implementation)
- **Issue:** TerminalTab initially had `<button>` inside `<button>` which causes React hydration errors (known issue from Phase 08)
- **Fix:** Changed outer element to `div[role=tab]` with keyboard handlers
- **Files modified:** apps/web/src/components/terminal/TerminalTab.tsx
- **Verification:** No hydration warnings in build
- **Committed in:** d747aed (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug prevention, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None - pre-existing workspace type errors (unrelated to this plan) resolved by building workspace packages first.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all components are fully wired with working WebSocket connections and xterm.js rendering.

## Next Phase Readiness
- Terminal system is ready for use -- any component can call `useTerminal().openTerminal(...)` to open a pod terminal
- Pods page can integrate a "Terminal" button in pod detail panels to trigger `openTerminal`
- Port forwarding and other exec-based features can reuse the WebSocket pattern

## Self-Check: PASSED

All 6 created files verified present. Both task commits (ed71572, d747aed) verified in git log.

---
*Phase: 09-lens-inspired-power-features*
*Completed: 2026-03-28*
