# Pipeline Intelligence — Living Document
Last updated: 2026-02-27

## 🔄 How Intelligence Grows

This file is automatically updated by:
1. **Each agent** — writes to their workspace `.learnings/` files
2. **Foreman** — after each pipeline, promotes critical learnings here
3. **Guardian** — watches for patterns across all agents

### Cross-Agent Learning Flow:
Agent discovers pattern → logs to `.learnings/LEARNINGS.md` →
Foreman/Guardian reads → promotes to `PIPELINE-INTELLIGENCE.md` →
All future agents benefit

### Shared Learnings:
All agents also read `~/.openclaw/workspace/.learnings/SHARED-PIPELINE-LEARNINGS.md` for cross-team critical patterns.

## Known Failure Patterns & Auto-Fixes

### Pattern: E2E login failure
- Symptom: `logout button not found` in helpers.ts:28
- Root cause options:
  1. Wrong BASE_URL → Fix: `BASE_URL=http://voyager-platform.voyagerlabs.co`
  2. App not responding → Fix: check pods, restart if needed
  3. Auth service down → Fix: check API logs
- Auto-fix: Test BASE_URL first, then check pods

### Pattern: Fresh cluster — empty DB
- Symptom: Helm revision=1 (not upgrade)
- Prevention: Uri MUST run seed after fresh install
- Detection: `SELECT count(*) FROM users` = 0

### Pattern: Foreman spawn-and-exit
- Symptom: Foreman dies after 1-2 min, wrote "Waiting for X results"
- Fix: Always use exec sleep after every spawn
- Code: `exec("sleep 300", { yieldMs: 360000 })`

### Pattern: pnpm install fails in worktree
- Symptom: node_modules empty after merge
- Fix: `pnpm install --frozen-lockfile` from repo root, not worktree

### Pattern: Trial-and-Error E2E Fixes (FIX LOOP)
- Symptom: Same test fails 3+ versions, different error each time
- Root cause: No local testing, no root cause analysis
- Prevention: Run failing test locally FIRST. Write hypothesis BEFORE touching code.
- Escalation: After 3 versions → HALT, escalate to Morpheus

### Pattern: Gate Change Mid-Sprint
- Symptom: Pipeline suddenly has new failures after gate was tightened
- Root cause: Gate thresholds changed during active development
- Prevention: Gate changes ONLY between phases, ONLY with Vik approval
- Detection: Compare pipeline-state.json gateThresholds across versions

### Pattern: Opus Waste on Structured Tasks
- Symptom: High token cost for routine tasks (deploy, E2E, QA)
- Root cause: Foreman/Mai spawned on Opus when Sonnet suffices
- Fix: Use `model: "anthropic/claude-sonnet-4-6"` for E2E, deploy, QA, and simple dev tasks
- Savings: ~$2.73 per pipeline run

### Pattern: Agent Drift from Documented Patterns
- Symptom: Agents make decisions not aligned with skill docs
- Root cause: SKILL.md not read at session start
- Fix: Every spawn template includes mandatory SKILL.md read as first action
- Verification: v142+ pipelines should show 100% compliance

### Pattern: Skills Not Read
- Symptom: Agent makes mistakes documented in its SKILL.md
- Root cause: Agent skips skill reading, operates on memory only
- Prevention: Every spawn template must include "FIRST ACTION: read SKILL.md at [path]"
- Verification: Foreman checks agent session for "read" tool call to skill file

### Pattern: E2E Yuval Flying Blind
- Symptom: E2E runs full suite with no context, reports numbers only
- Root cause: Task template doesn't include changed features, previous failures
- Prevention: Always include git log -5, previous failures, which files to watch
- Enhancement: Yuval is authorized to flag broken tests — Foreman MUST act on flags

## Pipeline Metrics (last 5 runs)
| Run | Version | Total Time | Failures | Fixed Auto | Notes |
|-----|---------|------------|----------|-----------|-------|
| Phase D | v110 | ~3h | BASE_URL wrong, migration missing, Foreman spawn-exit, Gateway restart by QA | 4/4 auto | First Phase D run — many new patterns logged |
| Phase E2 | v141 | ~80 min | 3 E2E failures (all fixed) | 3/3 auto | Alerts backend. 11 spawns, all Sonnet. Token waste investigation run. |

