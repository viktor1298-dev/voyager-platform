# QA Validation Report Format

The structured report is Layer 5 of the protocol. It's mandatory — you cannot
declare a page as passing or failing without producing this report.

## Single-Page Report

```
QA VALIDATION: /clusters
─────────────────────────────────────────────────
Layer 1 (Snapshot):    PASS — h1="Clusters", nav=6 items, table=5 rows
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  PASS — dataRows=5, noLoader=true, noErrorOverlay=true
Layer 4 (Visual):      PASS — Layout intact, data visible, theme consistent
─────────────────────────────────────────────────
VERDICT: PASS
```

## Failed Report

```
QA VALIDATION: /clusters
─────────────────────────────────────────────────
Layer 1 (Snapshot):    FAIL — table has 0 rows, text "No clusters found" present
Layer 2 (Console):     FAIL — 2 errors: "TypeError: Cannot read property 'map' of undefined", "Failed to fetch /trpc/clusters.list"
Layer 3 (Assertions):  FAIL — dataRows=0, showsEmptyState=true, isLoading=false
Layer 4 (Visual):      FAIL — Empty table visible, no cluster data
─────────────────────────────────────────────────
VERDICT: FAIL — Page rendered but has no data; 2 console errors indicate API failure
```

## Layer Evidence Format

Each layer's evidence should be concise but specific:

### Layer 1 Evidence (Snapshot)
Report key structural findings from the accessibility tree:
- `h1="Page Title"` — the main heading
- `nav=N items` — navigation item count
- `table=N rows` — data row count (most important signal)
- Any error/alert elements found
- Missing expected elements

### Layer 2 Evidence (Console)
- `0 errors` — clean
- `N errors: "error text 1", "error text 2"` — list each error

### Layer 3 Evidence (Assertions)
Report the key assertion results as `name=value` pairs:
- `dataRows=5` — how many data rows found
- `noLoader=true` — loading state resolved
- `noErrorOverlay=true` — no error overlays
- Any failed assertion with its actual value

### Layer 4 Evidence (Visual)
Brief description of visual state:
- "Layout intact, data visible, theme consistent" (PASS)
- "Empty table, sidebar missing, mixed theme" (FAIL)

## Multi-Page Sweep Report

When validating multiple pages (QA gate, pre-PR):

```
QA SWEEP: voyager-platform (dark theme)
═══════════════════════════════════════════════════

QA VALIDATION: /login (unauthenticated)
─────────────────────────────────────────────────
Layer 1 (Snapshot):    PASS — h1="Sign In", email field, password field, submit button
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  PASS — hasEmailField, hasPasswordField, hasSubmitButton
Layer 4 (Visual):      PASS — Login form centered, theme consistent
─────────────────────────────────────────────────
VERDICT: PASS

[Login with credentials...]

QA VALIDATION: / (Dashboard)
─────────────────────────────────────────────────
Layer 1 (Snapshot):    PASS — h1="Dashboard", nav=6 items, 4 widget cards
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  PASS — widgetCards=4, hasNumbers=true, charts=2
Layer 4 (Visual):      PASS — Widgets show data, charts rendered, layout OK
─────────────────────────────────────────────────
VERDICT: PASS

QA VALIDATION: /clusters
─────────────────────────────────────────────────
Layer 1 (Snapshot):    PASS — h1="Clusters", nav=6 items, table=5 rows
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  PASS — dataRows=5, noLoader, noErrorOverlay
Layer 4 (Visual):      PASS — Data table populated, status badges visible
─────────────────────────────────────────────────
VERDICT: PASS

QA VALIDATION: /alerts
─────────────────────────────────────────────────
Layer 1 (Snapshot):    PASS — h1="Alerts", table=12 rows
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  PASS — dataRows=12, noLoader
Layer 4 (Visual):      PASS — Alert severity colors visible, table populated
─────────────────────────────────────────────────
VERDICT: PASS

[Theme switch to light mode...]

QA VALIDATION: / (Dashboard, light theme)
─────────────────────────────────────────────────
Layer 1 (Snapshot):    PASS — same structure as dark theme
Layer 2 (Console):     PASS — 0 errors
Layer 3 (Assertions):  PASS — same results
Layer 4 (Visual):      PASS — Light theme consistent, no mixed dark elements
─────────────────────────────────────────────────
VERDICT: PASS

═══════════════════════════════════════════════════
SWEEP SUMMARY: 5/5 pages PASS, 0 console errors total
═══════════════════════════════════════════════════
```

## Partial Failure Sweep

When some pages pass and others fail:

```
═══════════════════════════════════════════════════
SWEEP SUMMARY: 3/5 pages PASS, 2 FAIL

FAILURES:
  /clusters — 0 data rows, API error in console
  /alerts   — Loading spinner stuck after 10s

ACTION REQUIRED: Fix API connection before declaring QA pass
═══════════════════════════════════════════════════
```

## Rules

1. Every validation produces a report — no exceptions
2. Evidence must be specific (actual values, not just "looks OK")
3. VERDICT is the last line and is derived from layer results
4. If any layer is FAIL, VERDICT is FAIL
5. On multi-page sweeps, include a summary with pass/fail counts
6. Failed pages get a one-line explanation of what's wrong
