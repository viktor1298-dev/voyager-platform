---
name: qa-validate
description: >-
  Validates web pages during QA using a 5-layer protocol: accessibility snapshot,
  console errors, programmatic assertions, screenshot, and structured report.
  Use this skill whenever you validate a page, check if a UI change works, take
  a screenshot for QA, verify a fix visually, test the frontend, or do any page
  validation. This skill MUST be invoked before calling browser_take_screenshot
  and before declaring any UI change as "fixed" or "working". Also use when the
  user asks to "check the page", "does this look right", "QA this", "verify the
  UI", or "test the app". If you are about to look at a web page and form an
  opinion about whether it works, you need this skill.
---

# QA Page Validation — 5-Layer Protocol

## Why This Skill Exists

When you take a screenshot and glance at it, you tend to check for ONE thing — the
element you just changed — and ignore everything else. Empty data tables, console
errors, missing navigation, broken layouts all slip through because you're
unconsciously looking for evidence that your fix worked, not evidence that it didn't.

This is called **confirmation bias** and it's well-documented in AI agent QA workflows.
The fix is structured validation: instead of asking yourself "does this look right?",
you run a deterministic checklist where each check produces a binary pass/fail with
evidence. You can't hallucinate past a table row count of zero.

## The Protocol

Every page validation follows 5 layers in order. Each layer catches what the previous
one misses. All layers run regardless of earlier failures — but the verdict is FAIL
if any layer fails.

```
Layer 1: Accessibility Snapshot  →  structured text, deterministic
Layer 2: Console Error Gate      →  zero errors required
Layer 3: Programmatic Assertions →  page-type-specific checks
Layer 4: Screenshot              →  visual confirmation (LAST, not first)
Layer 5: Structured Report       →  pass/fail table with evidence
```

### Layer 1 — Accessibility Snapshot

**Tool:** `browser_snapshot`

This returns the accessibility tree as structured YAML-style text — headings,
navigation items, table rows, buttons, links, form fields. It's text, not pixels,
so you reason about it deterministically.

**Why this is the primary signal:** The Playwright MCP docs state that `browser_snapshot`
"is better than screenshot" and the server "operates purely on structured data, making
it fast, lightweight, and deterministic." Screenshots require vision model interpretation
which is subjective and prone to hallucination. The snapshot is objective.

**Check all of these against the snapshot:**

| Check | PASS | FAIL |
|-------|------|------|
| Page heading | h1/h2 with meaningful text | No heading, or text is "Error" / "Not Found" / "Loading" (stuck) |
| Navigation | Sidebar present with expected items | Missing nav, 0 items, or incomplete render |
| Content data | Tables have rows, lists have items, cards show content | 0 rows, "No data" message, empty containers |
| Error elements | No error/alert roles with failure text | Error banners, alert messages, 404/500 text |
| Page identity | Heading/title matches the page being validated | Wrong page, unexpected redirect, login page when should be authenticated |

If the snapshot shows **zero data rows** on a page that should have data, the page
**FAILS** — there is no visual override for this. A screenshot of an empty table
is still an empty table.

### Layer 2 — Console Error Gate

**Tool:** `browser_console_messages` with `level: "error"`

**Zero errors = PASS. Any error = FAIL.**

This catches problems that are completely invisible in screenshots:
- React hydration mismatches (server/client HTML differs)
- Failed tRPC/API calls (NetworkError, TypeError)
- Uncaught runtime exceptions
- Module resolution failures

List every error in the report. Even one error means the page is broken, even if
it looks fine visually.

### Layer 3 — Programmatic Assertions

**Tool:** `browser_run_code`

Run JavaScript assertions tailored to the page type. This catches things the
accessibility tree might miss: loading spinners that haven't resolved, elements
hidden by CSS but present in DOM, exact data counts.

Pick the right assertion set based on the URL. See `references/page-assertions.md`
for ready-to-use templates per page type (dashboard, data table, detail view,
login, settings).

Each assertion returns an object with named boolean checks and a verdict. If any
check fails, the layer fails.

### Layer 4 — Screenshot

**Tool:** `browser_take_screenshot` with `fullPage: true`

This is the LAST layer, not the first. By the time you reach here, you already
know whether the page is structurally sound (Layer 1), error-free (Layer 2), and
functionally correct (Layer 3). The screenshot confirms visual appearance.

**Answer ALL of these — not just one:**

| Question | What to look for |
|----------|-----------------|
| Visible content? | Populated tables, data in cards, rendered charts — not just elements, actual data |
| Layout intact? | Sidebar + content properly arranged, no overlapping or broken grid |
| Error indicators? | Red banners, error toasts, warning modals, overlay messages |
| Correct page? | Expected page identity, right sections visible |
| Theme consistent? | All elements follow current theme, no mixed light/dark |

### Layer 5 — Structured Report

Output a table summarizing all layers. This is mandatory — you cannot skip it and
just say "looks good."

```
QA VALIDATION: /clusters
─────────────────────────────────────────────────
Layer 1 (Snapshot):    PASS — h1="Clusters", nav=6 items, table=5 rows
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  PASS — dataRows=5, noLoader, noErrorOverlay
Layer 4 (Visual):      PASS — Layout intact, data visible, theme OK
─────────────────────────────────────────────────
VERDICT: PASS
```

