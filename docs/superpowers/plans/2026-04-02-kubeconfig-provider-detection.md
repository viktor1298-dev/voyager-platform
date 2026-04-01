# Kubeconfig Provider Auto-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a cluster is added via kubeconfig, auto-detect the actual cloud provider (EKS→aws, AKS→azure, GKE→gke, minikube) and store/display it correctly instead of showing a generic file icon.

**Architecture:** Shared detection engine in `packages/config/` parses kubeconfig YAML using a priority signal chain (server URL → exec command → context name). Frontend uses it for real-time wizard feedback + submit override. Backend uses it as safety net in the create handler and for auto-fixing existing clusters during health sync.

**Tech Stack:** TypeScript, Vitest, tRPC, Drizzle ORM, React (Next.js)

**Spec:** `docs/superpowers/specs/2026-04-02-kubeconfig-provider-detection-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/config/src/providers.ts` | Create | Detection rules, detection function, provider labels — shared by frontend + backend |
| `packages/config/src/index.ts` | Modify | Add barrel export for providers module |
| `packages/config/src/__tests__/providers.test.ts` | Create | Unit tests for detection engine |
| `apps/api/src/routers/clusters.ts` | Modify | Call detection in create handler when provider is `kubeconfig` |
| `apps/api/src/lib/watch-db-writer.ts` | Modify | Auto-fix existing `kubeconfig` clusters in `syncClusterHealth()` |
| `apps/web/src/components/ProviderLogo.tsx` | Modify | Export `PROVIDER_ICONS` constant |
| `apps/web/src/components/AddClusterWizard.tsx` | Modify | Replace detection memo, add banner in Step 2, override provider on submit, update Step 4 summary |

---

### Task 1: Detection Engine — Rules and Types

**Files:**
- Create: `packages/config/src/providers.ts`

- [ ] **Step 1: Create providers.ts with types, rules, and labels**

```typescript
// packages/config/src/providers.ts

export type DetectionSignal = 'url' | 'exec' | 'context'

export type DetectionResult = {
  provider: 'aws' | 'azure' | 'gke' | 'minikube' | 'kubeconfig'
  confidence: 'high' | 'medium' | 'none'
  signal: DetectionSignal | null
  label: string
  context?: string
  endpoint?: string
}

export type DetectionRule = {
  provider: 'aws' | 'azure' | 'gke' | 'minikube'
  label: string
  urlPatterns: string[]
  execCommands: string[]
  contextPatterns: string[]
}

export const PROVIDER_LABELS: Record<string, string> = {
  aws: 'AWS EKS',
  azure: 'Azure AKS',
  gke: 'Google GKE',
  minikube: 'Minikube',
  kubeconfig: 'Kubeconfig',
}

export const PROVIDER_DETECTION_RULES: DetectionRule[] = [
  {
    provider: 'aws',
    label: 'AWS EKS',
    urlPatterns: ['.eks.amazonaws.com'],
    execCommands: ['aws eks get-token'],
    contextPatterns: ['arn:aws:eks:', 'eks-'],
  },
  {
    provider: 'azure',
    label: 'Azure AKS',
    urlPatterns: ['.azmk8s.io', '.azure.com'],
    execCommands: ['kubelogin'],
    contextPatterns: ['aks-'],
  },
  {
    provider: 'gke',
    label: 'Google GKE',
    urlPatterns: ['.googleapis.com', 'container.cloud.google.com'],
    execCommands: ['gke-gcloud-auth-plugin'],
    contextPatterns: ['gke_'],
  },
  {
    provider: 'minikube',
    label: 'Minikube',
    urlPatterns: [],
    execCommands: [],
    contextPatterns: ['minikube'],
  },
]
```

- [ ] **Step 2: Verify file compiles**

Run: `pnpm --filter @voyager/config typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/config/src/providers.ts
git commit -m "feat(config): add provider detection rules and types"
```

---

### Task 2: Detection Engine — detectProviderFromKubeconfig Function

**Files:**
- Modify: `packages/config/src/providers.ts`

- [ ] **Step 1: Add the detection function**

Append to `packages/config/src/providers.ts`:

