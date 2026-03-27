# QA Validation Skill — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Problem:** AI agent approves broken pages by glancing at screenshots and ignoring missing data, console errors, and structural issues.

---

## Problem Statement

During interactive QA validation using the Playwright MCP, the AI agent consistently:

1. Takes a screenshot and checks for ONE specific element (the thing it just changed)
2. Ignores empty data tables, error banners, missing navigation, broken layouts
3. Declares "fixed!" or "looks good!" despite obvious issues visible in the screenshot
4. Never checks console errors, DOM structure, or runs programmatic assertions

This is the **"confirmation bias hallucination"** pattern — the agent that made the change validates its own work and unconsciously seeks confirming evidence.

## Root Cause Analysis

**No QA validation protocol exists.** The project has skills for TDD, debugging, and verification-before-completion, but nothing that prescribes HOW to validate a live page. The agent defaults to the lowest-effort path: take screenshot, glance, approve.

**Wrong tool prioritization.** The Playwright MCP's `browser_snapshot` (accessibility tree — structured text, deterministic) is rarely used. Instead, the agent relies on `browser_take_screenshot` (visual image requiring vision model interpretation — subjective, hallucination-prone).

**Official Playwright MCP guidance confirms this is backwards:** The `browser_snapshot` tool description states "this is better than screenshot" and the MCP server is designed to "operate purely on structured data, making it fast, lightweight, and deterministic."

## Solution: 5-Layer Validation Protocol

A dedicated skill that enforces a mandatory, sequential validation protocol every time a page is validated. Each layer catches what the previous one misses.

### Layer 1 — Accessibility Snapshot (Structural Validation)

**Tool:** `browser_snapshot`

The accessibility tree returns structured YAML-style text showing headings, navigation, tables, buttons, and their content. This is text — the LLM reasons about it deterministically without vision model interpretation.

**Mandatory checks:**

| Check | Pass | Fail |
|-------|------|------|
| Page heading present | h1/h2 with meaningful text | No heading, "Error", "Not Found", "Loading" stuck |
| Navigation rendered | Sidebar has expected items | Missing nav, 0 items, partial render |
| Content area has data | Tables have rows, lists have items, cards have content | Empty tables, "No data", only loading spinners |
| No error indicators | No elements with error/failed roles or text | Error banners, alert roles with error text |
| Correct page identity | Title/heading matches expected page | Wrong page, login redirect, 404 |

**Why first:** Structured text eliminates hallucination. If there are zero table rows, the snapshot literally shows zero rows.

### Layer 2 — Console Error Gate

**Tool:** `browser_console_messages` with `level: "error"`

**Rule:** Zero errors = pass. Any error = FAIL.

Catches: React hydration mismatches, failed API calls, uncaught exceptions, tRPC errors, missing modules.

### Layer 3 — Programmatic Assertions

**Tool:** `browser_run_code`

Run page-type-specific JavaScript assertions:
- Data pages: table row count > 0, no loading spinners, no empty-state messages
- Dashboard: widget cards present, numbers visible, charts rendered
- Login: email/password fields present, submit button exists
- Detail views: tab bar present, detail content rendered
- Settings: form fields or list items rendered

Uses Playwright's auto-retrying assertion patterns where possible.

### Layer 4 — Screenshot (Visual Confirmation)

**Tool:** `browser_take_screenshot` with `fullPage: true`

**Only meaningful after Layers 1-3 pass.** The screenshot confirms visual appearance, not structural correctness. Must answer ALL questions:

- Is there visible content/data? (not just rendered elements — actual data)
- Does the layout look intact? (sidebar + content properly arranged)
- Are there any error banners/toasts visible?
- Does it match the expected page?
- Is the theme consistent? (no mixed light/dark elements)

### Layer 5 — Structured Report

Every validation outputs a pass/fail table with evidence per layer:

```
QA Validation: /clusters
Layer 1 (Snapshot):   PASS — h1="Clusters", nav=6 items, table=5 rows
Layer 2 (Console):    PASS — 0 errors
Layer 3 (Assertions): PASS — dataRows=5, noLoader=true, noErrorOverlay=true
Layer 4 (Visual):     PASS — Layout intact, data visible, theme consistent
VERDICT:              PASS
```

On failure, the report shows exactly what failed and why:

