---
name: new-trpc-route
description: Scaffold a new tRPC route with router, types, and registry entry following voyager-platform conventions. Generates boilerplate for query/mutation procedures.
---

# Scaffold New tRPC Route

Create a new tRPC route following voyager-platform conventions. This skill generates the router file, types, and updates the router registry.

## Information Needed

Before scaffolding, determine:
1. **Route name** (e.g., `backups`, `notifications`) — kebab-case for files, camelCase for router
2. **Procedure type** — query, mutation, or subscription
3. **Auth level** — `publicProcedure`, `protectedProcedure`, `adminProcedure`, or `authorizedProcedure`
4. **Input schema** — Zod schema for input validation (remember: Zod v4, `z.record()` needs TWO args)

## Files to Create/Modify

### 1. Router File: `apps/api/src/routers/<name>.ts`

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { protectedProcedure, router } from '../trpc.js'

// Input schemas
const <name>Input = z.object({
  // TODO: define input schema
})

export const <name>Router = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      // TODO: implement
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // TODO: implement
    }),
})
```

### 2. Register in Router Index: `apps/api/src/routers/index.ts`

Add import and include in the `appRouter`:
```typescript
import { <name>Router } from './<name>.js'

// In appRouter definition:
<name>: <name>Router,
```

### 3. Types (if needed): `packages/types/src/<name>.ts`

For shared types used by both API and web:
```typescript
export interface <Name> {
  id: string
  // TODO: define fields
  createdAt: Date
  updatedAt: Date
}
```

## Conventions to Follow

- **Error codes:** Use `TRPCError` with codes: `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_SERVER_ERROR`
- **Sentry:** Client errors (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`) should NOT be sent to Sentry. Server errors should.
- **Imports:** Use `.js` extensions (ESM): `import { router } from '../trpc.js'`
- **Zod v4:** `z.record()` requires TWO arguments: `z.record(z.string(), z.unknown())`
- **Auth middleware:** Choose the right procedure:
  - `publicProcedure` — no auth required (health checks, public data)
  - `protectedProcedure` — requires authenticated session
  - `adminProcedure` — requires admin role
  - `authorizedProcedure` — requires specific permission check via authorization service
- **Redis caching:** For read-heavy endpoints, use Redis cache with fallback:
  ```typescript
  try { return await redis.get(key) } catch { /* fall through to DB */ }
  ```
- **Audit logging:** Wrap in try/catch, never let it break the main operation
- **tRPC client:** Frontend uses `httpLink` (NOT `httpBatchLink`) — no batching concerns

## After Scaffolding

1. Run `pnpm typecheck` to verify types compile
2. Run `pnpm build` to verify build
3. Add tests in `apps/api/src/__tests__/<name>.test.ts` if needed
