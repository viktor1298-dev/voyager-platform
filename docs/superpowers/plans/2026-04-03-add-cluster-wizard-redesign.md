# Add Cluster Wizard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic Add Cluster modal wizard with a premium two-panel split layout featuring adaptive illustration panels, spring animations, brand-color provider tiles, connection validation visualization, and layout morphing — all using centralized design tokens.

**Architecture:** Decompose the monolithic 883-line `AddClusterWizard.tsx` into an orchestrator + 6 focused sub-components inside `components/add-cluster/`. Add a `size` prop to `Dialog` for the wider layout. All animations use existing variants from `animation-constants.ts`; all colors use CSS custom properties from `globals.css`. New CSS tokens and keyframes for wizard-specific visuals (left panel gradient, ring pulse, float).

**Tech Stack:** React 19, Motion 12 (`motion/react`), Tailwind 4, CSS custom properties, existing `animation-constants.ts` variants, `ProviderLogo` SVG component.

**Spec:** `docs/superpowers/specs/2026-04-03-add-cluster-wizard-redesign.md`

---

### Task 1: Add `size` prop to Dialog component

**Files:**
- Modify: `apps/web/src/components/ui/dialog.tsx:9-14,88-93`

- [ ] **Step 1: Add `size` prop to DialogProps interface**

In `apps/web/src/components/ui/dialog.tsx`, update the interface and apply size-based classes:

```tsx
interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  size?: 'md' | 'xl'
}
```

- [ ] **Step 2: Apply size-based width class to dialog content div**

Replace the current `className` on the `motion.div` at line 93. The existing `max-w-lg max-w-[calc(100vw-2rem)]` becomes size-dependent:

```tsx
// In the Dialog function signature, destructure size with default:
export function Dialog({ open, onClose, children, title, size = 'md' }: DialogProps) {

// On the content motion.div (line 88-93), replace className:
className={[
  'relative mx-4 rounded-xl border border-[var(--color-border)] shadow-2xl',
  size === 'xl'
    ? 'w-[min(960px,90vw)] p-0'
    : 'w-full max-w-lg max-w-[calc(100vw-2rem)] p-4 sm:p-6',
].join(' ')}
```

Note: `size="xl"` uses `p-0` because the wizard manages its own padding per panel. The title bar rendering also needs to be conditional — when `size="xl"`, the dialog should NOT render its own title bar (the wizard has its own header in the right panel):

```tsx
{size !== 'xl' && (
  <div className="flex items-center justify-between mb-4">
    {title && (
      <h2 id={titleId} className="text-lg font-bold text-[var(--color-text-primary)]">
        {title}
      </h2>
    )}
    <button
      type="button"
      onClick={onClose}
      aria-label="Close dialog"
      className="ml-auto flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
    >
      <X className="h-4 w-4" />
    </button>
  </div>
)}
{children}
```

- [ ] **Step 3: Verify existing dialogs are unaffected**

