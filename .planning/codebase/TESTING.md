# Testing Patterns

**Analysis Date:** 2026-03-30

## Test Framework

**Unit Tests:**
- Runner: Vitest 4.x
- Config: `apps/api/vitest.config.ts` (API), no separate config for web (uses default)
- Assertion: Vitest built-in `expect`
- Mocking: Vitest `vi.mock()`, `vi.fn()`, `vi.hoisted()`

**E2E Tests:**
- Runner: Playwright 1.58.x
- Config: `playwright.config.ts`
- Browser: Chromium only (single project)
- Timeout: 45s per test
- Workers: 1 (sequential, not parallel)
- Retries: 0 locally, 2 in CI

**Visual Regression Tests:**
- Runner: Playwright
- Config: `playwright.visual.config.ts`
- Viewports: desktop (1280x720), mobile (375x812)
- Threshold: 0.1 (10% pixel difference tolerance)
- Snapshot path: `tests/visual/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}`
- Animations disabled for deterministic screenshots

**Run Commands:**
```bash
pnpm test                    # Vitest unit tests (all packages via turbo)
pnpm --filter api test       # API unit tests only
pnpm --filter api test -- src/__tests__/auth.test.ts  # Single test file
pnpm test:e2e                # Playwright E2E tests
pnpm test:visual             # Visual regression tests
pnpm test:visual:update      # Update visual snapshots
```

## Test File Organization

**Unit Tests -- Co-located in `__tests__/` directories:**
```
apps/api/src/__tests__/          # 9 test files
  auth-guard.test.ts
  auth-bootstrap.test.ts
  auth-origins.test.ts
  auth-request.test.ts
  ai-provider.test.ts
  ai-router-keys.test.ts
  ai-conversation-store.test.ts
  anomaly-service.test.ts
  module-integrity.test.ts

apps/web/src/lib/                # 2 test files (co-located with source)
  ai-keys-client.test.ts
  ai-keys-contract.test.ts

apps/web/src/stores/__tests__/   # 1 test file
  resource-store.test.ts
```

**E2E Tests -- Centralized in `tests/e2e/`:**
```
tests/e2e/
  helpers.ts                     # Login helpers, test users, waitForPageReady
  fixtures/auth.ts               # Playwright fixture for authenticated page
  auth.setup.ts                  # Global auth setup (saves storage state)
  auth.spec.ts                   # Authentication flow
  auth-advanced.spec.ts          # Advanced auth scenarios
  auth-betterauth.spec.ts        # Better-Auth specific tests
  auth-local-email-validation.spec.ts
  navigation.spec.ts             # All pages load without errors
  clusters.spec.ts               # Cluster CRUD operations
  rbac.spec.ts                   # Viewer vs admin permissions
  dashboard-ux-contract.spec.ts  # Dashboard UX invariants
  ... (38 spec files total)
```

**Visual Tests -- `tests/visual/`:**
```
tests/visual/
  stabilize.ts                   # Animation/transition disabling utility
  login.visual.spec.ts           # Login page screenshot
  main-pages.visual.spec.ts      # Dashboard, clusters, deployments, events
```

## Unit Test Patterns

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'
import { shouldRequireAuth } from '../lib/auth-guard.js'

describe('shouldRequireAuth', () => {
  it('does not require auth for Better Auth endpoints', () => {
    expect(shouldRequireAuth('GET', '/api/auth/get-session')).toBe(false)
  })

  it('requires auth for protected tRPC procedures', () => {
    expect(shouldRequireAuth('GET', '/trpc/clusters.list')).toBe(true)
  })
})
```

**Mocking Pattern (vi.mock with hoisted mocks):**
```typescript
const serviceMocks = {
  deleteUserKey: vi.fn(),
  testStoredConnection: vi.fn(),
}

vi.mock('../services/ai-key-settings-service.js', () => ({
  AiKeySettingsService: vi.fn().mockImplementation(function () {
    return serviceMocks
  }),
}))
```

**Drizzle ORM Mocking (complex, used in `ai-conversation-store.test.ts`):**
```typescript
const drizzleMocks = vi.hoisted(() => ({
  andMock: vi.fn((...parts: unknown[]) => ({ kind: 'and', parts })),
  eqMock: vi.fn((left: unknown, right: unknown) => ({ kind: 'eq', left, right })),
  descMock: vi.fn((value: unknown) => ({ kind: 'desc', value })),
}))