```typescript
/**
 * Parse kubeconfig YAML to extract the active context's cluster name,
 * server URL, and user exec command. Context-aware: follows current-context
 * → context entry → cluster/user entries. Does NOT regex the first server line.
 */
function parseKubeconfig(yaml: string): {
  contextName: string
  clusterName: string
  serverUrl: string
  userName: string
  execCommand: string
} {
  const result = { contextName: '', clusterName: '', serverUrl: '', userName: '', execCommand: '' }

  // 1. Get current-context
  const ctxMatch = yaml.match(/current-context:\s*(\S+)/)
  if (!ctxMatch?.[1]) return result
  result.contextName = ctxMatch[1]

  // 2. Find the matching context entry to get cluster and user references
  // Matches: - name: <contextName>\n  context:\n    cluster: <clusterRef>\n    user: <userRef>
  const ctxBlockRe = new RegExp(
    `-\\s+name:\\s*${escapeRegex(result.contextName)}\\s*\\n` +
    `\\s+context:\\s*\\n` +
    `(?:\\s+[a-z].*\\n)*`,
    'm',
  )
  const ctxBlock = yaml.match(ctxBlockRe)?.[0] ?? ''
  const clusterRef = ctxBlock.match(/cluster:\s*(\S+)/)?.[1] ?? ''
  const userRef = ctxBlock.match(/user:\s*(\S+)/)?.[1] ?? ''
  result.clusterName = clusterRef

  // 3. Find the cluster entry to get server URL
  if (clusterRef) {
    const clusterBlockRe = new RegExp(
      `-\\s+name:\\s*${escapeRegex(clusterRef)}\\s*\\n` +
      `\\s+cluster:\\s*\\n` +
      `(?:\\s+[a-z].*\\n)*`,
      'm',
    )
    const clusterBlock = yaml.match(clusterBlockRe)?.[0] ?? ''
    result.serverUrl = clusterBlock.match(/server:\s*(\S+)/)?.[1] ?? ''
  }

  // 4. Find the user entry to get exec command
  if (userRef) {
    const userBlockRe = new RegExp(
      `-\\s+name:\\s*${escapeRegex(userRef)}\\s*\\n` +
      `\\s+user:\\s*\\n` +
      `[\\s\\S]*?(?=\\n-\\s+name:|$)`,
      'm',
    )
    const userBlock = yaml.match(userBlockRe)?.[0] ?? ''
    const execCmd = userBlock.match(/command:\s*(\S+)/)?.[1] ?? ''
    const execArgs = [...userBlock.matchAll(/- ['"]?([^'"\n]+)['"]?/g)]
      .map((m) => m[1]?.trim())
      .filter(Boolean)
      .join(' ')
    result.execCommand = execCmd ? `${execCmd} ${execArgs}`.trim() : ''
  }

  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Detect the cloud provider from a kubeconfig YAML string.
 * Uses a priority signal chain: server URL (high) → exec command (high) → context name (medium).
 * Context-aware: resolves current-context → cluster entry → server URL.
 */
export function detectProviderFromKubeconfig(yaml: string): DetectionResult {
  const none: DetectionResult = {
    provider: 'kubeconfig',
    confidence: 'none',
    signal: null,
    label: PROVIDER_LABELS.kubeconfig,
  }

  if (!yaml?.trim()) return none

  const parsed = parseKubeconfig(yaml)

  // Priority 1: Server URL (high confidence)
  if (parsed.serverUrl) {
    for (const rule of PROVIDER_DETECTION_RULES) {
      for (const pattern of rule.urlPatterns) {
        if (parsed.serverUrl.includes(pattern)) {
          return {
            provider: rule.provider,
            confidence: 'high',
            signal: 'url',
            label: rule.label,
            context: parsed.contextName,
            endpoint: parsed.serverUrl,
          }
        }
      }
    }
  }

  // Priority 2: Exec command (high confidence)
  if (parsed.execCommand) {
    for (const rule of PROVIDER_DETECTION_RULES) {
      for (const cmd of rule.execCommands) {
        if (parsed.execCommand.includes(cmd)) {
          return {
            provider: rule.provider,
            confidence: 'high',
            signal: 'exec',
            label: rule.label,
            context: parsed.contextName,
            endpoint: parsed.serverUrl || undefined,
          }
        }
      }
    }
  }

  // Priority 3: Context/cluster name (medium confidence)
  const namesToCheck = [parsed.contextName, parsed.clusterName].filter(Boolean)
  for (const name of namesToCheck) {
    for (const rule of PROVIDER_DETECTION_RULES) {
      for (const pattern of rule.contextPatterns) {
        if (name === pattern || name.startsWith(pattern)) {
          return {
            provider: rule.provider,
            confidence: 'medium',
            signal: 'context',
            label: rule.label,
            context: parsed.contextName,
            endpoint: parsed.serverUrl || undefined,
          }
        }
      }
    }
  }

  return none
}
```