```
QA Validation: /clusters
Layer 1 (Snapshot):   FAIL — table=0 rows, text "No clusters found" present
Layer 2 (Console):    PASS — 0 errors
Layer 3 (Assertions): FAIL — dataRows=0, showsEmptyState=true
Layer 4 (Visual):     FAIL — Empty data table, no cluster cards visible
VERDICT:              FAIL — Page rendered but has no data
```

## Page-Type Registry

| Page Type | Routes | Healthy Indicators |
|-----------|--------|-------------------|
| Dashboard | `/` | Cluster count widget > 0, summary cards with numbers, charts with data |
| Data Table | `/clusters`, `/alerts`, `/events`, `/logs` | Table >=1 row, column headers, pagination/count |
| Detail View | `/clusters/[id]/*` | 10-tab bar, detail content, heading = cluster name |
| Settings | `/settings`, `/users`, `/teams`, `/permissions`, `/webhooks` | Form fields or list rendered, action buttons present |
| Auth | `/login` | Email + password fields, submit button, no session cookie |
| AI/Tools | `/ai`, `/anomalies`, `/karpenter`, `/system-health` | Content section rendered, no error state |

## Dual-Agent Mode (Critical Gates)

For phase completion, pre-PR, and full QA sweeps, a separate `qa-validator` agent validates independently. It receives ONLY:

- URL to validate
- Page type
- Expected state description (what a healthy page looks like)

The validator has NO context about what was changed. It follows the same 5-layer protocol and returns a structured report. The main agent cannot override a FAIL verdict.

**When to use dual-agent:**

| Situation | Mode |
|-----------|------|
| Quick dev check | Single-agent, 5-layer protocol |
| After completing a fix, before telling user "done" | Single-agent, full protocol |
| Phase completion / QA gate | Dual-agent, full sweep |
| Pre-PR / merge-critical | Dual-agent, both themes |

## Trigger Rules

**Mandatory invocation (cannot skip):**
1. After any UI/frontend code change — before claiming "fixed" or "works"
2. Before declaring any QA result
3. Phase completion (dual-agent)
4. Pre-PR validation (dual-agent)

**Auto-trigger keywords:** QA, validate, verify, check page, test UI, screenshot, "does this look right"

## Iron Rules

1. NEVER call `browser_take_screenshot` without first calling `browser_snapshot` and `browser_console_messages`
2. NEVER declare PASS if any layer returned FAIL
3. NEVER skip the structured report output
4. A screenshot showing an empty page is ALWAYS a FAIL
5. "It rendered" does not equal "It works" — data must be present, errors must be zero
6. If the accessibility snapshot shows zero data rows, the page FAILS — no visual override

## File Structure

```
.claude/skills/qa-validate/
├── SKILL.md              # Core skill — protocol, triggers, iron rules (<500 lines)
├── references/
│   ├── page-assertions.md    # Page-type assertion templates (JS snippets)
│   ├── report-format.md      # Report format examples (PASS and FAIL)
│   └── aria-snapshot-guide.md # How to interpret accessibility tree output
└── scripts/                  # Optional: reusable validation scripts

.claude/agents/
└── qa-validator.md       # Dual-agent validator definition
```

## Alignment with Official Playwright MCP Best Practices

This design follows the official Microsoft Playwright MCP guidance:

1. **Snapshot-first:** The MCP server "operates purely on structured data, making it fast, lightweight, and deterministic." Our Layer 1 uses this as the primary signal.
2. **Screenshots are supplementary:** The official docs state screenshots are "useful for visual verification but not required for LLM interactions." Our Layer 4 is the last check, not the first.
3. **Structured assertions:** Playwright recommends web-first assertions (`toBeVisible()`, `toContainText()`, `toHaveCount()`) that auto-retry. Our Layer 3 uses programmatic assertions via `browser_run_code`.
4. **ARIA snapshot format:** The accessibility tree uses the same YAML format as `toMatchAriaSnapshot()`, enabling deterministic structural validation.
5. **Console error monitoring:** The official closed-loop workflow includes "observe app" which includes console state.

## Success Criteria

1. Zero false approvals — no more "looks good!" on empty/broken pages
2. Every QA validation includes all 5 layers with structured evidence
3. Console errors are caught on every page check
4. Missing data is caught by Layer 1 (snapshot) before reaching Layer 4 (screenshot)
5. Dual-agent mode eliminates confirmation bias for critical gates
