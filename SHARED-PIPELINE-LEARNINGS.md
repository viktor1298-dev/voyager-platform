# Shared Pipeline Learnings

All agents read this file at session start. Write learnings here that affect the whole team.

## Format
`[LRN-ID] | Date | Agent | Category | Learning`
Tag skill changes with: `[SKILL-PATCH: skill-name → description]`

---

## 2026-02-27 — Phase F Learnings

[LRN-001] | 2026-02-27 | Ron | animation-bug
Pattern: `animationFillMode: 'both'` on staggered rows = invisible rows
Fix: Remove `animationFillMode`. Grep ALL components before declaring fix done.
[SKILL-PATCH: frontend-feature → add grep-all rule ✅ Applied]

[LRN-002] | 2026-02-27 | Foreman | orchestration
Pattern: Foreman spawn-and-exit → pipeline stalls
Fix: Foreman must stay alive with cleanup:'keep' workers
[SKILL-PATCH: pipeline-orchestrator → stay-alive rule ✅ Applied]

[LRN-003] | 2026-02-27 | Guardian | healing
Pattern: Guardian reports stall but doesn't heal
Fix: Guardian needs steer + respawn capability
[SKILL-PATCH: guardian-verification → add escalation ladder ✅ Applied]

[LRN-004] | 2026-02-27 | Mai | browser
Pattern: Tabs not closed after QA
Fix: Close all tabs as last browser action ✅ Fixed
[SKILL-PATCH: qa-visual → add tab-close rule ✅ Applied]

[LRN-005] | 2026-02-27 | Ron | semantic-colors
Pattern: Green for zero values = misleading
Fix: Use muted/neutral for 0, 0/0, — values