- [ ] **Step 2: Verify file compiles**

Run: `pnpm --filter @voyager/config typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/config/src/providers.ts
git commit -m "feat(config): add detectProviderFromKubeconfig function"
```

---

### Task 3: Detection Engine — Unit Tests

**Files:**
- Create: `packages/config/src/__tests__/providers.test.ts`

The `packages/config` package doesn't have vitest configured yet. Add a test script to its `package.json`, then write tests.

- [ ] **Step 1: Add vitest dev dependency and test script to packages/config/package.json**

Add `"test": "vitest run"` to scripts and `"vitest": "^4.1.2"` to devDependencies (matches `apps/api` and `apps/web`).

Run: `pnpm install`

- [ ] **Step 2: Write unit tests**

```typescript
// packages/config/src/__tests__/providers.test.ts
import { describe, expect, it } from 'vitest'
import { detectProviderFromKubeconfig } from '../providers.js'

// ── Sample kubeconfigs ───────────────────────────────────────

const eksKubeconfig = `
apiVersion: v1
kind: Config
current-context: eks-devops-separate-us-east-1
clusters:
- name: eks-devops-separate-us-east-1
  cluster:
    server: https://ABC123DEF456.gr7.us-east-1.eks.amazonaws.com
    certificate-authority-data: LS0tLS1...
contexts:
- name: eks-devops-separate-us-east-1
  context:
    cluster: eks-devops-separate-us-east-1
    user: eks-devops-user
users:
- name: eks-devops-user
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: aws
      args:
        - eks
        - get-token
        - --cluster-name
        - devops-separate
        - --region
        - us-east-1
`

const aksKubeconfig = `
apiVersion: v1
kind: Config
current-context: aks-prod-cluster
clusters:
- name: aks-prod-cluster
  cluster:
    server: https://aks-prod-dns-abc123.hcp.westeurope.azmk8s.io:443
contexts:
- name: aks-prod-cluster
  context:
    cluster: aks-prod-cluster
    user: aks-user
users:
- name: aks-user
  user:
    token: redacted
`

const gkeKubeconfig = `
apiVersion: v1
kind: Config
current-context: gke_my-project_us-central1_my-cluster
clusters:
- name: gke_my-project_us-central1_my-cluster
  cluster:
    server: https://35.200.100.50
contexts:
- name: gke_my-project_us-central1_my-cluster
  context:
    cluster: gke_my-project_us-central1_my-cluster
    user: gke-user
users:
- name: gke-user
  user:
    exec:
      command: gke-gcloud-auth-plugin
      apiVersion: client.authentication.k8s.io/v1beta1
`

const minikubeKubeconfig = `
apiVersion: v1
kind: Config
current-context: minikube
clusters:
- name: minikube
  cluster:
    server: https://192.168.49.2:8443
contexts:
- name: minikube
  context:
    cluster: minikube
    user: minikube
users:
- name: minikube
  user:
    client-certificate: /home/user/.minikube/profiles/minikube/client.crt
    client-key: /home/user/.minikube/profiles/minikube/client.key
`

const multiClusterKubeconfig = `
apiVersion: v1
kind: Config
current-context: eks-devops-separate-us-east-1
clusters:
- name: onprem-cluster
  cluster:
    server: https://10.0.0.1:6443
- name: eks-devops-separate-us-east-1
  cluster:
    server: https://ABC123.gr7.us-east-1.eks.amazonaws.com
contexts:
- name: onprem-context
  context:
    cluster: onprem-cluster
    user: onprem-user
- name: eks-devops-separate-us-east-1
  context:
    cluster: eks-devops-separate-us-east-1
    user: eks-user
users:
- name: onprem-user
  user:
    token: redacted
- name: eks-user
  user:
    token: redacted
`

const genericKubeconfig = `
apiVersion: v1
kind: Config
current-context: my-custom-cluster
clusters:
- name: my-custom-cluster
  cluster:
    server: https://10.0.0.1:6443
contexts:
- name: my-custom-cluster
  context:
    cluster: my-custom-cluster
    user: admin
users:
- name: admin
  user:
    token: redacted