vi.mock('drizzle-orm', () => ({
  and: drizzleMocks.andMock,
  eq: drizzleMocks.eqMock,
  desc: drizzleMocks.descMock,
}))
```

**tRPC Router Testing (caller pattern):**
```typescript
import { aiRouter } from '../routers/ai.js'
import type { Context } from '../trpc.js'

function createCaller(
  user: Context['user'] = { id: 'user-1', email: 'u@v.test', role: 'user' } as any,
) {
  return aiRouter.createCaller({
    db: {} as any,
    user,
    session: { userId: 'user-1', expiresAt: new Date(Date.now() + 60_000) } as any,
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as any,
  })
}

// Usage in tests:
const caller = createCaller()
const result = await caller.keys.delete({ provider: 'openai' })
expect(result).toEqual({ deleted: true, provider: 'openai' })
```

**Environment Variable Testing:**
```typescript
const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

it('loads openai config by default', () => {
  process.env.AI_PROVIDER = 'openai'
  process.env.OPENAI_API_KEY = 'sk-test'
  const config = readAiProviderConfigFromEnv()
  expect(config.provider).toBe('openai')
})
```

**Zustand Store Testing:**
```typescript
beforeEach(() => {
  useResourceStore.setState({ resources: new Map(), connectionState: {} })
})

it('replaces entire array for a key', () => {
  useResourceStore.getState().setResources('cluster-1', 'pods', items)
  const stored = useResourceStore.getState().resources.get('cluster-1:pods')
  expect(stored).toEqual(items)
})
```

## E2E Test Patterns

**Test Structure:**
```typescript
import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should do something', async ({ page }) => {
    await page.goto('/path')
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 })
    // assertions...
  })
})
```

**Authentication Helper (`tests/e2e/helpers.ts`):**
```typescript
export async function login(page: Page, user = TEST_ADMIN): Promise<void> {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(user.email)
  await page.getByLabel(/password/i).fill(user.password)
  await page.getByRole('button', { name: /sign in|log in|login/i }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: /logout/i })).toBeVisible({ timeout: 20_000 })
}
```

**Test Users:**
- Admin: `admin@voyager.local` / `admin123` (env: `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`)
- Viewer: `viewer@voyager.local` / `viewer123` (env: `E2E_VIEWER_EMAIL`, `E2E_VIEWER_PASSWORD`)
- Viewer is created on-demand via `ensureViewerExists()` in `helpers.ts`

**Graceful Degradation Pattern (skip when data unavailable):**
```typescript
const clusterCard = page.locator('button[aria-label^="View cluster"]').first()
const emptyState = page.locator('[data-testid="empty-state"]').first()

await expect(clusterCard.or(emptyState)).toBeVisible({ timeout: 15_000 })

if (await emptyState.isVisible()) {
  test.skip(true, 'No clusters found -- seed data may be missing')
  return
}
```

**Console Error Checking:**
```typescript
const errors: string[] = []
page.on('pageerror', (err) => errors.push(err.message))
// ... navigate and interact ...
const actionableErrors = errors.filter((msg) => !msg.includes('known-false-positive'))
expect(actionableErrors).toHaveLength(0)
```

**BASE_URL Rule:**
- Never hardcode `localhost` in E2E tests
- Use `process.env.BASE_URL || 'http://localhost:9000'` (set in `playwright.config.ts`)
- Production URL: `http://voyager-platform.voyagerlabs.co`

## Visual Regression Patterns

**Stabilize Helper (`tests/visual/stabilize.ts`):**
```typescript
export async function stabilizeVisuals(page: Page): Promise<Locator[]> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }`,
  })
  return [
    page.locator('time'),
    page.locator('[aria-live]'),
    page.locator('[data-testid*="time"], [data-testid*="timestamp"]'),
    // ... mask dynamic elements
  ]
}
```

**Screenshot Comparison:**
```typescript
const mask = await stabilizeVisuals(page)
await expect(page).toHaveScreenshot('login.png', { mask })
```

**Theme Testing:**
```typescript
async function captureRoute(page: Page, route: string, name: string, theme: 'light' | 'dark') {
  await page.goto(route)
  await waitForPageReady(page)
  await applyTheme(page, theme)
  const mask = await stabilizeVisuals(page)
  await expect(page).toHaveScreenshot(`${name}-${theme}.png`, { mask })
}