Run: `pnpm typecheck`
Expected: 0 errors. All existing `<Dialog>` usage (no `size` prop) defaults to `"md"` — no visual change.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/dialog.tsx
git commit -m "feat(dialog): add size prop with xl variant for wizard layout"
```

---

### Task 2: Add wizard CSS tokens and keyframes to globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add wizard CSS custom properties to `:root` (dark theme)**

Find the `:root` block in globals.css (around line 130+). Add these wizard-specific tokens alongside existing custom properties:

```css
/* Wizard — two-panel layout tokens */
--wizard-left-bg: linear-gradient(160deg, var(--elevated) 0%, var(--surface) 50%, color-mix(in srgb, var(--color-accent) 5%, var(--surface)) 100%);
--wizard-ring-color: var(--color-accent);
--wizard-ring-success: var(--color-status-active);
--wizard-ring-error: var(--color-status-error);
```

- [ ] **Step 2: Add matching light theme overrides to `html.light`**

In the `html.light` block (around line 300+):

```css
--wizard-left-bg: linear-gradient(160deg, #f8f8fc 0%, #ffffff 50%, color-mix(in srgb, var(--color-accent) 3%, #ffffff) 100%);
```

The ring color tokens reference status colors which already have light theme values — no override needed.

- [ ] **Step 3: Add keyframes for wizard float and ring-pulse animations**

Add near the existing `@keyframes` section (around line 30-120):

```css
@keyframes wizard-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes wizard-ring-pulse {
  0% { opacity: 0.4; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0.4; transform: scale(0.95); }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(css): add wizard-specific tokens and keyframes"
```

---

### Task 3: Create shared wizard types file

**Files:**
- Create: `apps/web/src/components/add-cluster/wizard-types.ts`

Tasks 4-8 create sub-components that import shared types (`ProviderId`, `Environment`, `CLUSTER_PROVIDERS`). These types originate from the old monolith and will live in the new orchestrator (Task 9). To avoid circular imports and allow Tasks 4-8 to compile independently, extract the shared types into a separate file first.

- [ ] **Step 1: Create the types file**

```tsx
import type { DetectionResult } from '@voyager/config/providers'

export type ClusterProviderOption = {
  id: 'kubeconfig' | 'aws' | 'azure' | 'gke' | 'minikube'
  label: string
  subtitle: string
}

export const CLUSTER_PROVIDERS = [
  { id: 'kubeconfig', label: 'Kubeconfig', subtitle: 'Upload config or paste YAML' },
  { id: 'aws', label: 'AWS EKS', subtitle: 'IAM credentials + region' },
  { id: 'azure', label: 'Azure AKS', subtitle: 'Subscription and app credentials' },
  { id: 'gke', label: 'Google GKE', subtitle: 'Project + zone + service account JSON' },
  { id: 'minikube', label: 'Minikube / Local', subtitle: 'Cert files + local endpoint' },
] as const satisfies readonly ClusterProviderOption[]

export type ProviderId = (typeof CLUSTER_PROVIDERS)[number]['id']
export type Environment = 'production' | 'staging' | 'development'

export type ConnectionConfig =
  | { kubeconfig: string; context?: string }
  | { accessKeyId: string; secretAccessKey: string; region: string; endpoint?: string }
  | { subscriptionId: string; resourceGroup: string; clusterName: string }
  | { serviceAccountJson: string; endpoint?: string }
  | { caCert?: string; clientCert?: string; clientKey?: string; endpoint: string }

export type AddClusterWizardPayload = {
  name: string
  provider: ProviderId
  environment: Environment
  endpoint: string
  connectionConfig: ConnectionConfig
}

/**
 * Resolve provider ID to PROVIDER_ICONS key.
 * CLUSTER_PROVIDERS uses 'gke' but PROVIDER_ICONS uses 'gcp' (via PROVIDER_ALIASES).
 * This helper ensures direct lookups into PROVIDER_ICONS get the correct key.
 */
const PROVIDER_ICON_KEY: Record<string, string> = { gke: 'gcp' }
export function resolveProviderIconKey(id: string): string {
  return PROVIDER_ICON_KEY[id] ?? id
}
```

Note: The `icon` field (emoji) is intentionally removed from `CLUSTER_PROVIDERS` — the redesign uses `ProviderLogo` SVG component instead.

Note: `resolveProviderIconKey()` fixes a GKE alias mismatch — `CLUSTER_PROVIDERS` uses `'gke'` but `PROVIDER_ICONS` keys GKE under `'gcp'`. Without this, `PROVIDER_ICONS['gke']` returns `undefined` and falls back to gray instead of Google blue. The `ProviderLogo` component handles this internally, but direct `PROVIDER_ICONS[id]` lookups in `WizardLeftPanel` and `WizardProviderTiles` need this resolver.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/add-cluster/wizard-types.ts
git commit -m "feat(wizard): create shared wizard types with provider alias resolver"
```

---

### Task 4: Create WizardStepDots component

**Files:**
- Create: `apps/web/src/components/add-cluster/WizardStepDots.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { DURATION } from '@/lib/animation-constants'

interface WizardStepDotsProps {
  currentStep: number
  totalSteps: number
}

export function WizardStepDots({ currentStep, totalSteps }: WizardStepDotsProps) {
  return (
    <div className="flex gap-2.5">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isCompleted = step < currentStep
        const isActive = step === currentStep

        return (
          <div
            key={step}
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: isCompleted
                ? 'var(--color-status-active)'
                : isActive
                  ? 'var(--color-accent)'
                  : 'var(--color-border)',
              boxShadow: isCompleted
                ? '0 0 8px color-mix(in srgb, var(--color-status-active) 40%, transparent)'
                : isActive
                  ? '0 0 10px color-mix(in srgb, var(--color-accent) 40%, transparent)'
                  : 'none',
              transition: `all ${DURATION.normal}s ease`,
            }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/add-cluster/WizardStepDots.tsx
git commit -m "feat(wizard): create WizardStepDots component"
```

---

### Task 5: Create WizardLeftPanel component

**Files:**
- Create: `apps/web/src/components/add-cluster/WizardLeftPanel.tsx`

This is the adaptive illustration panel. It shows different content per step with crossfade transitions.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { fadeVariants, slideUpVariants, listContainerVariants, listItemVariants } from '@/lib/animation-constants'
import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
import { SuccessCheck } from '@/components/animations/SuccessCheck'
import { WizardStepDots } from './WizardStepDots'
import type { ProviderId, Environment } from './wizard-types'
import { resolveProviderIconKey } from './wizard-types'

// Full provider labels for the hero badge
const PROVIDER_FULL_LABELS: Record<string, string> = {
  kubeconfig: 'Generic Kubeconfig',
  aws: 'Amazon Elastic Kubernetes Service',
  azure: 'Microsoft Azure Kubernetes Service',
  gke: 'Google Kubernetes Engine',
  minikube: 'Local Kubernetes Cluster',
}

interface WizardLeftPanelProps {
  step: number
  provider: ProviderId
  validationState: 'idle' | 'testing' | 'success' | 'error'
  clusterName: string
  endpoint: string
  environment: Environment
  detectedProvider?: string | null
}

export function WizardLeftPanel({
  step,
  provider,
  validationState,
  clusterName,
  endpoint,
  environment,
  detectedProvider,
}: WizardLeftPanelProps) {
  const reduced = useReducedMotion()
  const displayProvider = detectedProvider ?? provider
  const iconKey = resolveProviderIconKey(displayProvider)
  const providerColor = PROVIDER_ICONS[iconKey]?.color ?? PROVIDER_ICONS.kubeconfig.color

  return (
    <div
      className="hidden sm:flex w-[320px] min-w-[320px] flex-col items-center justify-center relative border-r border-[var(--color-border)] overflow-hidden"
      style={{
        background: step === 2
          ? `linear-gradient(160deg, var(--elevated) 0%, var(--surface) 40%, color-mix(in srgb, ${providerColor} 6%, var(--surface)) 100%)`
          : 'var(--wizard-left-bg)',
      }}
    >
      {/* Ambient accent glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--color-accent) 6%, transparent) 0%, transparent 70%)',
        }}
      />

      {/* Step-adaptive content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="relative z-10 flex flex-col items-center text-center px-8"
          initial={reduced ? undefined : 'hidden'}
          animate={reduced ? undefined : 'visible'}
          exit={reduced ? undefined : 'exit'}
          variants={reduced ? undefined : fadeVariants}
        >
          {step === 1 && <Step1Content reduced={reduced} />}
          {step === 2 && <Step2Content provider={displayProvider} />}
          {step === 3 && (
            <Step3Content validationState={validationState} reduced={reduced} />
          )}
          {step === 4 && (
            <Step4Content
              provider={displayProvider}
              clusterName={clusterName}
              endpoint={endpoint}
              environment={environment}
              reduced={reduced}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Step dots */}
      <div className="absolute bottom-7">
        <WizardStepDots currentStep={step} totalSteps={4} />
      </div>
    </div>
  )
}

/** Step 1: Floating provider logo grid */
function Step1Content({ reduced }: { reduced: boolean }) {
  const providers = ['kubeconfig', 'aws', 'azure', 'gke', 'minikube'] as const
  return (
    <>
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
        Connect Your Cluster
      </h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-5">
        Choose a provider to get started
      </p>
      <div className="flex flex-wrap gap-4 justify-center">
        {providers.map((id, i) => (
          <div
            key={id}
            className="rounded-xl flex items-center justify-center"
            style={{
              width: 52,
              height: 52,
              background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-text-primary) 6%, transparent)',
              animation: reduced ? 'none' : `wizard-float 4s ease-in-out infinite`,
              animationDelay: `${-i * 0.7}s`,
            }}
          >
            <ProviderLogo provider={id} size={24} />
          </div>
        ))}
      </div>
    </>
  )
}