`

// ── Tests ────────────────────────────────────────────────────

describe('detectProviderFromKubeconfig', () => {
  it('detects EKS from server URL (high confidence)', () => {
    const result = detectProviderFromKubeconfig(eksKubeconfig)
    expect(result.provider).toBe('aws')
    expect(result.confidence).toBe('high')
    expect(result.signal).toBe('url')
    expect(result.label).toBe('AWS EKS')
    expect(result.context).toBe('eks-devops-separate-us-east-1')
    expect(result.endpoint).toContain('.eks.amazonaws.com')
  })

  it('detects AKS from server URL (high confidence)', () => {
    const result = detectProviderFromKubeconfig(aksKubeconfig)
    expect(result.provider).toBe('azure')
    expect(result.confidence).toBe('high')
    expect(result.signal).toBe('url')
    expect(result.label).toBe('Azure AKS')
  })

  it('detects GKE from exec command (high confidence)', () => {
    const result = detectProviderFromKubeconfig(gkeKubeconfig)
    expect(result.provider).toBe('gke')
    expect(result.confidence).toBe('high')
    // GKE has a plain IP server URL, so detection falls through to exec
    expect(result.signal).toBe('exec')
    expect(result.label).toBe('Google GKE')
  })

  it('detects minikube from context name (medium confidence)', () => {
    const result = detectProviderFromKubeconfig(minikubeKubeconfig)
    expect(result.provider).toBe('minikube')
    expect(result.confidence).toBe('medium')
    expect(result.signal).toBe('context')
    expect(result.label).toBe('Minikube')
  })

  it('detects EKS from correct cluster in multi-cluster kubeconfig', () => {
    const result = detectProviderFromKubeconfig(multiClusterKubeconfig)
    expect(result.provider).toBe('aws')
    expect(result.confidence).toBe('high')
    expect(result.context).toBe('eks-devops-separate-us-east-1')
    // Must NOT match the on-prem cluster (first in file)
    expect(result.endpoint).toContain('.eks.amazonaws.com')
  })

  it('returns kubeconfig for generic/unrecognized clusters', () => {
    const result = detectProviderFromKubeconfig(genericKubeconfig)
    expect(result.provider).toBe('kubeconfig')
    expect(result.confidence).toBe('none')
    expect(result.signal).toBeNull()
  })

  it('returns kubeconfig for empty string', () => {
    const result = detectProviderFromKubeconfig('')
    expect(result.provider).toBe('kubeconfig')
    expect(result.confidence).toBe('none')
  })

  it('returns kubeconfig for malformed YAML', () => {
    const result = detectProviderFromKubeconfig('not: valid: kubeconfig: at: all')
    expect(result.provider).toBe('kubeconfig')
    expect(result.confidence).toBe('none')
  })

  it('detects EKS from context name when URL has no provider pattern (e.g., PrivateLink)', () => {
    const privateLink = `
apiVersion: v1
kind: Config
current-context: eks-prod-us-east-1
clusters:
- name: eks-prod-us-east-1
  cluster:
    server: https://vpce-abc123.eks.us-east-1.vpce.amazonaws.com
contexts:
- name: eks-prod-us-east-1
  context:
    cluster: eks-prod-us-east-1
    user: eks-user
users:
- name: eks-user
  user:
    token: redacted
`
    const result = detectProviderFromKubeconfig(privateLink)
    expect(result.provider).toBe('aws')
    expect(result.confidence).not.toBe('none')
    // vpce URL still contains '.eks.amazonaws.com' substring → matches URL pattern
    // If it didn't, would fall through to context name 'eks-' prefix
    expect(['url', 'context']).toContain(result.signal)
  })
})
```

- [ ] **Step 3: Add barrel export**

Add to `packages/config/src/index.ts`:
```typescript
export * from './providers.js'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @voyager/config test`
Expected: All 9 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/__tests__/providers.test.ts packages/config/src/index.ts packages/config/package.json
git commit -m "test(config): add unit tests for provider detection engine"
```

---

### Task 4: Export PROVIDER_ICONS from ProviderLogo

**Files:**
- Modify: `apps/web/src/components/ProviderLogo.tsx`

- [ ] **Step 1: Export the PROVIDER_ICONS constant**

In `apps/web/src/components/ProviderLogo.tsx`, change line 10 from:

```typescript
const PROVIDER_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
```

to:

```typescript
export const PROVIDER_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter web typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ProviderLogo.tsx
git commit -m "refactor(web): export PROVIDER_ICONS for reuse by detection banner"
```

---

### Task 5: Backend — Detection in Cluster Create Handler

**Files:**
- Modify: `apps/api/src/routers/clusters.ts`

- [ ] **Step 1: Add import**

At the top of `apps/api/src/routers/clusters.ts`, add:

```typescript
import { detectProviderFromKubeconfig } from '@voyager/config/providers'
```

- [ ] **Step 2: Add detection after endpoint extraction block**

In the `create` mutation handler, after the endpoint extraction try/catch block (the one ending around `effectiveEndpoint = cluster.server`) and before `const parsedLastHealthCheck = ...`, add:

```typescript
      // Auto-detect provider from kubeconfig content
      let effectiveProvider = input.provider
      if (
        input.provider === 'kubeconfig' &&
        input.connectionConfig &&
        'kubeconfig' in input.connectionConfig
      ) {
        const detection = detectProviderFromKubeconfig(
          (input.connectionConfig as { kubeconfig: string }).kubeconfig,
        )
        if (detection.confidence !== 'none') {
          effectiveProvider = detection.provider
        }
      }
