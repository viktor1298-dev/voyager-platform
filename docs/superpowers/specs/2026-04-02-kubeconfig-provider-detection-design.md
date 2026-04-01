# Kubeconfig Provider Auto-Detection

**Date:** 2026-04-02
**Status:** Approved

## Problem

When a cluster is added via kubeconfig file, the provider is stored as `kubeconfig` regardless of the actual cloud provider. This causes the cluster card to show a generic file icon instead of the correct provider icon (e.g., AWS for EKS clusters). The frontend wizard already has partial detection logic (`kubeDetectedProvider` in `AddClusterWizard.tsx`) but it only displays the result as text in Step 4 — it never overrides the provider sent to the API.

## Solution

Multi-signal provider detection from kubeconfig content, applied on both frontend (immediate UX feedback) and backend (safety net for API consumers). Existing clusters stored as `kubeconfig` are auto-fixed during the health sync cycle.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Detection location | Frontend + backend | Frontend for real-time wizard feedback; backend as safety net for API-only creation |
| Existing cluster fix | Auto-fix in `syncClusterHealth()` | Self-healing for clusters with active watches — no migration code, no manual intervention |
| Detection depth | URL + auth exec + context name | Catches all common providers with high accuracy |
| DB enum expansion | No | k3s/kind/docker are edge cases — stay as `kubeconfig`. Enum remains `kubeconfig \| aws \| azure \| gke \| minikube` |
| Wizard UX | Detection banner in Step 2 | Banner with provider icon, context name, and endpoint — informative without disrupting flow |

## Detection Engine

### Centralized Detection Rules

Detection patterns live in `packages/config/src/providers.ts` as a `PROVIDER_DETECTION_RULES` constant. Both frontend (`@voyager/config/providers`) and backend import from this single source. No hardcoded regex in components or routers.

```typescript
type DetectionSignal = 'url' | 'exec' | 'context'

type DetectionRule = {
  provider: 'aws' | 'azure' | 'gke' | 'minikube'
  label: string
  urlPatterns: string[]       // substrings matched against server URL
  execCommands: string[]      // substrings matched against exec command/args
  contextPatterns: string[]   // prefixes/exact matches against context name (plain strings, not RegExp — JSON-serializable)
}
```

### Priority Chain

First match wins, ordered by confidence:

| Priority | Signal | Confidence | Patterns |
|----------|--------|------------|----------|
| 1 | Server URL | high | `.eks.amazonaws.com` → `aws`, `.azmk8s.io` / `.azure.com` → `azure`, `.googleapis.com` / `container.cloud.google.com` → `gke` |
| 2 | Auth exec command | high | `aws eks get-token` → `aws`, `kubelogin` → `azure`, `gke-gcloud-auth-plugin` → `gke` |
| 3 | Context/cluster name | medium | `arn:aws:eks:` / `eks-` → `aws`, `aks-` → `azure`, `gke_` → `gke`, `minikube` → `minikube` |
| — | No match | none | stays `kubeconfig` |

k3s, kind, docker-desktop context names are recognized but map to `kubeconfig` (no DB enum value).

### Context-Aware Parsing

The detection function resolves the **active cluster** from the kubeconfig before matching signals. For multi-cluster kubeconfigs, it follows `current-context` → finds the matching context entry → resolves to the referenced cluster entry → checks that cluster's server URL. It does NOT regex the first `server:` line in the file.

### Return Shape

```typescript
type DetectionResult = {
  provider: Provider       // 'aws' | 'azure' | 'gke' | 'minikube' | 'kubeconfig'
  confidence: 'high' | 'medium' | 'none'
  signal: DetectionSignal | null  // which signal matched
  label: string            // display label, e.g., 'AWS EKS'
  context?: string         // detected context name
  endpoint?: string        // detected server URL
}
```

### Frontend vs Backend Implementation

The detection function in `packages/config/` is pure string parsing — it extracts `current-context`, finds the matching context/cluster/user entries via targeted regex, then checks signals. No `@kubernetes/client-node` dependency — works in both environments. The backend additionally uses `KubeConfig.loadFromString()` for endpoint extraction (already exists in the create handler), but detection itself is the shared function.

## Backend Changes

### `packages/config/src/providers.ts` (new file)

- `PROVIDER_DETECTION_RULES` constant — all detection patterns
- `detectProviderFromKubeconfig(yaml: string): DetectionResult` — the detection function
- `PROVIDER_LABELS` map — `{ aws: 'AWS EKS', azure: 'Azure AKS', gke: 'Google GKE', minikube: 'Minikube', kubeconfig: 'Kubeconfig' }`

Export from `packages/config/src/index.ts` using `.js` extension per ESM convention: `export * from './providers.js'`

### `apps/api/src/routers/clusters.ts` — create handler

After the existing endpoint extraction block (around the `KubeConfig.loadFromString()` call), add:

```
if provider === 'kubeconfig' && kubeconfig content present:
  result = detectProviderFromKubeconfig(kubeconfigYaml)
  if result.confidence !== 'none':
    override provider with result.provider
```

The `normalizeProvider()` call already handles aliases, so the detected provider flows through cleanly.

