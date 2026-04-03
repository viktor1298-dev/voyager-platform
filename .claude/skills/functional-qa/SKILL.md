---
name: functional-qa
description: >
  Functional QA testing protocol for voyager-platform. Use this skill whenever you need to verify
  that a feature works, test a fix, run QA on a page, validate live data, or check any UI behavior.
  Also use BEFORE claiming any fix is complete — never say "PASS" or "working" without running this
  protocol first. Triggers on: "test this", "verify", "QA", "check if it works", "run tests",
  "is it working", "full test", "live test", any post-fix verification, any /qa-validate invocation.
  This skill exists because surface-level testing (screenshots, page renders, backend curl) repeatedly
  missed real bugs that the user found manually. It enforces interactive browser testing with data
  comparison against kubectl as the source of truth.
---

# Functional QA Protocol

This is a **rigid** protocol. Follow every step exactly. Do not skip steps. Do not substitute
backend tests for frontend tests. Do not claim PASS based on snapshots alone.

## Why This Exists

This protocol was created because QA testing repeatedly failed in these specific ways:

1. **Snapshot-only testing**: Taking a page snapshot, seeing text rendered, saying "PASS" — without
   ever clicking anything. Pages that render but crash on interaction passed QA this way.

2. **Backend-only validation**: Running `curl` against the API, seeing data in the response, claiming
   "live data works" — while the browser UI showed stale/broken data. The backend working does NOT
   mean the frontend works.

3. **No data comparison**: Saying "5 nodes showing" without checking if kubectl also shows 5 nodes,
   or if the displayed data (CPU, memory, status) matches reality.

4. **No interaction testing**: Never clicking expandable rows, never opening tabs within expanded
   items, never triggering actions. Bugs in expand/collapse, tab rendering, and action handlers
   went undetected.

5. **Ignoring user reports**: When the user said "it's not working", responding with backend evidence
   that it IS working — instead of actually checking the frontend.

## Pre-Flight Checklist

Before starting ANY QA test:

```
[ ] K8S_ENABLED=true in .env (required for live data testing)
[ ] API server running and healthy (curl http://localhost:4001/health)
[ ] Web server running (curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
[ ] Browser cleared (navigate to a fresh page, not cached)
[ ] kubectl working (KUBECONFIG=~/.kube/kubeconfig kubectl get nodes)
```

## Browser Recovery

If ANY Playwright MCP tool returns **"Browser is already in use"**:

1. Wait 5 seconds (the previous operation may complete)
2. Call `browser_close` to release the lock
3. Wait 2 seconds
4. Resume from your last `browser_navigate` call

**Do NOT:**
- Call `browser_navigate` while the lock is held (it also needs the lock)
- Kill the Playwright MCP process (permanently severs stdio pipe for the session)
- Skip QA steps because the browser is stuck — follow the recovery protocol

If `browser_close` also fails, inform the user and suggest `/mcp` restart.

## The Four Laws

1. **Every test requires a user action.** Navigate to a page, click something, verify the result.
   A page that loads is NOT tested. A page where you clicked an item and saw the expanded content
   IS tested.

2. **Every data point requires a source-of-truth comparison.** If the UI shows "5 nodes", run
   `kubectl get nodes` and verify the count matches. If the UI shows "Running", verify with kubectl.
   At least 3 data points per page must be cross-referenced.

3. **Every claim of "working" requires evidence of change.** For live data: delete a resource,
   verify the UI updates. For actions: click a button, verify the result. "It renders" is not
   evidence of "it works".

4. **Every entity on the page must be checked.** If a page shows 4 clusters, ALL 4 must be
   validated — not just 1. Checking 1 healthy item and ignoring 3 broken ones is the worst
   kind of false PASS. Extract data for EVERY row/card on the page and report ALL of them.
   A single unchecked item can hide the exact bug you were supposed to find.

## Fix Validation Protocol

When QA is run to validate a FIX (not general QA), follow this additional protocol BEFORE
the standard test protocol:

1. **Identify what was broken.** Re-read the user's original bug report. List every specific
   symptom they described (e.g., "clusters show unreachable", "no nodes", "no version").

2. **Test the broken scenarios FIRST.** Navigate to the EXACT pages/items that were failing.
   Do NOT start with a working item. If the user said "every new cluster shows Unknown",
   test ALL new clusters, not just one.

3. **Test ALL affected entities, not a sample.** If the bug affected 4 clusters, test all 4.
   If 3 were broken and 1 was working, you MUST verify that all 3 previously-broken ones
   are now fixed AND the 1 working one didn't regress.