/** Step 2: Hero provider logo */
function Step2Content({ provider }: { provider: string }) {
  const iconKey = resolveProviderIconKey(provider)
  const iconCfg = PROVIDER_ICONS[iconKey]
  return (
    <>
      <ProviderLogo provider={provider} size={48} layoutId="wizard-provider-logo" />
      <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mt-3">
        {iconCfg
          ? provider.charAt(0).toUpperCase() + provider.slice(1)
          : 'Kubeconfig'}
      </h3>
      <span
        className="text-xs mt-2 px-3 py-1 rounded-full"
        style={{
          backgroundColor: iconCfg?.bg ?? 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
          border: `1px solid color-mix(in srgb, ${iconCfg?.color ?? 'var(--color-accent)'} 15%, transparent)`,
          color: iconCfg?.color ?? 'var(--color-accent)',
        }}
      >
        {PROVIDER_FULL_LABELS[provider] ?? 'Kubernetes Cluster'}
      </span>
    </>
  )
}

/** Step 3: Connection ring animation */
function Step3Content({
  validationState,
  reduced,
}: {
  validationState: 'idle' | 'testing' | 'success' | 'error'
  reduced: boolean
}) {
  const isSuccess = validationState === 'success'
  const isError = validationState === 'error'
  const ringColor = isSuccess
    ? 'var(--wizard-ring-success)'
    : isError
      ? 'var(--wizard-ring-error)'
      : 'var(--wizard-ring-color)'

  return (
    <>
      <div className="relative" style={{ width: 120, height: 120 }}>
        {[0, 15, 30].map((inset, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              inset: `${inset}px`,
              border: `2px solid color-mix(in srgb, ${ringColor} 40%, transparent)`,
              animation: reduced || isSuccess || isError
                ? 'none'
                : `wizard-ring-pulse 2s ease-in-out ${i * 0.4}s infinite`,
              transition: 'border-color 0.3s ease',
            }}
          />
        ))}
        <div
          className="absolute rounded-full flex items-center justify-center"
          style={{
            inset: '42px',
            backgroundColor: `color-mix(in srgb, ${ringColor} 12%, transparent)`,
            border: `2px solid color-mix(in srgb, ${ringColor} 30%, transparent)`,
            transition: 'all 0.3s ease',
          }}
        >
          {isSuccess ? (
            <SuccessCheck size={20} className="text-[var(--color-status-active)]" />
          ) : isError ? (
            <XCircle className="h-5 w-5 text-[var(--color-status-error)]" />
          ) : (
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: 'var(--color-accent)' }}
            />
          )}
        </div>
      </div>
      <p className="text-sm text-[var(--color-text-muted)] mt-4">
        {isSuccess
          ? 'Connected!'
          : isError
            ? 'Connection failed'
            : 'Establishing connection...'}
      </p>
    </>
  )
}