## 🔍 Pipeline Investigation — v141 (2026-02-27)

### Token Waste Analysis
- **Total cost:** $4.67 — **58% was overhead** ($2.73 wasted)
- **Root cause #1:** Foreman + Mai running on Opus instead of Sonnet → $2.73 in model overhead
- **Root cause #2:** SKILL.md compliance: **0 out of 5 agents** read their SKILL.md (0% compliance)
- **Root cause #3:** Agents operated on memory/habits instead of reading documented patterns

### Skill Compliance Audit Results
| Agent | SKILL.md Read? | Quality | Notes |
|-------|---------------|---------|-------|
| Dima | ❌ No | Good | Habits carried from training, not docs |
| Ron | ❌ No | Good | Same — memory-driven |
| Yuval | ❌ No | Good | Ran E2E by instinct |
| Mai | ❌ No | Good | QA done from memory |
| Foreman | ❌ No | Good | Orchestration on auto-pilot |

- **Score:** 0/5 agents compliant (0%)
- **Quality score:** Still 9.5/10 (agents have strong habits)
- **Risk:** Without skill reading, new patterns/rules don't propagate to agents
- **Long-term risk:** Agent drift — each run diverges further from documented best practices

### Fixes Applied (same day — 2026-02-27)
- ✅ All agent SOUL.md files updated with mandatory SKILL.md read instruction
- ✅ `pipeline-orchestrator` skill updated: every spawn template now starts with SKILL.md read
- ✅ `agent-factory` skill updated: new agents created with compliance built-in
- ✅ Self-improvement protocol added as mandatory last step for all agents
- ✅ v142 pipeline is the first test of these compliance fixes

## ✅ Pipeline Gate Thresholds (updated 2026-02-24)
| Gate | Threshold | Hard? | Notes |
|------|-----------|-------|-------|
| Code Review (Lior) | 10/10 | ✅ Yes | No merge without 10/10 |
| E2E (Yuval) | 0 failures (absolute — Vik mandate 2026-02-27) | ✅ Yes | Zero tolerance — no skips, no partial passes |
| Desktop QA (Mai) | 8.5+/10 | ✅ Yes | 1920×1080, Playwright fallback |
| Mobile QA (Noa) | **REMOVED** | — | K8s ops tool = desktop-primary. Re-add if needed. |

## Stage Timing Benchmarks
| Stage | Expected | Alert If > |
|-------|----------|-----------|
| DB migrations | <30s | 2min |
| Backend dev (Wave 1) | <5min | 15min |
| Frontend dev | <5min | 15min |
| Code review | <3min | 10min |
| Git merge | <2min | 5min |
| Docker build | <5min | 15min |
| Helm deploy | <2min | 5min |
| E2E suite | <10min | 25min |
| QA desktop | <5min | 15min |

## Pre-flight Checklist Per Stage
### Before Dev agents:
- [ ] Git branch clean, no conflicts
- [ ] All worktrees accessible

### Before Deploy:
- [ ] Docker daemon running
- [ ] Minikube running (`minikube status`)
- [ ] Image registry accessible

### Before E2E:
- [ ] BASE_URL responds (curl -I → 200)
- [ ] Login works (smoke test)
- [ ] All pods Running (0 restarts)

## Pipeline Efficiency Benchmarks (updated 2026-02-27)

### Target Metrics (post-improvements)
| Metric | Current (audit) | Target |
|--------|----------------|--------|
| E2E fix iterations | 6 avg | ≤2 |
| Skill compliance rate | 43% | 100% |
| Loop detection threshold | None | 3 failures → HALT |
| Local test validation | 0% | 100% of dev fixes |
| Feature dev time | 35 min | 30 min (maintain) |
| E2E fix time | 2.5 hrs | 30 min |
| Pipeline efficiency | 5.5/10 | 8/10 |

### Improvements Applied (2026-02-27)
- ✅ Loop detection added to Foreman (3 failures → HALT + escalate)
- ✅ Skill reading enforced in all spawn templates
- ✅ E2E tasks now include change context + previous failures
- ✅ Yuval empowered to flag broken tests
- ✅ Dev tasks mandate local E2E validation before push
- ✅ Environment-blocked policy defined
- ✅ Gate change policy (between phases only)
- ✅ Test coverage checks added to Lior's review
