---
phase: 8
slug: resource-explorer-ux-overhaul
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit), Playwright (E2E), Biome (lint) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts`, `biome.json` |
| **Quick run command** | `pnpm typecheck && pnpm build` |
| **Full suite command** | `pnpm typecheck && pnpm build && pnpm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck && pnpm build`
- **After every plan wave:** Run `pnpm typecheck && pnpm build && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| (populated during planning) | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. No new test framework needed.
- `pnpm typecheck` and `pnpm build` already validate TypeScript compilation across all packages.
- Visual validation via browser testing (Playwright MCP or manual).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Namespace grouping visual layout | UX-01 | Visual appearance | Open each resource tab, verify namespace sections render correctly |
| Expand All/Collapse All toggle | UX-03 | Interactive behavior | Click toggle, verify all cards expand/collapse |
| Log beautifier formatting | UX-07 | Visual formatting | Open logs tab, verify JSON pretty-print, level badges, search |
| Cross-resource hyperlinks | UX-10 | Navigation flow | Click hyperlink in expanded detail, verify navigation to target resource |
| Real-time update after pod delete | UX-05 | Requires K8s cluster | Delete a pod, verify UI updates without manual refresh |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