/** Step 4: Review summary card */
function Step4Content({
  provider,
  clusterName,
  endpoint,
  environment,
  reduced,
}: {
  provider: string
  clusterName: string
  endpoint: string
  environment: string
  reduced: boolean
}) {
  const rows = [
    { label: 'Provider', value: provider },
    { label: 'Status', value: 'Connected', isStatus: true },
    { label: 'Endpoint', value: endpoint, isSmall: true },
    { label: 'Environment', value: environment.charAt(0).toUpperCase() + environment.slice(1) },
  ]

  return (
    <motion.div
      className="w-full rounded-xl border border-[var(--color-border)] p-5 text-left"
      style={{ background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)' }}
      initial={reduced ? undefined : 'hidden'}
      animate={reduced ? undefined : 'visible'}
      variants={reduced ? undefined : slideUpVariants}
    >
      <div className="text-center mb-4">
        <ProviderLogo provider={provider} size={32} layoutId="wizard-provider-logo" />
        <p className="text-base font-semibold text-[var(--color-text-primary)] mt-2">
          {clusterName || 'New Cluster'}
        </p>
      </div>
      <motion.div
        variants={reduced ? undefined : listContainerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'visible'}
      >
        {rows.map((row) => (
          <motion.div
            key={row.label}
            variants={reduced ? undefined : listItemVariants}
            className="flex justify-between items-center py-2 text-sm"
            style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-text-primary) 5%, transparent)' }}
          >
            <span className="text-[var(--color-text-muted)]">{row.label}</span>
            {row.isStatus ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-status-active) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-status-active) 20%, transparent)',
                  color: 'var(--color-status-active)',
                }}
              >
                <CheckCircle2 className="h-3 w-3" />
                {row.value}
              </span>
            ) : (
              <span
                className={`text-[var(--color-text-primary)] font-medium ${row.isSmall ? 'text-xs max-w-[160px] truncate' : ''}`}
              >
                {row.value}
              </span>
            )}
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/add-cluster/WizardLeftPanel.tsx
git commit -m "feat(wizard): create WizardLeftPanel with adaptive step content"
```

---

### Task 6: Create WizardProviderTiles component

**Files:**
- Create: `apps/web/src/components/add-cluster/WizardProviderTiles.tsx`

- [ ] **Step 1: Create the component**

Full-bleed selectable tiles with brand-color background tint, left accent bar with glow, and bouncy checkmark on selection.

```tsx
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { badgePopVariants, DURATION } from '@/lib/animation-constants'
import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
import { CLUSTER_PROVIDERS, type ProviderId } from './wizard-types'
import { resolveProviderIconKey } from './wizard-types'

interface WizardProviderTilesProps {
  provider: ProviderId
  onSelect: (id: ProviderId) => void
}

export function WizardProviderTiles({ provider, onSelect }: WizardProviderTilesProps) {
  const reduced = useReducedMotion()

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Cluster provider">
      {CLUSTER_PROVIDERS.map((p) => {
        const isSelected = provider === p.id
        const iconKey = resolveProviderIconKey(p.id)
        const iconConfig = PROVIDER_ICONS[iconKey]
        const brandColor = iconConfig?.color ?? '#9CA3AF'

        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(p.id)}
            className="relative flex items-center gap-3.5 rounded-xl border text-left cursor-pointer"
            style={{
              padding: '14px 16px',
              background: isSelected
                ? `color-mix(in srgb, ${brandColor} 5%, transparent)`
                : 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)',
              borderColor: isSelected ? 'transparent' : 'var(--color-border)',
              transition: `all ${DURATION.fast}s ease`,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'var(--color-bg-card-hover)'
                e.currentTarget.style.borderColor = 'var(--color-border-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
              }
            }}
          >
            {/* Left accent bar */}
            {isSelected && (
              <span
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                style={{
                  background: brandColor,
                  boxShadow: `0 0 8px color-mix(in srgb, ${brandColor} 50%, transparent)`,
                }}
              />
            )}

            <ProviderLogo provider={p.id} size={24} />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{p.label}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{p.subtitle}</p>
            </div>

            {/* Radio indicator / checkmark */}
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 22,
                height: 22,
                border: isSelected ? 'none' : '2px solid var(--color-border)',
                background: isSelected ? 'var(--color-status-active)' : 'transparent',
                boxShadow: isSelected
                  ? '0 0 10px color-mix(in srgb, var(--color-status-active) 30%, transparent)'
                  : 'none',
                transition: `all ${DURATION.fast}s ease`,
              }}
            >
              <AnimatePresence>
                {isSelected && (
                  <motion.svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    initial={reduced ? undefined : 'hidden'}
                    animate={reduced ? undefined : 'visible'}
                    exit={reduced ? undefined : 'exit'}
                    variants={reduced ? undefined : badgePopVariants}
                  >
                    <path
                      d="M5 13l4 4L19 7"
                      fill="none"
                      stroke="#fff"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                )}
              </AnimatePresence>
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/add-cluster/WizardProviderTiles.tsx
git commit -m "feat(wizard): create WizardProviderTiles with brand-color accents"
```

---

### Task 7: Create WizardCredentialForm component

**Files:**
- Create: `apps/web/src/components/add-cluster/WizardCredentialForm.tsx`

This extracts the Step 2 credential forms and FileDrop from the current monolith. All form logic and provider-specific fields move here.

- [ ] **Step 1: Create the component**

Move `FileDrop` and all provider credential form JSX from the current `AddClusterWizard.tsx` (lines 80-154 for `FileDrop`, lines 512-756 for the step 2 form content). Key changes from original:

1. `FileDrop` is defined inside this file (no longer in the parent)
2. Inputs use focus glow via inline style: `onFocus` adds `box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, transparent)`, `onBlur` removes it
3. The detection banner stays in this component
4. All props (state values and setters) are passed from the orchestrator

The component signature:

```tsx
'use client'