4. **Report per-entity results.** The report MUST include a row for EACH entity showing its
   before/after state. Never aggregate ("most clusters work") — list each one by name.

5. **Declare FAIL if ANY entity still shows the original bug.** A fix that works for 1 out
   of 4 items is not a fix. It's a partial fix at best, and the verdict is FAIL.

## Multi-Entity Page Protocol (Clusters, Nodes, Deployments, etc.)

When a page shows a LIST of entities (cluster cards, node rows, pod rows), you MUST:

1. **Extract ALL entities from the page.** Use `browser_evaluate` to get data for EVERY
   row/card, not just the first one. Return an array of all items with their key fields.

2. **Report ALL entities in a table.** The QA report must include a row for each entity:
   ```
   | Entity Name | Health | Nodes | Version | Status | Issues |
   |-------------|--------|-------|---------|--------|--------|
   | cluster-1   | Healthy| 3     | v1.29   | OK     | —      |
   | cluster-2   | Unknown| 0     | —       | FAIL   | No nodes, no version |
   | cluster-3   | Unknown| 0     | —       | FAIL   | No nodes, no version |
   ```

3. **Cross-reference EACH entity with its source of truth.** For clusters: try connecting
   to each cluster via kubectl/API and compare. For pods: compare each pod's status with
   kubectl output.

4. **Flag partial fixes.** If some entities pass and others don't, the verdict is FAIL with
   a clear list of what still needs fixing. Never report "PASS" when ANY entity fails.

5. **Click into EACH entity that shows problems.** If a cluster shows "0 nodes" or "Unknown",
   navigate to that cluster's detail page to see if the issue persists there too.

## Test Protocol Per Page/Tab

For EACH page or tab being tested, execute ALL of these steps IN ORDER:

### Step 1: Navigate and Verify Load

```
Action:  browser_navigate to the page URL
Check:   Page title is correct (not "Loading..." or "Voyager Platform" generic)
Check:   Main content area has data (not empty, not spinner-only)
Check:   Console has 0 errors (browser_console_messages level=error)
Fail if: Any check fails
```

### Step 2: Compare Data with kubectl

```
Action:  Run kubectl command for this resource type
Action:  Count items in the UI (use browser_evaluate to count DOM elements)
Check:   UI count matches kubectl count (exact match required)
Check:   Pick 3 specific items and verify their key fields match kubectl output:
         - For pods: name, status (Running/Pending), ready count (1/1), namespace
         - For deployments: name, replicas (ready/desired), namespace
         - For services: name, type (ClusterIP/LoadBalancer), ports
         - For nodes: name, status (Ready/NotReady), role, kubelet version
         - For other resources: name + 2 relevant fields
Fail if: Any count mismatch or data mismatch
```

### Step 3: Click and Interact

```
Action:  Click the FIRST item in the list to expand it
Check:   Expanded content appears (new DOM elements visible)
Check:   Console has 0 NEW errors after the click
Check:   Expanded content shows meaningful data (not empty, not "undefined", not "null")
Action:  If the expanded item has tabs (Pods, YAML, Labels, etc.), click EACH tab
Check:   Each tab renders content without errors
Fail if: Any crash, error, or empty content on expand/tab switch
```

### Step 4: Verify Specific Content

```
Action:  In the expanded item, read specific field values
Check:   Values are not "0", "null", "undefined", or empty when they shouldn't be
         - Node Resources tab: CPU/Memory usage should show real values if metrics-server is available
         - Service Selectors tab: should show label key-value pairs
         - Deployment Conditions tab: should show condition types and statuses
         - Secret Data tab: should show key names and values (not just ***)
Check:   YAML tab (if present): should show clean YAML without managedFields noise
Fail if: Any field shows obviously wrong data
```

### Step 5: Console Error Final Check

```
Action:  browser_console_messages level=error
Check:   0 errors total across all interactions on this page
Fail if: Any errors present — report the EXACT error message and source location
```

## Live Data Test Protocol

This is the critical test that has been repeatedly skipped. Execute it EXACTLY:

### Step 1: Establish Baseline

```
Action:  Navigate to the pods page
Action:  Use browser_evaluate to count pods and get the name of a specific pod
Action:  Run kubectl get pods -A --no-headers | wc -l to get kubectl pod count
Check:   UI pod count matches kubectl pod count
Record:  Current pod count and target pod name for deletion
```

### Step 2: Trigger a Change

```
Action:  Run kubectl delete pod <pod-name> -n <namespace> --wait=false
Record:  Exact timestamp of delete command
```

### Step 3: Take 4 Sequential Screenshots (DO NOT REFRESH)

