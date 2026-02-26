# BOARD.md — Phase E (v124+)

**Status:** READY
**Phase:** E — Alerts, AI Assistant, Webhooks, Pod Actions, Permissions
**Base version:** v123 (deployed, QA 9.5/10 ✅)

> ⚠️ PIPELINE RULE: Do NOT advance to next stage until E2E + QA pass for current stage.
> Each stage = separate version bump. Gate thresholds: E2E ≥88/107 | QA ≥8.5/10 | Review 10/10.

---

## 📋 STAGE ORDER (sequential — do not parallelize across stages)

### STAGE E1: K8s RBAC + Pod Actions (v124)
**Priority: CRITICAL — blocks all action features**

#### E1-A: Fix ClusterRole — add write permissions
**File:** Helm chart or `k8s/rbac.yaml`
**Problem:** `voyager-api-reader` ClusterRole only has `get/list/watch`. Scale and pod-delete are blocked at K8s level.
**Fix:** Create/update ClusterRole to add:
```yaml
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "replicasets"]
  verbs: ["get", "list", "watch", "patch", "update"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch", "delete"]
- apiGroups: [""]
  resources: ["pods/log"]
  verbs: ["get"]
```
Apply via: `kubectl apply -f k8s/rbac.yaml` (Uri handles this in deploy step)

#### E1-B: Delete Pod tRPC endpoint
**File:** `apps/api/src/routers/deployments.ts` (or new `pods.ts`)
**Add procedure:** `pods.delete`
- Input: `{ clusterId, namespace, podName }`
- Action: `k8sApi.deleteNamespacedPod(podName, namespace)`
- Audit log: `pod.delete` action
- Output: `{ success: boolean, podName: string }`

#### E1-C: Scale Deployment UI
**File:** `apps/web/src/app/deployments/page.tsx` (check existing)
**Problem:** Scale tRPC endpoint exists (`deployments.scale`) but may not be wired to UI.
**Fix:** Add "Scale" button to deployments table → opens dialog with replica count input → calls `deployments.scale` mutation.
- Only visible to admins (`useIsAdmin()`)
- Show current replicas, allow 0-20
- Confirm dialog before scaling to 0

#### E1-D: Delete Pod UI
**File:** `apps/web/src/app/clusters/[id]/page.tsx` or new pods view
**Fix:** Add "Delete Pod" button to live pods list → confirm dialog → calls `pods.delete` mutation → invalidates live query.
- Only visible to admins
- Confirm dialog: "This will delete pod [name]. K8s will restart it automatically."
- Show success/error toast

**Acceptance:** Admin can scale a deployment and delete a pod through the UI. Non-admins cannot see these buttons.

---

### STAGE E2: Alerts Real Backend (v125)
**Priority: HIGH**

#### E2-A: Alerts tRPC Router
**File:** `apps/api/src/routers/alerts.ts` (create or complete)
- `alerts.list` — list all alert rules for a cluster
- `alerts.create` — create alert rule (metric, operator, threshold, webhookUrl)
- `alerts.delete` — delete alert rule
- `alerts.evaluate` — run evaluation against live cluster data (can be called by background job)

#### E2-B: Alerts DB Schema
**File:** `packages/db/src/schema/alerts.ts`
```
alerts table:
  id, clusterId, name, metric (cpu|memory|pods|restarts),
  operator (gt|lt|eq), threshold (float), webhookUrl (nullable),
  enabled, createdAt, updatedAt
```

#### E2-C: Alert Evaluator Background Job
**File:** `apps/api/src/jobs/alert-evaluator.ts`
- Runs every 5 minutes (alongside health-sync)
- For each enabled alert: fetch live metric from cluster → compare → if triggered → POST to webhookUrl (if set) → log to audit
- Update alert `lastTriggeredAt`, `lastValue`