On failure, show exactly what failed:

```
QA VALIDATION: /clusters
─────────────────────────────────────────────────
Layer 1 (Snapshot):    FAIL — table has 0 rows, text "No clusters found" present
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  FAIL — dataRows=0, showsEmptyState=true
Layer 4 (Visual):      FAIL — Empty data table visible, no cluster data
─────────────────────────────────────────────────
VERDICT: FAIL — Page rendered but contains no data
```

## Page Types

Different pages have different "healthy" states. Identify the page type from the URL
before running assertions.

| Type | Routes | What "healthy" means |
|------|--------|---------------------|
| **Dashboard** | `/` | Widget cards with numbers > 0, charts with data points |
| **Data Table** | `/clusters`, `/alerts`, `/events`, `/logs` | Table with >=1 row, column headers, row count |
| **Detail** | `/clusters/[id]/*` | Tab bar (10 tabs), detail content, heading = entity name |
| **Settings** | `/settings`, `/users`, `/teams`, etc. | Form fields or list items rendered, action buttons |
| **Login** | `/login` | Email + password fields, submit button, NOT redirected away |
| **AI/Tools** | `/ai`, `/anomalies`, `/karpenter` | Content section rendered, no error state |

See `references/page-assertions.md` for the assertion template for each type.

## Validation Modes

| Situation | What to do |
|-----------|-----------|
| Quick dev check ("did my CSS fix work?") | Single-page, 5-layer protocol |
| After completing a fix | All pages you touched, 5-layer protocol |
| Phase completion / QA gate | Spawn `qa-validator` agent — full sweep, both themes |
| Pre-PR / merge-critical | Spawn `qa-validator` agent — all key pages, both themes |

### Dual-Agent Mode (Critical Gates)

For phase completion and pre-PR validation, spawn the `qa-validator` agent. It
receives ONLY the URL, page type, and expected state — no context about what was
changed. This eliminates confirmation bias because the validator doesn't know what
"should have changed."

The validator follows this same 5-layer protocol and returns a structured report.
You cannot override a FAIL verdict from the validator.

See `.claude/agents/qa-validator.md` for the agent definition.

## Multi-Page Sweep

When validating multiple pages (QA gate, pre-PR), follow this sequence:

1. **Clear cookies/state** — ensure clean session via `browser_evaluate`
2. **Test login page** (unauthenticated) — Layer 1-5
3. **Log in** — verify redirect to dashboard
4. **Dashboard** — Layer 1-5
5. **Each key page** — Layer 1-5 per page
6. **Switch theme** (dark ↔ light) — re-test dashboard + one data-heavy page
7. **Compile full report** — one table per page, overall verdict

## Understanding the Accessibility Snapshot

The snapshot output looks like this:

```
- navigation "Main sidebar":
  - link "Dashboard" [ref=e1]
  - link "Clusters" [ref=e2]
  - link "Alerts" [ref=e3]
- heading "Clusters" [level=1] [ref=e4]
- table [ref=e5]:
  - row:
    - cell "prod-us-east-1"
    - cell "Healthy"
    - cell "47 pods"
```

Key things to look for:
- **Headings** — present and meaningful (not "Error", "Loading")
- **Navigation** — all expected items listed
- **Tables** — look for `row` children; zero rows = no data
- **Forms** — `textbox`, `checkbox`, `button` elements present
- **Alerts** — `alert` role elements indicate errors
- **Content** — text content after the colon shows actual data values

For a deeper reference on interpreting snapshots, see `references/aria-snapshot-guide.md`.

## Tool Failure Handling

If any browser tool fails during validation, follow this recovery table before marking FAIL:

| Error | Recovery | Resume From |
|-------|----------|-------------|
| "Browser is already in use" | Wait 5s → `browser_close` → wait 2s | Re-run the failed layer |
| "Target page crashed" | `browser_close` → `browser_navigate` to URL | Layer 1 (full restart) |
| "Execution context destroyed" | `browser_navigate` to URL (page likely navigated away) | Layer 1 |
| Screenshot timeout | Use `browser_snapshot` first (text is faster than pixels) | Layer 4 |
| "networkidle" in timeout message | SSE pages never reach network idle — use `browser_snapshot` | Layer 1 |

**Key rules:**
- A tool failure does NOT mean the page failed QA. Retry before marking FAIL.
- A tool failure that persists after recovery = report as **BLOCKED**, not FAIL.
- Never kill the Playwright MCP process — use `browser_close` for recovery.

## Things That Will Trick You

These are patterns where you've historically declared "PASS" incorrectly:

1. **Page renders but has no data** — The sidebar and heading load fine, but the
   table/cards are empty. This is a FAIL. The snapshot will show zero rows.

2. **Loading spinner still visible** — The page looks busy/active, and you assume
   it's "loading." If it's still loading after the page settles, something is broken.

3. **Console errors you didn't check** — A page can look perfect visually while
   throwing hydration errors or failed API calls in the console.

4. **Wrong page** — You navigated to `/clusters` but got redirected to `/login`.
   The login page "looks fine" so you approve it. Check the URL.

5. **One section works, rest is broken** — You changed the sidebar and check only
   the sidebar. But the main content area broke. Check the whole page.

6. **Theme mismatch** — Half the components are dark theme, half are light.
   Subtle but broken.
