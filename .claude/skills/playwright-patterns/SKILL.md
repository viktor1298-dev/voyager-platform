---
name: playwright-patterns
description: >
  Safe Playwright MCP interaction patterns for voyager-platform (SSE-driven app).
  Use this skill whenever interacting with the browser via mcp__playwright__* tools,
  writing browser_run_code scripts, waiting for page elements, handling browser lock
  collisions, or recovering from Playwright errors. Triggers on: "browser stuck",
  "browser error", "page not loading", "already in use", any Playwright timeout,
  any QA task involving browser interaction, before writing browser_run_code scripts.
---

# Playwright MCP Patterns for Voyager Platform

This is an SSE-driven application. Standard Playwright patterns that work on static
sites will FAIL here. Follow these rules exactly.

## Hard-Blocked Patterns (PreToolUse hook enforces these)

These patterns are blocked by a PreToolUse hook and will be rejected:

### 1. Never Use `networkidle`

```javascript
// ❌ BLOCKED — SSE keeps connections alive, networkidle NEVER resolves
await page.waitForLoadState('networkidle')
await page.reload({ waitUntil: 'networkidle' })
await page.goto(url, { waitUntil: 'networkidle' })

// ✅ Use browser_snapshot (waits for page to settle internally)
// Or use browser_wait_for with a specific selector
```

**Why:** Voyager Platform uses Server-Sent Events (SSE) for live data. SSE keeps an
HTTP connection open permanently, so the browser never reaches "network idle" state.
Any code using `networkidle` will timeout after 30 seconds.

### 2. Never Use `require()` in browser_run_code

```javascript
// ❌ BLOCKED — browser_run_code runs in the BROWSER, not Node.js
async (page) => {
  const { execSync } = require('child_process')  // ReferenceError: require is not defined
}

// ✅ Use Bash tool for Node.js/shell operations
// ✅ Use browser_evaluate for browser-only JS (no page object)
// ✅ Use browser_run_code only for Playwright Page API calls
```

**Why:** `browser_run_code` passes your function to Playwright which runs it with a
`page` parameter. The execution context has Playwright APIs but NOT Node.js APIs.

### 3. Never Use `page.accessibility.snapshot()`

```javascript
// ❌ BLOCKED — deprecated Playwright API
const tree = await page.accessibility.snapshot()

// ✅ Use browser_snapshot MCP tool instead
// It returns the same accessibility tree as structured text
```

### 4. Never Use `/next/i` as a Button Name Selector

```javascript
// ❌ BLOCKED — matches Next.js Dev Tools button AND wizard Next button
await page.getByRole('button', { name: /next/i }).click()
await page.getByRole('button', { name: /go to next step|next/i }).click()

// ✅ Use exact aria-label string
await page.getByRole('button', { name: 'Go to next step' }).click()
// ✅ Or use data-testid (immune to text collisions)
await page.locator('[data-testid="wizard-next-btn"]').click()
```

**Why:** Next.js 16 injects a floating `<button id="next-logo" aria-label="Open Next.js Dev Tools">`
in dev mode. The regex `/next/i` matches both "Go to **next** step" and "Open **Next**.js Dev Tools",
causing a Playwright strict mode violation (2 elements found). This also applies to
`getByText(/next/i)` and any case-insensitive locator containing "next".

### 5. Never Assume `textarea` Exists on Wizard Step 2

```javascript
// ❌ WRONG — only Kubeconfig provider has a textarea; AWS/Azure have text inputs
await page.locator('textarea').first().fill('...')

// ✅ Verify provider first, then use specific selector
await page.locator('textarea[placeholder*="apiVersion"]').fill('...')  // Kubeconfig
await page.locator('[data-testid="aws-access-key"]').fill('...')       // AWS EKS
```

**Why:** The Add Cluster Wizard's Step 2 renders different form fields per provider:
- **Kubeconfig:** FileDrop + textarea (YAML)
- **AWS EKS:** 4 text inputs (access key, secret key, region, endpoint)
- **Azure AKS:** 3 text inputs
- **GKE:** textarea (service account JSON) + text input
- **Minikube:** 3 file drops + text input

A bare `textarea` selector will timeout on AWS/Azure/Minikube providers.

## Browser Lock Recovery Protocol

When any Playwright tool returns **"Browser is already in use"**:

```
Step 1: Wait 5 seconds (previous operation may complete)
Step 2: Call browser_close to release the lock
Step 3: Wait 2 seconds
Step 4: Resume from your last browser_navigate call
```

