# Pipeline Evidence

Each agent writes its own evidence file. **No agent may write another agent's evidence.**

## Files
- `qa-{version}.json` — Written ONLY by agent:qa (מאי)
- `e2e-{version}.json` — Written ONLY by agent:e2e (יובל)
- `review-{version}.json` — Written ONLY by agent:code-reviewer (ליאור)

## Schema

### qa-{version}.json
```json
{
  "agent": "qa",
  "agentId": "agent:qa",
  "version": "v115",
  "timestamp": "ISO-8601",
  "score": 8.7,
  "verdict": "PASS",
  "gate": 8.5,
  "sha": "abc1234",
  "checks": ["list of items checked"],
  "failures": ["list of failures if any"],
  "screenshots": ["path/to/screenshot.png"]
}
```

### e2e-{version}.json
```json
{
  "agent": "e2e",
  "agentId": "agent:e2e",
  "version": "v115",
  "timestamp": "ISO-8601",
  "passed": 92,
  "failed": 2,
  "skipped": 4,
  "total": 98,
  "verdict": "PASS",
  "gate": 88,
  "sha": "abc1234",
  "failedTests": ["test name if any"]
}
```

### review-{version}.json
```json
{
  "agent": "code-reviewer",
  "agentId": "agent:code-reviewer",
  "version": "v115",
  "timestamp": "ISO-8601",
  "score": 10,
  "verdict": "APPROVED",
  "gate": 10,
  "sha": "abc1234",
  "commits": ["sha1", "sha2"],
  "findings": []
}
```

## Guardian Validation Rules
Guardian is the ONLY agent that can write `status: "complete"` to `pipeline-state.json`.

Guardian checks:
1. Evidence files exist for current version
2. Each evidence file's `sha` matches deployed sha
3. Each evidence file's `timestamp` is AFTER the deploy timestamp
4. Scores meet gates: QA ≥ 8.5, E2E ≥ 88, Review = 10/10
5. `agentId` in evidence matches expected agent (not Foreman)

If all 5 pass → Guardian writes COMPLETE. Otherwise → Guardian reports what's missing.
