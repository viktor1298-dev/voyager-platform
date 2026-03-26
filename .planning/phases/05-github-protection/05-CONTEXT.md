# Phase 5: GitHub Protection - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up GitHub branch protection rules on main and enable auto-delete of merged branches. Pure GitHub API operations via `gh` CLI. No code changes.

</domain>

<decisions>
## Implementation Decisions

### Branch Protection Rules
- **D-01:** Require pull requests before merging to main (no direct push)
- **D-02:** Prevent force push to main
- **D-03:** Prevent branch deletion of main
- **D-04:** Do NOT require PR reviews (solo developer — self-merge must work)
- **D-05:** Do NOT require status checks (no CI pipeline exists yet — out of scope per REQUIREMENTS.md)

### Auto-Delete
- **D-06:** Enable "Automatically delete head branches" on the repository — merged PR branches are cleaned up automatically

### Implementation Tool
- **D-07:** Use `gh` CLI for all GitHub API operations (authenticated via PAT in keyring per GitHub-private/CLAUDE.md)

### Claude's Discretion
- Exact `gh api` commands and payload structure
- Whether to use `gh api` or `gh repo edit` for settings
- Order of operations (protection rules first or auto-delete first)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Git safety constraints
- `.planning/REQUIREMENTS.md` — PROT-01, PROT-02 acceptance criteria

### GitHub Access
- No external specs — requirements fully captured in decisions above
- `gh` CLI is authenticated (see GitHub-private/CLAUDE.md: "Auth: gh CLI authenticated via PAT")

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gh` CLI already authenticated for this repo

### Established Patterns
- GitHub API for branch protection: `gh api repos/{owner}/{repo}/branches/main/protection`
- GitHub repo settings: `gh repo edit --delete-branch-on-merge`

### Integration Points
- Phase 5 completing = milestone v1.0 complete
- After protection, the project is stabilized and ready for new feature development

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard GitHub branch protection configuration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-github-protection*
*Context gathered: 2026-03-27*