**Why 4 screenshots:** A single snapshot only proves "the first event arrived." The real bug is
data that updates ONCE then freezes — the pod shows "3s ago" forever instead of progressing to
"6s", "9s", "12s". Four screenshots at 3-second intervals prove CONTINUOUS live data, not just
a one-time update. This is the #1 reason QA has historically given false PASSes.

```
Action:  Wait 3 seconds
Action:  SCREENSHOT 1 (at T+3s): browser_snapshot → save to file
Record:  For the deleted/replacement pod, capture: name, status, age, ready count

Action:  Wait 3 seconds
Action:  SCREENSHOT 2 (at T+6s): browser_snapshot → save to file
Record:  Same pod — capture: name, status, age, ready count

Action:  Wait 3 seconds
Action:  SCREENSHOT 3 (at T+9s): browser_snapshot → save to file
Record:  Same pod — capture: name, status, age, ready count

Action:  Wait 3 seconds
Action:  SCREENSHOT 4 (at T+12s): browser_snapshot → save to file
Record:  Same pod — capture: name, status, age, ready count
```

### Step 4: Verify Progressive Change Across Screenshots

```
Check:   Compare the 4 snapshots for the SAME pod. At least ONE of these must show
         PROGRESSIVE change (not just the same value repeated 4 times):

         - Age field progresses: "3s" → "6s" → "9s" → "12s" (or similar increasing values)
         - Status transitions: "Terminating" → gone, or "Pending" → "ContainerCreating" → "Running"
         - Ready count changes: "0/1" → "1/1"
         - Pod count changes across snapshots (old pod disappears, new pod appears)

         A SINGLE changed value repeated identically across all 4 screenshots = FROZEN DATA = FAIL.
         Example of FAIL: all 4 show "4s ago" — data arrived once and stopped updating.
         Example of PASS: "3s ago" → "6s ago" → "9s ago" → "12s ago" — continuous live updates.

Fail if: All 4 snapshots show identical data for the target pod (no progression)
Fail if: Pod status/age doesn't change across ANY of the 4 snapshots
```

### Step 5: Cross-Reference with kubectl

```
Action:  Run kubectl get pods -n <namespace> to see the current state
Action:  Compare kubectl output with SCREENSHOT 4 (the latest)
Check:   UI reflects the actual cluster state at T+12s
Fail if: UI still shows the pre-delete state
```

### Step 6: Document the Timeline Table

```
Report in this EXACT format:

| Screenshot | Time | Pod Name | Status | Ready | Age | Changed? |
|-----------|------|----------|--------|-------|-----|----------|
| Baseline  | T+0s | old-pod-hash | Running | 1/1 | 5m | — |
| Shot 1    | T+3s | new-pod-hash | Running | 0/1 | 3s | YES: new pod |
| Shot 2    | T+6s | new-pod-hash | Running | 0/1 | 6s | YES: age +3s |
| Shot 3    | T+9s | new-pod-hash | Running | 1/1 | 9s | YES: age +3s, ready |
| Shot 4    | T+12s | new-pod-hash | Running | 1/1 | 12s | YES: age +3s |

kubectl at T+12s: [what kubectl shows]

Verdict: PASS (4/4 screenshots show progressive data updates)
   — OR —
Verdict: FAIL (screenshots N and M show identical data — live updates stopped after Xs)
```

## Resource-Specific kubectl Commands

Use these exact commands for source-of-truth comparison:

```bash
# Pods
KUBECONFIG=~/.kube/kubeconfig kubectl get pods -A --no-headers | wc -l
KUBECONFIG=~/.kube/kubeconfig kubectl get pods -A --no-headers | head -5

# Nodes
KUBECONFIG=~/.kube/kubeconfig kubectl get nodes --no-headers
KUBECONFIG=~/.kube/kubeconfig kubectl top nodes  # for metrics

# Deployments
KUBECONFIG=~/.kube/kubeconfig kubectl get deployments -A --no-headers | wc -l

# Services
KUBECONFIG=~/.kube/kubeconfig kubectl get services -A --no-headers | wc -l

# Events
KUBECONFIG=~/.kube/kubeconfig kubectl get events -A --no-headers | wc -l

# Secrets
KUBECONFIG=~/.kube/kubeconfig kubectl get secrets -n <ns> <name> -o yaml

# Any resource
KUBECONFIG=~/.kube/kubeconfig kubectl get <resource> -A --no-headers | wc -l
```

## Report Format

After testing, produce this EXACT report format. Do not summarize. Do not abbreviate.

