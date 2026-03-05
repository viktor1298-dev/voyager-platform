
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

## [LEARN-20260306-001] Zod v4 z.record requires two arguments

**Logged**: 2026-03-06T01:00:00+02:00
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Zod v4 (^4.3.6) requires `z.record(keySchema, valueSchema)` — no longer accepts single argument.

### Details
`z.record(z.unknown())` and `z.record(z.array(schema))` both fail with TS2554 in Zod v4.
Must use `z.record(z.string(), z.unknown())` and `z.record(z.string(), z.array(schema))`.

### Suggested Action
When writing new tRPC procedures with Zod v4, always use two-arg z.record. Add to code review checklist.

### Metadata
- Source: error
- Related Files: apps/api/src/routers/ai.ts, apps/api/src/routers/dashboard-layout.ts
- Tags: zod, zod-v4, typescript, backend
