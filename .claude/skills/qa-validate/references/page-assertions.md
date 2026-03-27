# Page-Type Assertion Templates

Ready-to-use `browser_run_code` snippets for Layer 3 of the QA validation protocol.
Pick the template matching the URL, adapt selectors if needed, and run it.

## Table of Contents

1. [Dashboard](#dashboard)
2. [Data Table](#data-table)
3. [Cluster Detail](#cluster-detail)
4. [Login](#login)
5. [Settings / Admin](#settings--admin)
6. [AI / Tools](#ai--tools)
7. [Custom Assertions](#custom-assertions)

---

## Dashboard

**Routes:** `/`

```javascript
async (page) => {
  // Wait for initial data load
  await page.waitForLoadState('networkidle')

  const results = {}

  // Widget cards present (cluster count, node count, etc.)
  results.widgetCards = await page.locator('[class*="card"], [class*="widget"], [class*="Card"]').count()
  results.hasWidgets = results.widgetCards > 0

  // Numbers visible (indicates data loaded, not just skeleton)
  const numberElements = await page.locator('text=/\\d+/').count()
  results.hasNumbers = numberElements > 0

  // Charts rendered (recharts SVG elements)
  results.charts = await page.locator('svg.recharts-surface, [class*="chart"] svg, .recharts-wrapper').count()

  // Error indicators
  results.errorBanners = await page.locator('[role="alert"], [class*="error" i], [class*="Error"]').count()

  // Loading state resolved
  results.loadingSpinners = await page.locator('[class*="loading" i], [class*="spinner" i], .animate-spin, [class*="skeleton" i]').count()

  // Verdict
  results.verdict = (
    results.hasWidgets &&
    results.hasNumbers &&
    results.errorBanners === 0 &&
    results.loadingSpinners === 0
  ) ? 'PASS' : 'FAIL'

  return results
}
```

**What each check means:**
- `hasWidgets` — Dashboard cards rendered (not just an empty container)
- `hasNumbers` — Actual numeric data loaded (not placeholders or "—")
- `charts` — Chart SVGs present (0 is acceptable if charts are below fold)
- `errorBanners` — Zero means no visible error state
- `loadingSpinners` — Zero means page finished loading

---

## Data Table

**Routes:** `/clusters`, `/alerts`, `/events`, `/logs`, `/deployments`, `/namespaces`, `/services`

```javascript
async (page) => {
  await page.waitForLoadState('networkidle')

  const results = {}

  // Table structure
  results.headerColumns = await page.locator('table thead th, [role="columnheader"]').count()
  results.dataRows = await page.locator('table tbody tr, [role="row"]:not([role="columnheader"])').count()
  results.hasData = results.dataRows > 0

  // Empty state detection
  results.emptyStateVisible = await page.locator('text=/no .*(found|results|data|items)/i, text=/nothing to show/i, text=/empty/i').count() > 0

  // Loading state
  results.isLoading = await page.locator('[class*="loading" i], .animate-spin, [class*="skeleton" i]').count() > 0

  // Error overlays
  results.errorOverlay = await page.locator('[role="alert"], [class*="error" i]:not(input)').count() > 0

  // Pagination or count indicator (optional but good signal)
  results.hasPagination = await page.locator('[class*="pagination" i], text=/showing/i, text=/of \\d+/i, text=/page/i').count() > 0

  // Verdict
  results.verdict = (
    results.hasData &&
    !results.emptyStateVisible &&
    !results.isLoading &&
    !results.errorOverlay
  ) ? 'PASS' : 'FAIL'

  return results
}
```

**What each check means:**
- `dataRows > 0` — The table actually has data, not just headers
- `emptyStateVisible` — Catches "No clusters found" type messages
- `isLoading` — Page should have finished loading
- `errorOverlay` — No error banners or alert elements

---

## Cluster Detail

**Routes:** `/clusters/[id]`, `/clusters/[id]/nodes`, `/clusters/[id]/pods`, etc.

```javascript
async (page) => {
  await page.waitForLoadState('networkidle')

  const results = {}

  // Tab bar present (cluster detail has 10 tabs)
  results.tabs = await page.locator('[role="tablist"] [role="tab"], [class*="tab" i] a, [class*="tab" i] button').count()
  results.hasTabBar = results.tabs >= 5  // at least most tabs visible

  // Heading shows cluster name (not "Error" or "Loading")
  const headingEl = await page.locator('h1, h2').first()
  results.heading = headingEl ? await headingEl.textContent().catch(() => '') : ''
  results.headingLooksValid = results.heading.length > 0 &&
    !results.heading.match(/error|not found|loading/i)

  // Detail content area has content
  results.contentElements = await page.locator('main [class*="card"], main table, main [class*="content"]').count()
  results.hasContent = results.contentElements > 0

  // Not a 404 page
  results.is404 = await page.locator('text=/not found/i, text=/404/').count() > 0

  // Verdict
  results.verdict = (
    results.hasTabBar &&
    results.headingLooksValid &&
    results.hasContent &&
    !results.is404
  ) ? 'PASS' : 'FAIL'

  return results
}
```

---

## Login

**Routes:** `/login`

**Important:** Test this page in an unauthenticated state. Clear cookies first.

```javascript
async (page) => {
  await page.waitForLoadState('networkidle')

  const results = {}

  // Form fields present
  results.emailField = await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').count()
  results.passwordField = await page.locator('input[type="password"]').count()
  results.submitButton = await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').count()

  results.hasEmailField = results.emailField > 0
  results.hasPasswordField = results.passwordField > 0
  results.hasSubmitButton = results.submitButton > 0

  // Check we're actually on the login page (not redirected)
  results.currentUrl = page.url()
  results.isOnLoginPage = results.currentUrl.includes('/login')

  // No unexpected error messages
  results.errorMessages = await page.locator('[role="alert"], [class*="error" i]:not(input)').count()

  // Verdict
  results.verdict = (
    results.hasEmailField &&
    results.hasPasswordField &&
    results.hasSubmitButton &&
    results.isOnLoginPage
  ) ? 'PASS' : 'FAIL'

  return results
}
```

---

## Settings / Admin

**Routes:** `/settings`, `/users`, `/teams`, `/permissions`, `/webhooks`, `/features`, `/audit`, `/feature-flags`

```javascript
async (page) => {
  await page.waitForLoadState('networkidle')

  const results = {}

  // Settings page has some form of content
  results.formFields = await page.locator('input, select, textarea, [role="switch"]').count()
  results.listItems = await page.locator('table tbody tr, [role="listitem"], li').count()
  results.actionButtons = await page.locator('button:not([disabled])').count()

  results.hasFormContent = results.formFields > 0
  results.hasListContent = results.listItems > 0
  results.hasActions = results.actionButtons > 0
  results.hasAnyContent = results.hasFormContent || results.hasListContent

  // Page heading
  const heading = await page.locator('h1, h2').first()
  results.heading = heading ? await heading.textContent().catch(() => '') : ''
  results.headingPresent = results.heading.length > 0

  // No error state
  results.errorState = await page.locator('[role="alert"], text=/error/i, text=/failed/i').count() > 0

  // Verdict
  results.verdict = (
    results.hasAnyContent &&
    results.headingPresent &&
    !results.errorState
  ) ? 'PASS' : 'FAIL'

  return results
}
```

---

## AI / Tools

**Routes:** `/ai`, `/anomalies`, `/karpenter`, `/system-health`, `/health`

```javascript
async (page) => {
  await page.waitForLoadState('networkidle')

  const results = {}

  // Content section rendered (not just a heading)
  results.contentSections = await page.locator('main > div, [class*="content"], [class*="container"]').count()
  results.hasContent = results.contentSections > 0

  // Not in error state
  results.errorState = await page.locator('text=/unavailable/i, text=/error/i, text=/failed to load/i').count() > 0

  // Not empty
  results.isEmpty = await page.locator('text=/no data/i, text=/nothing/i, text=/empty/i').count() > 0

  // Interactive elements present (buttons, inputs, etc.)
  results.interactiveElements = await page.locator('button, input, [role="button"]').count()

  // Verdict
  results.verdict = (
    results.hasContent &&
    !results.errorState
  ) ? 'PASS' : 'FAIL'

  return results
}
```

---

## Custom Assertions

When the page doesn't fit a standard type, build assertions from these primitives:

```javascript
async (page) => {
  const results = {}

  // Element exists and is visible
  results.elementVisible = await page.locator('YOUR_SELECTOR').isVisible().catch(() => false)

  // Element has text content (not empty)
  const text = await page.locator('YOUR_SELECTOR').textContent().catch(() => '')
  results.hasText = text.trim().length > 0

  // Count of elements
  results.elementCount = await page.locator('YOUR_SELECTOR').count()

  // Element does NOT exist (for error states)
  results.noErrors = await page.locator('[role="alert"]').count() === 0

  // Current URL check
  results.correctUrl = page.url().includes('/expected-path')

  // Combine into verdict
  results.verdict = (results.elementVisible && results.hasText) ? 'PASS' : 'FAIL'

  return results
}
```

### Tips for Writing Assertions

1. **Always use `.catch(() => fallback)`** on async locator methods — elements may not exist
2. **Use `waitForLoadState('networkidle')`** before assertions to let data load
3. **Avoid CSS class-only selectors** — prefer role, text, or data-testid selectors
4. **Check for absence of errors** as well as presence of content
5. **Return structured objects** with named boolean fields — makes the Layer 5 report readable