```
## QA Report: [Page/Feature Name]

### Pre-Flight
- K8S_ENABLED: [true/false]
- API Health: [ok/error]
- Web Status: [200/error]
- kubectl: [working/error]

### Data Comparison
| Field | kubectl | UI | Match |
|-------|---------|-----|-------|
| [resource] count | [N] | [N] | [Y/N] |
| [item1] status | [value] | [value] | [Y/N] |
| [item2] field | [value] | [value] | [Y/N] |
| [item3] field | [value] | [value] | [Y/N] |

### Interaction Tests
| Action | Result | Console Errors |
|--------|--------|---------------|
| Click [item] to expand | [rendered/crashed] | [0/N errors] |
| Click [tab1] | [rendered/crashed] | [0/N errors] |
| Click [tab2] | [rendered/crashed] | [0/N errors] |

### Live Data Test (if applicable — MUST use 4-screenshot protocol)
| Screenshot | Time | Pod Name | Status | Ready | Age | Changed? |
|-----------|------|----------|--------|-------|-----|----------|
| Baseline  | T+0s | [old-pod] | [status] | [ready] | [age] | — |
| Shot 1    | T+3s | [pod] | [status] | [ready] | [age] | [YES/NO + what] |
| Shot 2    | T+6s | [pod] | [status] | [ready] | [age] | [YES/NO + what] |
| Shot 3    | T+9s | [pod] | [status] | [ready] | [age] | [YES/NO + what] |
| Shot 4    | T+12s | [pod] | [status] | [ready] | [age] | [YES/NO + what] |
kubectl at T+12s: [current state]
Verdict: PASS (progressive) / FAIL (frozen after shot N)

### Verdict: [PASS / FAIL]
- If FAIL: [exact error messages and what's broken]
```

## Anti-Patterns (What NOT to Do)

These are the exact mistakes that led to this skill being created. If you catch yourself
doing any of these, STOP and redo the test properly.

| Anti-Pattern | Why It's Wrong | What To Do Instead |
|-------------|---------------|-------------------|
| "Page loads, PASS" | Loading is not functionality | Click something, verify the result |
| "curl shows data, SSE works" | Backend != Frontend | Check the browser UI, not the API |
| "5 nodes showing" (no kubectl comparison) | Could be stale/wrong data | Run kubectl, compare counts and values |
| "Zero console errors" (only checked on load) | Errors appear on interaction | Check console AFTER every click |
| "Working by design" | Dismisses the user's bug report | Investigate the actual rendered output first |
| "PASS — Shows CPU/Memory columns" | Columns exist but values are 0 | Check if the VALUES are correct, not just the labels |
| Running tests with K8S_ENABLED=false | No live data to test | Always set K8S_ENABLED=true for QA |
| Screenshot of page list, no expand test | Expand is where bugs hide | Click items, click their tabs |
| "24 events in 15 seconds via curl" | Proves backend, not frontend | Watch the browser DOM update in real-time |
| Batch-testing tabs via HTTP status codes | 200 status != working page | Navigate in browser, interact, verify content |
| ONE screenshot after pod delete = "live data works" | Data may update once then freeze. Pod shows "3s ago" forever. | Take 4 screenshots at 3s intervals. Check age PROGRESSES across all 4. |
| "New pod appeared in UI" (single check) | Replacement pod appearing proves one SSE event arrived — NOT that streaming is continuous | 4-screenshot protocol: verify age field changes across ALL snapshots |
| "Browser is stuck, skipping browser tests" | Skips the most important QA tests | Follow browser recovery protocol (close + retry) |
| Killing Playwright MCP process | Permanently breaks MCP for the entire session | Use browser_close, never pkill/kill the process |
| Using `networkidle` in browser_run_code | SSE keeps connections open — 30s timeout every time | Use browser_snapshot (implicit wait) or waitForSelector |
| Testing 1 entity out of N and declaring PASS | 3 broken items were ignored. 1/4 passing ≠ PASS | Extract and report ALL entities on the page. FAIL if ANY has issues |
| "0 nodes is expected — watches haven't started" | Rationalized away the exact bug the user reported | If the user said "no nodes showing", 0 nodes = FAIL, full stop |
| Checking only the healthy cluster | Cherry-picked the one success, ignored all failures | Test broken items FIRST, healthy items second |
| "Genuinely unreachable" without verifying | Assumed a cluster was unreachable without testing it | Actually connect to it (kubectl/API) before classifying it |
| Declaring PASS when the user's original symptoms persist | The fix was supposed to fix ALL clusters, not just one | Re-read the bug report. Test every symptom they listed |