test('dashboard (light + dark)', async ({ page }) => {
  await captureRoute(page, '/dashboard', 'dashboard', 'light')
  await captureRoute(page, '/dashboard', 'dashboard', 'dark')
})
```

## Vitest Configuration

**API Vitest Config (`apps/api/vitest.config.ts`):**
```typescript
export default defineConfig({
  test: {
    env: {
      JWT_SECRET: 'test-secret',
      ADMIN_PASSWORD: 'test-pass',
      DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake',
    },
  },
})
```
- Provides fake env vars so tests don't need a running database
- No coverage configuration enforced
- No `setupFiles` -- each test manages its own setup/teardown

## Coverage

**Requirements:** No enforced coverage threshold.

**Current State:** Coverage is not configured in Vitest or CI. No coverage reports generated.

## What Is Actually Tested

**API Unit Tests (9 files):**
| File | What It Tests |
|------|--------------|
| `auth-guard.test.ts` | Route-level auth bypass logic (public vs protected paths) |
| `auth-bootstrap.test.ts` | Admin user creation via Better-Auth signUpEmail |
| `auth-origins.test.ts` | Trusted origin resolution (dev vs production, HTTPS enforcement) |
| `auth-request.test.ts` | External request URL/origin resolution with forwarded headers |
| `ai-provider.test.ts` | AI provider config loading from environment variables |
| `ai-router-keys.test.ts` | AI key CRUD endpoints via tRPC caller |
| `ai-conversation-store.test.ts` | AI thread/message persistence with mocked Drizzle |
| `anomaly-service.test.ts` | Anomaly detection rule engine (threshold-based) |
| `module-integrity.test.ts` | Verifies critical modules remain imported in server.ts |

**Web Unit Tests (3 files):**
| File | What It Tests |
|------|--------------|
| `ai-keys-client.test.ts` | AI key client fallback paths (legacy route migration) |
| `ai-keys-contract.test.ts` | AI key response normalization (provider mapping, response parsing) |
| `resource-store.test.ts` | Zustand resource store operations (set, apply events, clear) |

**E2E Tests (38 spec files):**
- Authentication: login, session cookies, error states, Better-Auth, SSO
- Navigation: all pages load without console errors
- Clusters: add wizard, detail view, delete action
- RBAC: viewer restrictions vs admin capabilities
- Dashboard: UX contract invariants, widget customization
- Features: command palette, keyboard shortcuts, pod actions, toast, responsive, themes
- Table features: TanStack table, confirm dialogs

## Test Coverage Gaps

**Untested Backend Areas:**
- All 43 tRPC routers (only `ai` router keys endpoint tested; 0 coverage on clusters, pods, deployments, services, nodes, events, metrics, helm, crds, rbac, topology, etc.)
- Files: `apps/api/src/routers/*.ts` (42 untested files)
- K8s client pool (`apps/api/src/lib/cluster-client-pool.ts`)
- Watch manager (`apps/api/src/lib/watch-manager.ts`)
- Resource mappers (`apps/api/src/lib/resource-mappers.ts`)
- Cache layer (`apps/api/src/lib/cache.ts`)
- SSE routes (`apps/api/src/routes/resource-stream.ts`, `metrics-stream.ts`, `log-stream.ts`)
- WebSocket pod terminal (`apps/api/src/routes/pod-terminal.ts`)
- Background jobs (`apps/api/src/jobs/*.ts`)
- Risk: High -- core K8s data pipeline has zero unit test coverage
- Priority: High

**Untested Frontend Areas:**
- All React components (57 component files/directories, 0 unit tests)
- Files: `apps/web/src/components/*.tsx`
- Custom hooks (14 hooks, 0 unit tests)
- Files: `apps/web/src/hooks/*.ts`
- tRPC client setup (`apps/web/src/lib/trpc.ts`)
- All Zustand stores except `resource-store` (7 untested stores)
- Risk: Medium -- E2E tests provide some integration coverage
- Priority: Medium

**Untested Shared Packages:**
- `packages/config/` -- no tests for config exports
- `packages/types/` -- no tests for type contracts
- `packages/db/` -- no tests for schema or migrations
- Risk: Low -- mostly type definitions and constants
- Priority: Low

**No Integration Tests:**
- No tests that start the Fastify server and make real HTTP/tRPC requests
- No tests that verify database operations against a real PostgreSQL instance
- Risk: High -- behavior differences between mocked and real services go undetected
- Priority: High

---

*Testing analysis: 2026-03-30*
