# SHARED-PIPELINE-LEARNINGS.md
> Shared learnings across all pipeline runs. Format: [LRN-XXX] | date | Agent/Area | category
> Updated by: backfill-learnings subagent | 2026-03-02

---

[LRN-001] | 2026-02-27 | Ron/Frontend | best_practice
Pattern: CSS `animationFillMode: 'both'` caused table row invisibility when multiple components share the same animation class (`animate-slide-up`). Fix in one component (DataTable.tsx) missed the same pattern in ResponsiveTable.tsx and page.tsx — QA caught it twice.
Fix: Always grep ALL components for the animation name before declaring fix done: `rg "animate-slide-up|animationFillMode" apps/web/src/`
[SKILL-PATCH: frontend-feature → Add "grep all components for animation pattern before committing animation fixes"]

---

[LRN-002] | 2026-02-27 | Ron/Frontend | best_practice
Pattern: Muted color contrast in dark mode was technically correct (different RGB) but visually indistinguishable. QA failed even though the CSS class was applied.
Fix: Dark mode muting requires BOTH a muted color class AND opacity reduction (opacity-50 or opacity-60). Color change alone is insufficient.

---

[LRN-003] | 2026-02-27 | Doc/Pipeline | best_practice
Pattern: Post-mortem analysis was happening ad-hoc after Phase F — no consistent framework, different agents analyzed different things, patterns were missed.
Fix: Created `pipeline-deep-research` skill with defined data sources, analysis framework, and output format. Use it for every post-mortem.
[SKILL-PATCH: pipeline-orchestrator → Add post-mortem step using pipeline-deep-research skill]

---

[LRN-004] | 2026-02-27 | Doc/Skills | best_practice
Pattern: Skills over 8000 bytes are too large for agents to read efficiently — pipeline-orchestrator was 43,858 bytes and caused slow context loads.
Fix: Split large skills into SKILL.md (≤4K) + references/ folder. Applied to pipeline-orchestrator: 91% size reduction (43K → 3.7K).
Target candidates: pipeline-investigator (12K), frontend-feature (10K), qa-visual (9.8K), slack-* (7-9K each).

---

[LRN-005] | 2026-03-01 | Foreman/Pipeline | architecture
Pattern: Foreman wrote `status:"complete"` after each phase and exited — pipeline kept stopping between phases requiring Morpheus to manually respawn.
Fix: Embedded IRON RULE directly in spawn task prompt: "Stop ONLY when BOARD has zero [ ] items." Added enforcement to AGENTS.md. Foreman now scans BOARD.md after every phase and self-continues.
[SKILL-PATCH: pipeline-orchestrator → Add IRON RULE: scan BOARD.md after every phase; exit only when zero [ ] items remain]

---

[LRN-006] | 2026-03-01 | Dima+Ron/Backend | architecture
Pattern: 6 tRPC procedures in metrics.ts returned fully mocked data using seededRandom() — clusterHealth, resourceUsage, requestRates, uptimeHistory, alertsTimeline. Frontend displayed these as real data, creating a false picture. Issue was not caught until BACKEND-RESEARCH-2026.md audit.
Fix (IP3/IP4): Replaced all mocks with real data — healthHistory table for uptime, K8s Metrics API snapshots in metricsHistory table, real alerts engine. Zero mocks in production as of v162.
[SKILL-PATCH: backend-feature → Add mandatory mock-audit step: `rg "seededRandom|MOCK_|hardcoded" apps/api/src/`]

---

[LRN-007] | 2026-03-01 | Dima/Backend | architecture
Pattern: k8s-watchers.ts used raw `k8s.Watch` without LIST+WATCH informer pattern — no initial cache population, no resourceVersion tracking, no 410 GONE handling. Events during reconnect gaps were permanently lost.
Fix (IP3): Replaced with `k8s.makeInformer()` per cluster — handles LIST resync, 410 GONE re-LIST, and per-event-type callbacks (add/update/delete). Implemented via ClusterWatchManager class.
[SKILL-PATCH: backend-feature → When implementing K8s watchers, always use makeInformer() not raw Watch]

---

[LRN-008] | 2026-03-01 | Dima/Backend | architecture
Pattern: k8s-watchers.ts called getKubeConfig() returning a single default kubeconfig — all streaming was single-cluster only. Multi-cluster dashboard showed stale data for all non-default clusters.
Fix (IP3): Created ClusterWatchManager with `Map<clusterId, InformerSet>`. All events tagged with clusterId. Subscription procedures accept `clusterId: z.string()` input. Watchers start/stop per cluster lifecycle.

