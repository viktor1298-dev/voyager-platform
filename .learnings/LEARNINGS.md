
## [LEARN-20250720-001] best_practice

**Logged**: 2025-07-20T00:00:00Z
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary
Use `motion/react` animate() for count-up animations; column defs can be factory functions

### Details
- `motion` package (not `framer-motion`) — use `animate` + `useMotionValue` from `motion/react`
- When TanStack Table column cells need runtime context (e.g., isLive), convert static array to factory function
- Static `nodeColumns` → `makeNodeColumns(metricsAvailable)` pattern works cleanly

### Suggested Action
Apply factory function pattern for any column defs needing runtime context

### Metadata
- Source: conversation
- Related Files: apps/web/src/app/page.tsx, apps/web/src/app/clusters/[id]/page.tsx
- Tags: motion, animations, tanstack-table
