# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Unit Testing:**
- Runner: Vitest (running in Vitest config in `apps/api/vitest.config.ts`)
- Assertion library: Vitest built-ins (`expect`, `describe`, `it`)
- Config file: `apps/api/vitest.config.ts`

**E2E Testing:**
- Framework: Playwright 1.58.2
- Config file: `playwright.config.ts`
- Test directory: `tests/e2e/`

**Run Commands:**
```bash
pnpm test                   # Run all unit tests (turbo runs in all packages)
pnpm test:e2e               # Run Playwright E2E tests
pnpm test:visual            # Run Playwright visual regression tests
pnpm test:visual:update     # Update visual regression snapshots
pnpm --filter api test      # Run tests in API package only
pnpm --filter api test -- src/__tests__/auth.test.ts  # Single test file
```

## Test File Organization

**Location:**
- Unit tests co-located with source: `apps/api/src/__tests__/` (sibling directory to source)
- E2E tests in separate `tests/e2e/` directory at monorepo root
- Visual regression tests in `tests/visual/` (same directory, different config)

**Naming:**
- Unit test files: `*.test.ts` (e.g., `auth.test.ts`, `cache.test.ts`)
- E2E test files: `*.spec.ts` (e.g., `auth.spec.ts`, `clusters.spec.ts`)
- Visual regression tests: `*.spec.ts` with visual-specific matchers

**Structure:**
```
apps/api/src/
├── __tests__/
│   ├── auth.test.ts
│   ├── cache.test.ts
│   ├── ai-service.test.ts
│   └── ... (one test file per source module)
├── lib/
│   ├── auth.ts
│   ├── cache.ts
│   └── ...
└── services/
    └── ai-service.ts

tests/
├── e2e/
│   ├── auth.spec.ts
│   ├── clusters.spec.ts
│   ├── helpers.ts           # Shared test utilities (login, constants)
│   └── ...
└── visual/
    └── (visual regression snapshots)
```

## Test Structure

**Unit Test Pattern (Vitest):**
```typescript
import { describe, expect, it, beforeEach, vi } from 'vitest'

describe('Component/Function Name', () => {
  beforeEach(() => {
    vi.clearAllMocks()  // Reset mocks between tests
  })

  it('should do something specific', async () => {
    // Arrange
    const input = ...
    const expected = ...

    // Act
    const result = await functionUnderTest(input)

    // Assert
    expect(result).toEqual(expected)
  })

  it('should handle error case', async () => {
    // ...
    await expect(promise).rejects.toThrow('error message')
  })
})
```

**E2E Test Pattern (Playwright):**
```typescript
import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)  // Login before each test
  })

  test('should perform action and verify result', async ({ page }) => {
    await page.goto('/path')
    await expect(page.getByRole('heading')).toBeVisible()
    await page.getByRole('button', { name: /click me/i }).click()
    await expect(page).toHaveURL(/\/expected-path/)
  })
})
```

**Vitest Config (apps/api/vitest.config.ts):**
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

**Playwright Config (playwright.config.ts):**
```typescript
{
  testDir: './tests/e2e',
  fullyParallel: false,           // Sequential execution
  forbidOnly: !!process.env.CI,   // Fail if .only() used in CI
  retries: process.env.CI ? 2 : 0,
  workers: 1,                     // Single worker for stability
  reporter: 'html',
  timeout: 45_000,                // 45 second timeout per test
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:9000',
    trace: 'on-first-retry',       // Capture trace on first retry
    screenshot: 'only-on-failure', // Screenshot on failure
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
}
```

## Mocking

**Framework:** Vitest `vi` module (from `vitest` package)

**Mock Patterns:**

**Module mocking (vi.mock):**
```typescript
vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

vi.mock('@voyager/db', () => ({
  db: {},
  Database: {},
}))
```

**Function mocking (vi.fn):**
```typescript
const mockGet = vi.fn()
const mockSetEx = vi.fn()

// Setup return value
mockGet.mockResolvedValue(JSON.stringify({ data: 'cached' }))
mockSetEx.mockResolvedValue('OK')

// Verify calls
expect(mockSetEx).toHaveBeenCalledWith('test-key', 60, JSON.stringify({ data: 'fresh' }))
expect(mockSetEx).toHaveBeenCalledOnce()
```

**Mock database factory:**
```typescript
function createMockDb(params?: {
  clusterExists?: boolean
  recentEvents?: Array<...>
  failRecentEventsAttempts?: number
}) {
  // Build Drizzle-compatible mock with chained methods
  return {
    select: (projection?) => ({
      from: () => ({
        where: () => ({
          limit: async () => [...],
          orderBy: async () => [...],
        }),
      }),
    }),
  }
}
```

**What to Mock:**
- External dependencies: `redis`, `@voyager/db`, `better-auth`
- Infrastructure: Kubernetes client, HTTP calls
- Third-party APIs: AI providers (OpenAI, Anthropic)
- Environment-specific services that require setup

**What NOT to Mock:**
- Core business logic functions
- Utilities and helpers (unless they access external resources)
- Zod schemas and validators
- Error handling utilities

## Fixtures and Factories

**Test Data:**

**Factory pattern for test objects:**
```typescript
function createTestCaller(user: Context['user'] = null, session: Context['session'] = null) {
  return appRouter.createCaller({
    db: {} as any,
    user,
    session,
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as any,
  })
}
```