---

[LRN-009] | 2026-03-01 | Dima/Backend | bug
Pattern: Health check in health.ts had provider guard: `const isMinikube = cluster.provider === 'minikube'` — only minikube clusters got real health checks. All other providers returned 'unknown'.
Fix (IP1): Generalized health check to run for ALL providers. Real K8s API connectivity test for every cluster type.

---

[LRN-010] | 2026-03-01 | Dima/Frontend | bug
Pattern: connectionConfig bug — frontend toCreateClusterInput() destructured only {name, provider, endpoint}, silently dropping connectionConfig. Clusters stored with empty connectionConfig: {}, always showing https://kubernetes.default.svc instead of real endpoint.
Fix (v157-v158): Pass connectionConfig through the full create flow + extract real server URL from kubeconfig YAML on the backend.
Note: Fix only helps NEW clusters — existing DB rows still need manual re-creation by Vik.

---

[LRN-011] | 2026-03-01 | Guardian/Pipeline | gotcha
Pattern: Guardian cron auto-disabled when pipeline reached status="complete" — causing Guardian to vanish and leaving pipelines unmonitored on restart.
Fix: Removed auto-disable logic. Guardian IRON RULE: never auto-disable. Re-enable explicitly at start of each new pipeline via cron update.
[SKILL-PATCH: guardian-verification → NEVER auto-disable on pipeline complete. Only Morpheus or Vik disables Guardian explicitly.]

---

[LRN-012] | 2026-03-01 | All Agents | gotcha
Pattern: Agents running on GPT-Codex (gpt-5.3-codex) model do NOT reliably execute multi-step protocols — they describe actions like "I will write to .learnings/" without actually calling the write tool. This caused .learnings/ and SHARED-PIPELINE-LEARNINGS.md to fall behind for an entire pipeline run (IP3/IP4/Phase E).
Fix: Prefer Claude Sonnet/Opus for any agent that needs reliable multi-step protocol adherence (self-improvement, memory writes, git commits). GPT-Codex = coding tasks only.
[SKILL-PATCH: agent-factory → Document model selection: Claude Sonnet/Opus for protocol-heavy tasks; GPT-Codex for pure coding]

---

[LRN-013] | 2026-03-01 | Pipeline/Research | best_practice
Pattern: Parallel investigator pattern used effectively — 3 Opus 4.6 subagents spawned in parallel, each writing to /tmp/research/NN-topic.md, then synthesizer Opus merged results into master document (BACKEND-RESEARCH-2026.md, ~29KB, 4-phase plan).
Fix: This is a proven pattern for deep research. Use it: spawn N investigators → each writes to isolated /tmp/research/ file → spawn synthesizer to merge.
[SKILL-PATCH: pipeline-investigator → Document the parallel+synthesizer pattern as canonical approach]

---

[LRN-014] | 2026-03-01 | DB/DevOps | gotcha
Pattern: `node -e "require('pg')"` fails inside API pod — pg module not in container PATH. Attempting DB queries via the API pod with node fails silently.
Fix: Use postgres pod directly: `kubectl exec -n voyager deploy/postgres -- psql -U voyager -d voyager -c "SELECT ..."`
[SKILL-PATCH: build-deploy → Add DB access cheatsheet: always use postgres pod for direct queries, not API pod]

---

[LRN-015] | 2026-03-01 | Phase E/Pipeline | best_practice
Pattern: Phase E (E2-E5: Webhooks, AI Assistant, Permissions, Alerts) appeared to be unimplemented but all features were already in the codebase — BOARD.md items were stale and not reflecting actual code state.
Fix: Before spawning dev agents for a phase, audit codebase first: `rg "webhook|ai-assistant|rbac|alerts" apps/api/src/routers/` — saves unnecessary dev cycles.
[SKILL-PATCH: pipeline-orchestrator → Add Phase preflight: audit existing code before spawning dev agents for "missing" features]

---

## Pipeline Run Summary — IP3/IP4/Phase-E (2026-02-28 to 2026-03-01)
- **Final version:** v162 | **Status:** complete
- **E2E:** 85/96 pass, 0 failures, 11 skipped
- **QA score:** 9.5/10 | **Review score:** 10/10
- **Key deliverables:** ClusterWatchManager (Informer pattern), real K8s metrics, health check for all providers, connectionConfig fix, alert engine, Services/Namespaces routers, multi-cluster aggregation, Webhooks, AI Assistant (GPT-4o streaming), RBAC permissions
- **Total phases:** I0→IP4 + E2-E5 + all review/deploy/E2E/QA cycles