```

- [ ] **Step 3: Use effectiveProvider in the insert**

Change line 837 from:

```typescript
          provider: normalizeProvider(input.provider),
```

to:

```typescript
          provider: normalizeProvider(effectiveProvider),
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm --filter api typecheck`
Expected: 0 errors

- [ ] **Step 5: Run existing tests**

Run: `pnpm --filter api test -- src/__tests__/clusters.test.ts`
Expected: All existing tests pass (detection is additive, doesn't break existing flow)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routers/clusters.ts
git commit -m "feat(api): auto-detect provider from kubeconfig in cluster create"
```

---

### Task 6: Backend — Auto-Fix in syncClusterHealth

**Files:**
- Modify: `apps/api/src/lib/watch-db-writer.ts`

- [ ] **Step 1: Add imports**

At the top of `apps/api/src/lib/watch-db-writer.ts`, add:

```typescript
import { detectProviderFromKubeconfig } from '@voyager/config/providers'
import { decryptCredential } from './credential-crypto.js'
import { K8S_CONFIG } from '../config/k8s.js'
```

- [ ] **Step 2: Extend the DB select in syncClusterHealth**

In `syncClusterHealth()`, change the existing select (currently fetches only `status`) to also fetch `provider` and `connectionConfig`:

Change:

```typescript
  const [currentCluster] = await db
    .select({ status: clusters.status })
    .from(clusters)
    .where(eq(clusters.id, clusterId))
```

to:

```typescript
  const [currentCluster] = await db
    .select({
      status: clusters.status,
      provider: clusters.provider,
      connectionConfig: clusters.connectionConfig,
    })
    .from(clusters)
    .where(eq(clusters.id, clusterId))
```

- [ ] **Step 3: Add auto-fix logic after updatePayload is initialized**

Insert this block **after** the `if (version) { updatePayload.version = version }` block (line ~201) and **before** the `await db.update(clusters)` call (line ~203). The `updatePayload` must already exist since we're adding a field to it:

```typescript
  // Auto-fix: detect real provider for clusters stored as 'kubeconfig'
  if (currentCluster?.provider === 'kubeconfig' && currentCluster.connectionConfig) {
    try {
      let config = currentCluster.connectionConfig as Record<string, unknown>
      if (
        typeof config.__encrypted === 'string' &&
        /^[0-9a-fA-F]{64}$/.test(K8S_CONFIG.ENCRYPTION_KEY)
      ) {
        config = JSON.parse(decryptCredential(config.__encrypted, K8S_CONFIG.ENCRYPTION_KEY))
      }
      if (typeof config.kubeconfig === 'string') {
        const detection = detectProviderFromKubeconfig(config.kubeconfig)
        if (detection.confidence !== 'none') {
          updatePayload.provider = detection.provider
          console.info(
            `[watch-db-writer] Auto-detected provider for cluster ${clusterId}: ${detection.provider} (${detection.signal}, ${detection.confidence})`,
          )
        }
      }
    } catch {
      // Detection is best-effort — never block health sync
    }
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm --filter api typecheck`
Expected: 0 errors

- [ ] **Step 5: Run existing tests**

