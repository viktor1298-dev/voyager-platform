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

## The Three Laws

1. **Every test requires a user action.** Navigate to a page, click something, verify the result.
   A page that loads is NOT tested. A page where you clicked an item and saw the expanded content
   IS tested.

2. **Every data point requires a source-of-truth comparison.** If the UI shows "5 nodes", run
   `kubectl get nodes` and verify the count matches. If the UI shows "Running", verify with kubectl.
   At least 3 data points per page must be cross-referenced.

3. **Every claim of "working" requires evidence of change.** For live data: delete a resource,
   verify the UI updates. For actions: click a button, verify the result. "It renders" is not
   evidence of "it works".

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

### Step 3: Watch for UI Update (DO NOT REFRESH)

```
Action:  Wait 3 seconds (browser_wait_for time=3)
Action:  Take a NEW snapshot (browser_snapshot)
Check:   Look for ONE of these changes in the snapshot:
         - New pod name appeared (replacement pod with different hash)
         - Pod status changed to "Terminating" or "Pending"
         - Pod count changed
         - Old pod disappeared from the list
Action:  If no change after 3s, wait 5 more seconds and check again
Action:  If no change after 8s total, this is a FAILURE
```

### Step 4: Verify the Change is Real

```
Action:  Run kubectl get pods -n <namespace> to see the current state
Action:  Compare kubectl output with what the UI shows
Check:   UI reflects the actual cluster state (new pod showing, old pod gone or terminating)
Fail if: UI still shows the pre-delete state after 8 seconds
```

### Step 5: Document the Timeline

```
Report:  "Delete sent at HH:MM:SS"
Report:  "UI updated at HH:MM:SS (after Xs)"
Report:  "Change observed: [what changed in the UI]"
Report:  "kubectl confirms: [what kubectl shows]"
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

### Live Data Test (if applicable)
- Delete command: [kubectl delete pod X at HH:MM:SS]
- UI update observed: [yes at HH:MM:SS / no after 8s]
- Change: [what changed]
- kubectl confirms: [current state]

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