import { UploadCloud } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import {
  PROVIDER_LABELS,
  type DetectionResult,
} from '@voyager/config/providers'
import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
import { DURATION } from '@/lib/animation-constants'
import type { ProviderId } from './wizard-types'

const inputClass =
  'w-full px-3 py-2.5 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors'

const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024

// ... FileDrop component (same logic as current, same props interface)
// ... WizardCredentialForm component with all provider-specific form fields
```

The full implementation is a direct extraction from `AddClusterWizard.tsx` lines 80-756 with these modifications:
- Add focus glow handler to each `<input>` and `<textarea>`:
  ```tsx
  onFocus={(e) => {
    e.currentTarget.style.borderColor = 'var(--color-accent)'
    e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, transparent)'
  }}
  onBlur={(e) => {
    e.currentTarget.style.borderColor = 'var(--color-border)'
    e.currentTarget.style.boxShadow = 'none'
    // existing onBlur touch tracking goes here too
  }}
  ```
- Replace `cardClass` variable with inline: `rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 text-left transition-colors`

Props interface receives all the state values and setters from the orchestrator:

```tsx
interface WizardCredentialFormProps {
  provider: ProviderId
  // kubeconfig
  kubeFile: File | null
  onKubeFile: (f: File | null) => void
  kubeText: string
  onKubeText: (v: string) => void
  // aws
  awsAccessKey: string; onAwsAccessKey: (v: string) => void
  awsSecretKey: string; onAwsSecretKey: (v: string) => void
  awsRegion: string; onAwsRegion: (v: string) => void
  awsEndpoint: string; onAwsEndpoint: (v: string) => void
  // azure
  azureSubscriptionId: string; onAzureSubscriptionId: (v: string) => void
  azureResourceGroup: string; onAzureResourceGroup: (v: string) => void
  azureClusterName: string; onAzureClusterName: (v: string) => void
  // gke
  gkeServiceAccountJson: string; onGkeServiceAccountJson: (v: string) => void
  gkeEndpoint: string; onGkeEndpoint: (v: string) => void
  // minikube
  minikubeCaCert: File | null; onMinikubeCaCert: (f: File | null) => void
  minikubeClientCert: File | null; onMinikubeClientCert: (f: File | null) => void
  minikubeClientKey: File | null; onMinikubeClientKey: (f: File | null) => void
  minikubeEndpoint: string; onMinikubeEndpoint: (v: string) => void
  // validation
  detectionResult: DetectionResult | null
  uploadError: string | null
  onUploadError: (v: string | null) => void
  touched: Record<string, boolean>
  onTouch: (field: string) => void
  submitAttempted: boolean
  step2Valid: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/add-cluster/WizardCredentialForm.tsx
git commit -m "feat(wizard): create WizardCredentialForm with focus glow and provider forms"
```

---

### Task 8: Create WizardValidation component

**Files:**
- Create: `apps/web/src/components/add-cluster/WizardValidation.tsx`

- [ ] **Step 1: Create the component**

Step-by-step progress ticker with cosmetic sub-steps timed to give progress feedback while the real validation call runs.

```tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Circle, Loader2 } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  listContainerVariants,
  listItemVariants,
  DURATION,
} from '@/lib/animation-constants'
import { SuccessCheck } from '@/components/animations/SuccessCheck'

const VALIDATION_STEPS = [
  'Resolving endpoint',
  'Testing TLS handshake',
  'Authenticating credentials',
  'Fetching cluster metadata',
  'Verifying API access',
]

// Cosmetic timing: advance one sub-step every 600ms
const STEP_INTERVAL_MS = 600

interface WizardValidationProps {
  validationState: 'idle' | 'testing' | 'success' | 'error'
  validationError: string
}

