# BOARD.md — E2E Legacy Bug Fix + Phase E (v126+)

**Status:** READY
**Base:** v125 (deployed)

> ⚠️ NEW RULE (Vik mandate 2026-02-27): E2E gate = 0 failures. Always. No exceptions.
> A stage is NOT complete until E2E shows failed=0.

---

## 🔴 PRIORITY 0 — E2E Legacy Bugs (fix FIRST before any Phase E work)

These 3 bugs have been failing since v119 and were incorrectly allowed through the gate.
They must be fixed and verified at 0 failures before ANY Phase E feature work begins.

### LEGACY-1: `clusters.spec.ts` — should view cluster detail (failing since v119)
**File:** `tests/e2e/clusters.spec.ts` line ~24
**Error:** `expect(locator).toBeVisible()` failed
**Root cause:** Cluster detail page navigation or a selector changed. Test expects element that no longer exists at that selector.
**Fix:** 
1. Run the test locally with `--headed` to see what's happening
2. Find the broken selector — check if element was renamed/removed in recent UI changes
3. Fix the selector OR fix the underlying UI bug that hides the element
4. The fix must make the element ACTUALLY visible, not just update the selector to skip it

### LEGACY-2: `multi-cluster.spec.ts` — E2E-2: Cluster detail → live tab loads nodes (failing since v119)  
**File:** `tests/e2e/multi-cluster.spec.ts` — E2E-2
**Error:** `expect(locator).toBeVisible()` failed — live tab nodes not visible
**Root cause:** Live tab may not be loading node data correctly, or selector doesn't match actual DOM
**Fix:**
1. Check if live K8s data is actually available for the test cluster
2. Check selector for the nodes table/list in the live tab
3. May need to ensure test cluster has `connectionConfig` set (real minikube kubeconfig)
4. Fix so nodes actually appear when live tab is opened

### LEGACY-3: `multi-cluster.spec.ts` — E2E-3: Invalid kubeconfig → error message (failing since v119)
**File:** `tests/e2e/multi-cluster.spec.ts` — E2E-3
**Error:** `expect(locator).toBeVisible()` failed — error message not shown
**Root cause:** When invalid kubeconfig is added, the error message UI element is not appearing
**Fix:**
1. Verify the API actually returns an error for invalid kubeconfig
2. Check if error is displayed in the UI (may be hidden behind a toast that disappears too fast)
3. Fix the UI to show a persistent error state, OR wait for the toast before assertion

### CLEANUP-1: Remove `qa-v106.spec.ts`
**File:** `tests/e2e/qa-v106.spec.ts`
**Action:** Delete this file — it's from v106 and shouldn't be in the suite anymore

### CLEANUP-2: Fix `qa-v125.spec.ts` missing module import
**File:** `tests/e2e/qa-v125.spec.ts`  
**Error:** missing module import
**Fix:** Fix the broken import OR delete if this is a temporary QA test file

---

## ⚡ Environment-Blocked Completion Policy

When a feature is code-complete but QA is blocked by missing K8s environment:

**Requirements for Conditional COMPLETE:**
- [ ] Code Review = 10/10 (no exceptions)
- [ ] E2E tests written and PASSING for all non-environment-blocked flows
- [ ] QA documents EXACTLY which features are blocked and why
- [ ] QA scores accessible parts ≥ 8.5/10
- [ ] Vik explicitly approves conditional COMPLETE via Discord

**What gets flagged:**
- `environmentBlocked: true` in pipeline-state.json
- List of blocked features with reason
- These features become PRIORITY 0 for next phase (must have live cluster test)

**Gate changes rule:**
- Gate thresholds (E2E pass rate, QA score) CANNOT be changed during active development
- Gate changes only between phases, with Vik approval
- No retroactive gate tightening on in-progress versions

---

## 📋 Phase E — After LEGACY bugs are fixed