**Critical rules:**
- Do NOT call `browser_navigate` while the lock is held (it also needs the lock)
- Do NOT call `browser_navigate` repeatedly hoping it resolves (it won't)
- Do NOT kill the Playwright MCP process (severs stdio pipe permanently — see CLAUDE.md)
- If `browser_close` also fails with the lock error, inform the user and suggest `/mcp` restart

## Waiting Strategies for SSE Pages

| Situation | Wrong Approach | Correct Approach |
|-----------|---------------|-----------------|
| Page load | `waitForLoadState('networkidle')` | `browser_snapshot` (implicit wait) |
| Data appears | `waitForLoadState('networkidle')` | `browser_wait_for` with selector for table/row |
| After click | `waitForTimeout(3000)` | `browser_snapshot` then check content |
| Page transition | `waitForURL` with regex | `browser_snapshot` and verify heading text |
| Post-navigation | `page.goto(url)` | `browser_navigate` MCP tool (handles waits) |

### Preferred wait pattern:

```javascript
// After navigating, use browser_snapshot — it waits internally for the page to settle
// Then check the accessibility tree for expected content before proceeding
```

## Correct Selector Discovery (Snapshot-First)

**Never guess selectors.** Always discover them from the accessibility snapshot.

```
// ❌ WRONG — guessing selector names
await page.getByText('Light')
await page.getByRole('menuitem', { name: 'Light' })
await page.locator('[data-radix-popper-content-wrapper] >> text=Light')

// ✅ CORRECT — discover from snapshot
// 1. Call browser_snapshot
// 2. Read the accessibility tree — find [ref=eN] for the element
// 3. Call browser_click ref="eN"
```

**Theme toggle example:**
1. `browser_snapshot` → find the theme toggle button in the tree (look for "Toggle theme" or similar)
2. `browser_click ref="eN"` → click it
3. `browser_snapshot` → find "Light" or "Dark" option with its ref
4. `browser_click ref="eM"` → select the theme

This works every time because you're using the actual element refs, not guessing CSS.

## Code Context Rules

| Tool | Execution Context | Has `page` Object | Can Use Node.js APIs | Use For |
|------|------------------|-------------------|---------------------|---------|
| `browser_run_code` | Playwright runner | Yes | No | Locators, waits, page interactions |
| `browser_evaluate` | Browser page (DOM) | No | No | Reading localStorage, counting DOM elements, checking CSS |
| Bash tool | Node.js / shell | N/A | Yes | kubectl, curl, file operations |

**Common mistake:** Using `browser_run_code` to run kubectl commands or read files.
Those are Node.js operations — use the Bash tool.

## The Snapshot-First Golden Path

This is the recommended pattern for ALL browser interactions in voyager-platform:

```
1. browser_navigate → go to the URL
2. browser_snapshot → wait for page to settle, get accessibility tree
3. Read the tree   → find [ref=eN] for elements you need
4. browser_click   → interact using ref="eN"
5. browser_snapshot → verify the result
6. Repeat 3-5      → for additional interactions
```

**Why this works:**
- `browser_navigate` handles initial page load
- `browser_snapshot` waits for the page to settle (no explicit wait needed)
- Element refs from the snapshot are guaranteed to exist
- No selector guessing, no timeout tuning, no CSS class assumptions

## Anti-Patterns Summary

| Pattern | Error It Causes | Prevention |
|---------|----------------|-----------|
| `networkidle` | 30s timeout on every SSE page | Use `browser_snapshot` |
| `require()` in browser code | `ReferenceError: require is not defined` | Use Bash tool for Node.js |
| `page.accessibility.snapshot()` | Deprecated API error | Use `browser_snapshot` tool |
| Guessing selectors | Timeout waiting for non-existent element | Snapshot-first, use refs |
| Rapid navigate-navigate | "Browser is already in use" | Wait + close + retry |
| `page.goto()` in run_code | Conflicts with MCP navigation state | Use `browser_navigate` tool |
| `waitForURL` with regex | Pattern mismatch, timeout | Use `browser_snapshot` + check heading |
| `/next/i` regex selector | Strict mode violation (2 elements) | Use exact `'Go to next step'` or `data-testid` |
| Bare `textarea` on wizard | Timeout (wrong provider step) | Verify provider before assuming form fields |

## Add Cluster Wizard — Selector Reference

The wizard has 4 steps and 5 providers. Use these selectors for reliable navigation:

| Action | aria-label (exact) | data-testid |
|--------|-------------------|-------------|
| Next (steps 1-3) | `'Go to next step'` | `wizard-next-btn` |
| Back (steps 2-4) | `'Go back to previous step'` | `wizard-back-btn` |
| Cancel (step 1) | `'Cancel wizard'` | `wizard-cancel-btn` |
| Submit (step 4) | `'Add cluster'` | `wizard-submit-btn` |

**Provider tiles (Step 1):** Use `getByRole('radio', { name: /kubeconfig|aws eks|azure aks|google gke|minikube/i })`

**Step 2 fields vary by provider** — always check which provider is active before interacting with form fields.