### `apps/api/src/lib/watch-db-writer.ts` — `syncClusterHealth()` auto-fix

Inside `syncClusterHealth()`, which already queries the cluster from DB and has access to `clusterClientPool`:

```
query cluster provider along with status (extend existing select)
if provider === 'kubeconfig':
  get connectionConfig from DB (add to existing query)
  decrypt via decryptCredential()
  if connectionConfig has kubeconfig field:
    result = detectProviderFromKubeconfig(kubeconfig)
    if result.confidence !== 'none':
      add provider to existing updatePayload
      log with console.info (system process, no user context for audit)
```

This only runs for clusters with active watch subscriptions (dirty set). After provider is updated, `provider === 'kubeconfig'` no longer matches — runs at most once per cluster. System-level logging via `console.info` since `logAudit()` requires a user session context which background processes don't have.

New imports needed: `decryptCredential` from `credential-crypto.js`, `detectProviderFromKubeconfig` from `@voyager/config/providers`.

### `apps/api/src/lib/providers.ts`

No changes to `VALID_PROVIDERS` or `normalizeProvider()`. Import detection from `@voyager/config/providers`.

## Frontend Changes

### `apps/web/src/components/AddClusterWizard.tsx`

**Replace `kubeDetectedProvider` memo:**

Replace the current string-returning memo with one that calls `detectProviderFromKubeconfig()` from `@voyager/config/providers` and returns a full `DetectionResult`.

**Detection banner in Step 2 (after the kubeconfig textarea block):**

When `provider === 'kubeconfig'` and detection result has `confidence !== 'none'`, render a banner:

- Provider icon via `ProviderLogo` component (not inline icon rendering)
- Provider accent color: the banner needs colors from the provider icon config. Export `PROVIDER_ICONS` from `ProviderLogo.tsx` (currently module-private) so the wizard can derive banner background/border colors from the detected provider's `color` field. Alternatively, move provider color constants to `packages/config/src/providers.ts` alongside the detection rules.
- Display: provider label (from `PROVIDER_LABELS`), context name, endpoint
- Styled with provider color at low opacity for background/border — values derived from the exported config, not hardcoded

**Submit override:**

```
onSubmit({
  name: finalName,
  provider: detectionResult?.provider ?? provider,  // detected overrides 'kubeconfig'
  environment,
  endpoint: computedEndpoint,
  connectionConfig,
})
```

**Step 4 summary:**

Replace text-only display with `ProviderLogo` icon + label from detection result.

### `apps/web/src/components/ProviderLogo.tsx`

Export `PROVIDER_ICONS` so the wizard can access provider colors for the detection banner. No other changes — the component already has icons and aliases for all providers.

## Files Changed

| File | Change |
|------|--------|
| `packages/config/src/providers.ts` | **New** — detection rules, detection function, provider labels |
| `packages/config/src/index.ts` | Export new providers module (`export * from './providers.js'`) |
| `apps/api/src/routers/clusters.ts` | Add detection in create handler |
| `apps/api/src/lib/watch-db-writer.ts` | Add auto-fix in `syncClusterHealth()` for existing `kubeconfig` clusters |
| `apps/web/src/components/AddClusterWizard.tsx` | Enhanced detection, banner in Step 2, submit override |
| `apps/web/src/components/ProviderLogo.tsx` | Export `PROVIDER_ICONS` constant |

## What Doesn't Change

- DB schema / enum / migrations / `init.sql`
- `connection-config.ts` — kubeconfig credential shape covers all detected types
- Wizard flow (4 steps) — structure unchanged
- Non-kubeconfig provider paths (AWS/Azure/GKE/Minikube direct entry)
- `VALID_PROVIDERS` / `normalizeProvider()` in `apps/api/src/lib/providers.ts`

## Testing

### Unit tests (`packages/config`)

Pure function `detectProviderFromKubeconfig()` with sample kubeconfigs:
- EKS kubeconfig (server URL match) → `{ provider: 'aws', confidence: 'high' }`
- AKS kubeconfig (server URL match) → `{ provider: 'azure', confidence: 'high' }`
- GKE kubeconfig (exec command match) → `{ provider: 'gke', confidence: 'high' }`
- Minikube kubeconfig (context name match) → `{ provider: 'minikube', confidence: 'medium' }`
- Multi-cluster kubeconfig (EKS as current-context) → detects EKS, not the other cluster
- Generic kubeconfig (no recognizable patterns) → `{ provider: 'kubeconfig', confidence: 'none' }`
- Empty string / malformed YAML → `{ provider: 'kubeconfig', confidence: 'none' }`

### Integration tests

- Add a cluster via kubeconfig with an EKS endpoint → should show AWS icon on cluster card and "AWS EKS" in provider column
- Add a cluster via kubeconfig with an AKS endpoint → Azure icon
- Add a cluster via kubeconfig with no recognizable patterns → stays as `kubeconfig` with file icon
- Existing cluster with `provider: 'kubeconfig'` and EKS kubeconfig → auto-fixes to `aws` on next health sync
- API-only cluster creation with `provider: 'kubeconfig'` → backend detects and overrides