export function WizardValidation({ validationState, validationError }: WizardValidationProps) {
  const reduced = useReducedMotion()
  const [cosmeticStep, setCosmeticStep] = useState(0)

  // Advance cosmetic sub-steps while testing
  useEffect(() => {
    if (validationState !== 'testing') return
    setCosmeticStep(0)
    const timer = setInterval(() => {
      setCosmeticStep((prev) => {
        // Stop at second-to-last — last step completes when real validation resolves
        if (prev >= VALIDATION_STEPS.length - 2) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, STEP_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [validationState])

  // When validation completes (success or error), mark all steps done
  const allDone = validationState === 'success'
  const failed = validationState === 'error'

  return (
    <div aria-live="polite">
      <motion.div
        className="flex flex-col gap-0.5"
        variants={reduced ? undefined : listContainerVariants}
        initial={reduced ? undefined : 'hidden'}
        animate={reduced ? undefined : 'visible'}
      >
        {VALIDATION_STEPS.map((label, i) => {
          const isDone = allDone || (validationState === 'testing' && i < cosmeticStep)
          const isActive = !allDone && !failed && validationState === 'testing' && i === cosmeticStep
          const isPending = !isDone && !isActive

          return (
            <motion.div
              key={label}
              variants={reduced ? undefined : listItemVariants}
              className="flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm"
              style={{
                color: isDone
                  ? 'var(--color-status-active)'
                  : isActive
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-muted)',
                background: isActive
                  ? 'color-mix(in srgb, var(--color-accent) 5%, transparent)'
                  : 'transparent',
                opacity: isPending ? 0.4 : 1,
                transition: `all ${DURATION.normal}s ease`,
              }}
            >
              <div
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  background: isDone
                    ? 'color-mix(in srgb, var(--color-status-active) 15%, transparent)'
                    : isActive
                      ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                      : 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
                }}
              >
                {isDone ? (
                  <SuccessCheck size={14} className="text-[var(--color-status-active)]" />
                ) : isActive ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    style={{ color: 'var(--color-accent)' }}
                  />
                ) : (
                  <Circle className="h-3 w-3" style={{ color: 'var(--color-text-dim)' }} />
                )}
              </div>
              <span>{label}</span>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Error message */}
      {failed && (
        <p className="text-sm mt-3 px-3 text-[var(--color-status-error)]">
          {validationError || 'Connection test failed. Check credentials and retry.'}
        </p>
      )}

      {/* Success message */}
      {allDone && (
        <p className="text-sm mt-3 px-3 text-[var(--color-status-active)]">
          Connection test passed. Ready to continue.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/add-cluster/WizardValidation.tsx
git commit -m "feat(wizard): create WizardValidation with progress ticker"
```

---

### Task 9: Create WizardReview component

**Files:**
- Create: `apps/web/src/components/add-cluster/WizardReview.tsx`

- [ ] **Step 1: Create the component**

Extract Step 4 content — summary section + environment/name form.

```tsx
'use client'

import { ProviderLogo, PROVIDER_ICONS } from '@/components/ProviderLogo'
import { CheckCircle2 } from 'lucide-react'
import { DURATION } from '@/lib/animation-constants'
import type { ProviderId, Environment } from './wizard-types'
import { resolveProviderIconKey } from './wizard-types'

const inputClass =
  'w-full px-3 py-2.5 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors'

interface WizardReviewProps {
  provider: ProviderId
  detectedProvider: string | null
  currentProviderLabel: string
  detectedLabel: string | null
  endpoint: string
  endpointValid: boolean
  environment: Environment
  onEnvironment: (env: Environment) => void
  nameOverride: string
  onNameOverride: (name: string) => void
  suggestedName: string
}

export function WizardReview({
  provider,
  detectedProvider,
  currentProviderLabel,
  detectedLabel,
  endpoint,
  endpointValid,
  environment,
  onEnvironment,
  nameOverride,
  onNameOverride,
  suggestedName,
}: WizardReviewProps) {
  const displayProvider = detectedProvider ?? provider

  return (
    <div className="space-y-4">
      {/* Connection summary */}
      <div
        className="rounded-xl border border-[var(--color-border)] p-4 flex flex-col gap-2.5"
        style={{ background: 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)' }}
      >
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Provider</span>
          <span className="text-[var(--color-text-primary)] font-medium flex items-center gap-2">
            <ProviderLogo provider={displayProvider} size={16} />
            {detectedLabel ?? currentProviderLabel}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Endpoint</span>
          <span className="text-[var(--color-text-primary)] text-xs font-medium max-w-[280px] truncate">
            {endpoint}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">Connection</span>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--color-status-active)' }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verified
          </span>
        </div>
      </div>

      {/* Environment + Name form */}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
            Environment
          </label>
          <select
            value={environment}
            onChange={(e) => onEnvironment(e.target.value as Environment)}
            className={inputClass}
            style={{ appearance: 'auto' }}
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
            Cluster Name
          </label>
          <input
            value={nameOverride}
            onChange={(e) => onNameOverride(e.target.value)}
            placeholder={`Default: ${suggestedName}`}
            className={inputClass}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, transparent)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            Leave blank to use: {suggestedName}
          </p>
        </div>
      </div>

      {!endpointValid && (
        <p className="text-xs text-[var(--color-status-error)]">
          Enter a valid endpoint URL (e.g., https://api.example.com:6443)
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/add-cluster/WizardReview.tsx
git commit -m "feat(wizard): create WizardReview with summary and name form"
```

---

### Task 10: Create new AddClusterWizard orchestrator

**Files:**
- Create: `apps/web/src/components/add-cluster/AddClusterWizard.tsx`
- Delete: `apps/web/src/components/AddClusterWizard.tsx` (old monolith)
- Modify: `apps/web/src/app/clusters/page.tsx:7` (update import path)

This is the main orchestrator that holds all state and composes the sub-components into the two-panel layout.

- [ ] **Step 1: Create the new orchestrator**

The new file at `apps/web/src/components/add-cluster/AddClusterWizard.tsx` retains:
- All state (`useState` calls from the original lines 157-191)
- All computed values (`useMemo` for `kubeParsedName`, `detectionResult`, `suggestedName`, `computedEndpoint`, `endpointValid`, `step2Valid`, `canGoNext`)
- All effects (`useEffect` for kubeFile reading, secret cleanup, validation runner)
- `buildConnectionConfig()` and `submit()` functions
- Re-exports types from `wizard-types.ts`: `export { type AddClusterWizardPayload, CLUSTER_PROVIDERS, type ProviderId, type Environment } from './wizard-types'`

The props interface is identical to the current wizard:
```tsx
interface AddClusterWizardProps {
  pending: boolean
  onCancel: () => void
  onSubmit: (payload: AddClusterWizardPayload) => void
}
```

The JSX changes to the two-panel layout:

```tsx
// Imports for sub-components
import { WizardLeftPanel } from './WizardLeftPanel'
import { WizardProviderTiles } from './WizardProviderTiles'
import { WizardCredentialForm } from './WizardCredentialForm'
import { WizardValidation } from './WizardValidation'
import { WizardReview } from './WizardReview'
import { WizardStepDots } from './WizardStepDots'

// Step labels for the right panel header
const STEP_LABELS: Record<number, string> = {
  1: 'Choose Provider',
  2: '', // Dynamic — set based on provider
  3: 'Validating Connection',
  4: 'Review & Name',
}

// In the return JSX:
return (
  <div className="flex min-h-[480px] max-h-[80vh]">
    {/* Left Panel */}
    <WizardLeftPanel
      step={step}
      provider={provider}
      validationState={validationState}
      clusterName={finalName}
      endpoint={computedEndpoint}
      environment={environment}
      detectedProvider={detectionResult?.provider ?? null}
    />

    {/* Right Panel */}
    <div className="flex-1 flex flex-col p-7">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Add Cluster
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close dialog"
          className="flex items-center justify-center h-8 w-8 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card-hover)] transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step dots for mobile (shown below 640px when left panel is hidden) */}
      <div className="sm:hidden flex justify-center mb-4">
        <WizardStepDots currentStep={step} totalSteps={4} />
      </div>

      {/* Step label */}
      <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
        {step === 2 ? `${currentProvider.label} Credentials` : STEP_LABELS[step]}
      </p>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduced ? undefined : 'hidden'}
            animate={reduced ? undefined : 'visible'}
            exit={reduced ? undefined : 'exit'}
            variants={reduced ? undefined : slideUpVariants}
          >
            {step === 1 && (
              <WizardProviderTiles provider={provider} onSelect={setProvider} />
            )}
            {step === 2 && (
              <WizardCredentialForm
                provider={provider}
                kubeFile={kubeFile} onKubeFile={setKubeFile}
                kubeText={kubeText} onKubeText={setKubeText}
                awsAccessKey={awsAccessKey} onAwsAccessKey={setAwsAccessKey}
                awsSecretKey={awsSecretKey} onAwsSecretKey={setAwsSecretKey}
                awsRegion={awsRegion} onAwsRegion={setAwsRegion}
                awsEndpoint={awsEndpoint} onAwsEndpoint={setAwsEndpoint}
                azureSubscriptionId={azureSubscriptionId} onAzureSubscriptionId={setAzureSubscriptionId}
                azureResourceGroup={azureResourceGroup} onAzureResourceGroup={setAzureResourceGroup}
                azureClusterName={azureClusterName} onAzureClusterName={setAzureClusterName}
                gkeServiceAccountJson={gkeServiceAccountJson} onGkeServiceAccountJson={setGkeServiceAccountJson}
                gkeEndpoint={gkeEndpoint} onGkeEndpoint={setGkeEndpoint}
                minikubeCaCert={minikubeCaCert} onMinikubeCaCert={setMinikubeCaCert}
                minikubeClientCert={minikubeClientCert} onMinikubeClientCert={setMinikubeClientCert}
                minikubeClientKey={minikubeClientKey} onMinikubeClientKey={setMinikubeClientKey}
                minikubeEndpoint={minikubeEndpoint} onMinikubeEndpoint={setMinikubeEndpoint}
                detectionResult={detectionResult}
                uploadError={uploadError} onUploadError={setUploadError}
                touched={touched}
                onTouch={(field) => setTouched((t) => ({ ...t, [field]: true }))}
                submitAttempted={submitAttempted}
                step2Valid={step2Valid}
              />
            )}
            {step === 3 && (
              <WizardValidation
                validationState={validationState}
                validationError={validationError}
              />
            )}
            {step === 4 && (
              <WizardReview
                provider={provider}
                detectedProvider={detectionResult?.provider ?? null}
                currentProviderLabel={currentProvider.label}
                detectedLabel={detectionResult?.label ?? null}
                endpoint={computedEndpoint}
                endpointValid={endpointValid}
                environment={environment}
                onEnvironment={setEnvironment}
                nameOverride={nameOverride}
                onNameOverride={setNameOverride}
                suggestedName={suggestedName}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)] mt-4">
        <button ...ghost button (same as current)... />
        <motion.button
          whileHover={reduced ? undefined : buttonHover}
          whileTap={reduced ? undefined : buttonTap}
          ...primary button (same logic as current)...
        />
      </div>
    </div>
  </div>
)
```

The full file includes all the state management code extracted from the original (lines 156-448 of the old file) plus the new layout JSX above.

- [ ] **Step 2: Delete the old monolith**

```bash
rm apps/web/src/components/AddClusterWizard.tsx
```

- [ ] **Step 3: Update the import in clusters page**

In `apps/web/src/app/clusters/page.tsx` line 7, change:

```tsx
// Before:
import { AddClusterWizard, type AddClusterWizardPayload } from '@/components/AddClusterWizard'

// After:
import { AddClusterWizard, type AddClusterWizardPayload } from '@/components/add-cluster/AddClusterWizard'
```

- [ ] **Step 4: Update Dialog usage in clusters page**

In `apps/web/src/app/clusters/page.tsx` around line 643, change the Dialog to use `size="xl"` and remove the `title` prop (wizard has its own header):

```tsx
// Before:
<Dialog open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Cluster">

// After:
<Dialog open={showAddModal} onClose={() => setShowAddModal(false)} size="xl">
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(wizard): rewrite AddClusterWizard as two-panel split layout

Decompose monolithic 883-line component into focused sub-components:
- WizardLeftPanel: adaptive illustration per step
- WizardProviderTiles: full-bleed tiles with brand-color accents
- WizardCredentialForm: provider-specific forms with focus glow
- WizardValidation: progress ticker with cosmetic sub-steps
- WizardReview: summary + name/env form
- WizardStepDots: step indicator

All animations use animation-constants.ts variants.
All colors use CSS custom properties from globals.css."
```

---

### Task 11: Update E2E test selectors

**Files:**
- Modify: `tests/e2e/clusters.spec.ts:8-21`

The E2E test at line 8-21 checks the wizard flow. Selectors need updating because:
1. `Step 1/4` text no longer exists (we removed the inline step counter)
2. Provider tiles use `role="radio"` (same as before — no change needed there)
3. `Step 2/4` text no longer exists

- [ ] **Step 1: Update the E2E test**

```ts
test('should open add-cluster wizard and block progress without kubeconfig', async ({ page }) => {
  await page.goto('/clusters');
  await page.getByRole('button', { name: /add cluster/i }).first().click();

  // Wizard opens — check for the heading in the right panel
  await expect(page.getByRole('heading', { name: /add cluster/i })).toBeVisible();
  // Step label is visible
  await expect(page.getByText(/choose provider/i)).toBeVisible();
  // Kubeconfig is selected by default
  await expect(page.getByRole('radio', { name: /kubeconfig/i })).toBeChecked();

  // Click Next to go to step 2
  await page.getByRole('button', { name: /next/i }).click();
  // Step 2 shows credential label
  await expect(page.getByText(/kubeconfig credentials/i)).toBeVisible();

  // Next should be disabled without credentials
  await expect(page.getByRole('button', { name: /go to next step|next/i })).toBeDisabled();
  await expect(page.getByText(/fill the required credential fields to continue/i)).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test to verify**

Run: `pnpm test:e2e -- --grep "add-cluster wizard"`
Expected: PASS (or skip if no dev servers running — the selectors are structurally correct)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/clusters.spec.ts
git commit -m "test(e2e): update add-cluster wizard selectors for redesign"
```

---

### Task 12: Verify build and visual check

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: All pages compile successfully

- [ ] **Step 3: Start dev servers and visual verify**

Run: `pnpm dev`

Open `http://localhost:3000/clusters`, click "Add Cluster", and verify:
1. Two-panel layout renders (left panel with floating logos, right panel with tiles)
2. Selecting a provider shows brand-color tint + accent bar + bouncy checkmark
3. Click Next → Step 2: left panel shows hero provider logo, right panel shows credential form with focus glows
4. Click Next → Step 3: left panel shows pulsing rings, right panel shows progress ticker
5. Step 4: left panel shows review card, right panel shows summary + name form
6. Both light and dark themes work
7. Resize to < 640px: left panel hides, step dots appear at top of right panel

- [ ] **Step 4: Commit any fixes discovered during verification**

Only if needed. If everything works, skip this step.