### E1: K8s RBAC + Pod Actions ← NEXT after legacy fixes
- ClusterRole: add delete pods + patch deployments
- Pod delete tRPC endpoint + UI
- Scale deployment UI (endpoint exists, needs UI wiring)
- Target: v126

### E2: Alerts Real Backend
- tRPC router + DB schema + evaluator job + UI
- Target: v127

### E3: Webhooks Real Backend  
- tRPC + DB + UI + Alerts integration
- Target: v128

### E4: AI Assistant Backend
- OpenAI tRPC + cluster context + UI
- Target: v129

### E5: Permissions Real Backend
- tRPC + DB enforcement + UI
- Target: v130

---

## 🎨 UI/UX Issues — Phase F (Visual Polish)
> Source: Vik visual review 2026-02-27
> Priority: Medium (non-blocking, but affects UX quality)

### F1: Dashboard Color & Contrast Fixes
- [ ] **UI-1: Color imbalance** — Cluster cards background too high-contrast against dark background. Use subtler, harmonious card background color.
- [ ] **UI-2: Environment badge colors** — "Production", "Staging/QA", "Dev/Minikube" tags are too bright/saturated against dark background. Tone down to muted semantic colors.
- [ ] **UI-3: Sidebar scroll missing** — "CLUSTERS" section at bottom of sidebar has no scroll indicator. Bottom nav items are inaccessible.
- [ ] **UI-4: Anomalies section typography** — "Critical" (orange-red), "Warning" (yellow), "Info" (teal-green) colored fonts clash with design system. Use muted semantic colors.
- [ ] **UI-5: "Error" text near-invisible on cluster cards** — "Error" label at bottom-right is nearly same luminance as card background in dark mode. Increase contrast.
- [ ] **UI-6: Running Pods "0/0" shown in green** — Green for 0/0 is semantically wrong (green = healthy, 0 pods = nothing). Use neutral/muted color.
- [ ] **UI-7: Mixed icon families in sidebar** — Outline icons mixed with emoji-style icons (⚠️, 🤖). Unify to same icon family/weight.

### F2: Clusters Page Cleanup
- [ ] **UI-8: Typography inconsistency in table** — "HEALTH"/"ACCESS" are uppercase, "Name"/"Provider" are title-case. Pick one convention.
- [ ] **UI-9: "Error" health badge too aggressive** — Solid red badge with white text is too alarming for connectivity errors. Use softer/muted red.
- [ ] **UI-10: Provider icons inconsistent quality** — MINIKUBE/KUBECONFIG show as generic circles vs proper AWS/GKE logos. Standardize icon quality.
- [ ] **UI-11: Duplicate search bars** — Two "Search clusters..." inputs on the same page. Remove one.

### F3: Light Mode Polish
- [ ] **UI-12: Low contrast throughout light mode** — Text barely readable, sidebar items have insufficient contrast against white background.
- [ ] **UI-13: Stat card icons inconsistent** — Total Nodes and Clusters both use server/grid icon (confusing). Running Pods uses green circle (misleading). Warning Events uses orange triangle even when count is 0.
- [ ] **UI-14: Cluster card borders near-invisible** — Very subtle borders make cards hard to distinguish from page background in light mode.
- [ ] **UI-15: Stat cards unequal width** — 4 stat cards don't divide equally across the row in light mode.

### F4: Cross-cutting Typography & Icons
- [ ] **UI-16: Sidebar section headers unreadable** — "AUTOSCALING", "ACCESS CONTROL", "CLUSTERS" labels too small and low contrast in both modes.
- [ ] **UI-17: "PLATFORM" text in header low contrast** — Very faint against dark header bar.

---

## Pipeline Gates (ALL stages)
- Code Review (Lior): 10/10
- E2E (Yuval): **0 failures** (non-negotiable — Vik mandate 2026-02-27)
- Desktop QA (Mai): ≥8.5/10
- VERSION CONTRACT: git tag → docker → helm → state.json (all must match)
