---
phase: 9
slug: lens-inspired-power-features
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit), Playwright 1.58.x (E2E) |
| **Config file** | `vitest.config.ts` (root), `playwright.config.ts` (root) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm typecheck && pnpm build` |
| **Estimated runtime** | ~45 seconds (test), ~90 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `pnpm test && pnpm typecheck && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated after plans are created* | | | | | | | |

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. Vitest + Playwright already configured.
- New dependencies (`@xterm/xterm`, `@xyflow/react`, `@fastify/websocket`, `js-yaml`, `@dagrejs/dagre`) installed as part of relevant plans.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Terminal connects to pod | LENS-01 | Requires live K8s cluster + running pod | Connect to dev cluster, exec into any pod, type `ls` |
| React Flow topology renders | LENS-09/11 | Visual graph layout needs human review | Navigate to topology/network policies, verify nodes positioned logically |
| Events timeline scroll/zoom | LENS-06 | Interactive time-based navigation | Hover event dots, drag to zoom, verify popovers |
| RBAC matrix readability | LENS-10 | Permission grid with many rows/columns | Load RBAC page with real cluster, verify cell layout at 1920x1080 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