**Constants for test data:**
```typescript
// From tests/e2e/helpers.ts
const TEST_ADMIN = { email: 'admin@voyager.local', password: 'password' }
const AUTH_COOKIE_NAME = 'better-auth.session_token'

async function login(page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email)
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password)
  await page.getByRole('button', { name: /sign in|log in|login/i }).click()
}
```

**Location:**
- Test helpers: `tests/e2e/helpers.ts`
- Test constants: defined at top of test files
- Mock factories: inline in test file or in `__tests__/` directory

## Coverage

**Requirements:** No explicit coverage enforcement configured in `vitest.config.ts`

**View Coverage:**
```bash
# Biome handles linting but not coverage
# Coverage not explicitly configured for Vitest
# Run tests and check report manually if needed
pnpm test
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, services, utilities
- Approach: Isolate with mocks, test behavior with multiple input scenarios
- Location: `apps/api/src/__tests__/` (co-located with source)
- Examples: `cache.test.ts` (mock Redis), `ai-service.test.ts` (mock DB)

**Integration Tests:**
- Scope: Service integration without external infrastructure (DB mocked)
- Approach: Test service methods with realistic mock DB state
- Pattern: Create mock database factory, call service methods
- Example in `ai-service.test.ts`:
```typescript
const service = new AIService({ db: createMockDb() as never })
const result = await service.analyzeClusterHealth(clusterId, snapshot)
expect(result.recommendations.some(rec => rec.title.includes('CPU'))).toBe(true)
```

**E2E Tests:**
- Scope: Full user workflows (login, navigate, interact, verify UI)
- Approach: Use real frontend + real backend + real DB (seeded)
- Framework: Playwright
- Location: `tests/e2e/`
- Base URL: `process.env.BASE_URL || 'http://localhost:9000'` (overridable)
- Critical: Uses `BASE_URL` env var, NEVER hardcoded `localhost`

**Playwright-Specific Patterns:**

**Skipping tests gracefully:**
```typescript
if (await errorMessage.isVisible()) {
  test.skip(true, 'Cluster list API returned an error — skipping detail navigation')
  return
}
```

**Waiting for dynamic content:**
```typescript
await expect(page).toHaveURL(/\/clusters\/.+/)
await expect(page.getByText(/loading/i)).toBeHidden({ timeout: 20_000 })
```

**Flexible selector matching:**
```typescript
const readyState = page.locator('h1').first().or(page.getByRole('heading', { name: /failed/ }))
await expect(readyState).toBeVisible()
```

**Checking multiple conditions:**
```typescript
const table = page.locator('table').first()
const queryError = page.getByText(/failed to load/i)
await expect(table.or(queryError)).toBeVisible({ timeout: 15_000 })
```

## Common Patterns

**Async Testing:**

Unit tests with async functions:
```typescript
it('returns cached value on cache hit', async () => {
  mockGet.mockResolvedValue(JSON.stringify({ data: 'cached' }))
  const fn = vi.fn().mockResolvedValue({ data: 'fresh' })
  const result = await cached('test-key', 60, fn)
  expect(result).toEqual({ data: 'cached' })
})
```

E2E tests with Playwright waits:
```typescript
await page.goto('/clusters')
await expect(page.locator('table').first()).toBeVisible({ timeout: 15_000 })
```

**Error Testing:**

Unit test error scenarios:
```typescript
it('calls fn when redis.get throws', async () => {
  mockGet.mockRejectedValue(new Error('Redis error'))
  const fn = vi.fn().mockResolvedValue({ data: 'fallback' })
  const result = await cached('test-key', 60, fn)
  expect(result).toEqual({ data: 'fallback' })
})

it('throws UNAUTHORIZED on missing session', async () => {
  const caller = createTestCaller(null, null)
  await expect(caller.auth.me()).rejects.toThrow('Authentication required')
})
```

E2E test error validation:
```typescript
it('should show error with wrong password', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email)
  await page.getByLabel(/password/i).fill('wrongpassword')
  await page.getByRole('button', { name: /sign in|log in|login/i }).click()
  await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 })
})
```

## Test Execution Rules

**Unit Tests:**
- Run via `pnpm test` (turbo runs in all packages)
- Each package runs independently with isolated env vars
- No external services required (all mocked)

**E2E Tests:**
- Run via `pnpm test:e2e`
- Requires running app: backend (port 4000) + frontend (port 3000 or 9000)
- Requires seeded database
- **Critical: BASE_URL must be set correctly** — wrong BASE_URL is #1 cause of test failures
- Correct value: `http://voyager-platform.voyagerlabs.co` (or set via env var)
- Single worker (not parallel) for stability
- Retries enabled in CI (2 retries)

**Visual Regression:**
- Run via `pnpm test:visual`
- Uses same Playwright config with visual-specific reporters
- Update snapshots via `pnpm test:visual:update`

## Gate Conditions

**E2E Test Gate:**
- **Zero tolerance:** All E2E tests must pass
- No skips, no partial passes
- Blocking: Cannot merge without passing all E2E tests
- Enforced by: Guardian gate checker

**Vitest Unit Tests:**
- Must lint without Biome errors (`pnpm lint`)
- TypeScript must compile (`pnpm typecheck`)
- No explicit test count requirement

---

*Testing analysis: 2026-03-26*