#### E2-D: Wire UI to real tRPC
**File:** `apps/web/src/app/alerts/page.tsx`
- Replace any mock data with real `trpc.alerts.*` calls
- Show `lastTriggeredAt` in table
- Trigger indicator (red badge if currently triggered)

**Acceptance:** Create alert for CPU > 80%, wait for evaluator cycle, verify it appears in audit log.

---

### STAGE E3: Webhooks Real Backend (v126)
**Priority: MEDIUM**

#### E3-A: Webhooks tRPC Router
**File:** `apps/api/src/routers/webhooks.ts`
- `webhooks.list`, `webhooks.create`, `webhooks.delete`, `webhooks.test`
- `webhooks.test` → sends a test POST payload to the URL, returns response status

#### E3-B: Webhooks DB Schema
```
webhooks table:
  id, name, url, secret (nullable, for HMAC signing),
  events (jsonb array: ["alert.triggered", "cluster.unreachable", "pod.deleted"]),
  enabled, createdAt
```

#### E3-C: Wire UI to real tRPC
**File:** `apps/web/src/app/webhooks/page.tsx`
- Replace `mockAdminApi` with real `trpc.webhooks.*`
- Add "Test" button → calls `webhooks.test` → shows response code + body

#### E3-D: Connect Alerts → Webhooks
- When alert evaluator triggers → look up matching webhooks by event type → dispatch POST

**Acceptance:** Create webhook → Test it → Create alert that links to webhook → Trigger alert → Verify webhook was called (check in audit log).

---

### STAGE E4: AI Assistant Backend (v127)
**Priority: HIGH**

#### E4-A: AI tRPC Router
**File:** `apps/api/src/routers/ai.ts`
- `ai.chat` — sends message + cluster context → calls OpenAI API → returns response
- `ai.recommendations` — analyzes cluster health data → returns structured recommendations
- `ai.testConnection` — validates API key is working

#### E4-B: AI Key Management
**File:** `apps/api/src/lib/ai-keys.ts` (check if exists)
- Store API keys per user in encrypted settings (BYOK pattern — same as cluster creds)
- Key stored in DB, decrypted on use

#### E4-C: Cluster Context Builder
- When user sends message → build context: cluster name, health, top events, running pods count, recent alerts
- Include context in OpenAI system prompt

#### E4-D: Wire UI to real tRPC
**File:** `apps/web/src/app/ai/page.tsx`
- Replace `getAiKeySettings`/`testAiKeyConnection` client-side calls with `trpc.ai.*`
- Wire `AiChat` component to `trpc.ai.chat` mutation (streaming if possible)
- Wire `RecommendationsPanel` to `trpc.ai.recommendations`

**Acceptance:** User sets OpenAI key in settings → navigates to AI page → selects cluster → asks "What's wrong with this cluster?" → gets relevant response based on actual cluster data.

---

### STAGE E5: Permissions Real Backend (v128)
**Priority: MEDIUM**

#### E5-A: Permissions tRPC Router
- `permissions.list` — list all grants
- `permissions.grant` — grant user/team access to resource
- `permissions.revoke` — revoke access
- Enforce: `authorizedProcedure` already checks permissions — verify it's actually enforced

#### E5-B: Wire UI to real tRPC
**File:** `apps/web/src/app/permissions/page.tsx`
- Replace `mockAccessControlApi` with real `trpc.permissions.*`

**Acceptance:** Grant a non-admin user read access to a specific cluster → verify they can see it → revoke → verify they can't.

---

## Cross-Stage Rules
- VERSION CONTRACT enforced on every deploy (git tag → docker → state.json)
- Self-improvement mandatory final step in every agent spawn
- Guardian + Monitor + Morpheus 5min sync check active throughout
- E2E suite must be extended for each new feature (add tests before marking stage complete)

## Pipeline Gates (all stages)
- Code Review (Lior): 10/10
- E2E (Yuval): ≥88/107
- Desktop QA (Mai): ≥8.5/10