Run: `pnpm --filter api test -- src/__tests__/watch-manager.test.ts`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/watch-db-writer.ts
git commit -m "feat(api): auto-fix kubeconfig provider in health sync"
```

---

### Task 7: Frontend — Enhanced Detection + Submit Override

**Files:**
- Modify: `apps/web/src/components/AddClusterWizard.tsx`

- [ ] **Step 1: Add import**

At the top of `AddClusterWizard.tsx`, add:

```typescript
import { detectProviderFromKubeconfig, PROVIDER_LABELS, type DetectionResult } from '@voyager/config/providers'
```

- [ ] **Step 2: Replace kubeDetectedProvider memo**

Remove the entire `kubeDetectedProvider` memo (the `useMemo` that returns a string like `'AWS EKS'` or `null` — 2 references total: definition at line ~205 and usage at line ~767) and replace with:

```typescript
  // Detect cloud provider from kubeconfig content (multi-signal)
  const detectionResult = useMemo((): DetectionResult | null => {
    if (!effectiveKubeYaml) return null
    const result = detectProviderFromKubeconfig(effectiveKubeYaml)
    return result.confidence !== 'none' ? result : null
  }, [effectiveKubeYaml])
```

- [ ] **Step 3: Update submit to use detected provider**

In the `submit` function, change:

```typescript
    onSubmit({
      name: finalName,
      provider,
      environment,
```

to:

```typescript
    onSubmit({
      name: finalName,
      provider: (detectionResult?.provider as ProviderId) ?? provider,
      environment,
```

- [ ] **Step 4: Update Step 4 summary to use detection result**

In the Step 4 block, replace the provider display text:

Change:

```tsx
                    {kubeDetectedProvider ?? currentProvider.label}
```

to:

```tsx
                    {detectionResult?.label ?? currentProvider.label}
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm --filter web typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AddClusterWizard.tsx
git commit -m "feat(web): use provider detection result in wizard submit and Step 4"
```

---

### Task 8: Frontend — Detection Banner in Step 2

**Files:**
- Modify: `apps/web/src/components/AddClusterWizard.tsx`

- [ ] **Step 1: Add ProviderLogo and PROVIDER_ICONS imports**

Add at top of file:

```typescript
import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
```

- [ ] **Step 2: Add detection banner after the kubeconfig textarea block**

In Step 2, after the closing `</>` of the `{provider === 'kubeconfig' && (...)}` block (right before `{provider === 'aws' && (`), add the detection banner:

```tsx
              {provider === 'kubeconfig' && detectionResult && (
                <div
                  className="flex items-center gap-3 rounded-lg p-3 border text-sm"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${PROVIDER_ICONS[detectionResult.provider]?.color ?? '#9CA3AF'} 8%, transparent)`,
                    borderColor: `color-mix(in srgb, ${PROVIDER_ICONS[detectionResult.provider]?.color ?? '#9CA3AF'} 20%, transparent)`,
                  }}
                >
                  <ProviderLogo provider={detectionResult.provider} size={24} />
                  <div className="min-w-0">
                    <div className="text-[var(--color-text-primary)] font-medium text-sm">
                      {detectionResult.label} Cluster Detected
                    </div>
                    {detectionResult.context && (
                      <div className="text-[var(--color-text-muted)] text-xs truncate">
                        Context: {detectionResult.context}
                      </div>
                    )}
                    {detectionResult.endpoint && (
                      <div className="text-[var(--color-text-muted)] text-xs truncate">
                        Endpoint: {detectionResult.endpoint}
                      </div>
                    )}
                  </div>
                </div>
              )}
```

- [ ] **Step 3: Also add ProviderLogo to Step 4 summary**

In the Step 4 provider display, replace the plain text with icon + label:

Change:

```tsx
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm">
                <p className="text-[var(--color-text-secondary)]">
                  Provider:{' '}
                  <span className="text-[var(--color-text-primary)]">
                    {detectionResult?.label ?? currentProvider.label}
                  </span>
                </p>
```

to:

```tsx
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm">
                <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  Provider:{' '}
                  <ProviderLogo provider={detectionResult?.provider ?? provider} size={16} />
                  <span className="text-[var(--color-text-primary)]">
                    {detectionResult?.label ?? currentProvider.label}
                  </span>
                </div>
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm --filter web typecheck`
Expected: 0 errors

- [ ] **Step 5: Build to verify no runtime issues**

Run: `pnpm build`
Expected: All packages and apps build successfully

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AddClusterWizard.tsx
git commit -m "feat(web): add provider detection banner in wizard Step 2"
```

---

### Task 9: Final Verification

**Files:**
- No new files — verify everything works end-to-end

- [ ] **Step 1: Run all unit tests**

Run: `pnpm test`
Expected: All tests pass across all packages

- [ ] **Step 2: Full typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors, clean build, `packages/config/dist/providers.js` exists

- [ ] **Step 3: Commit any fixups (if needed)**

If any fixes were needed during verification, commit them:

```bash
git commit -m "fix: address typecheck/build issues from provider detection"
```
